// Reads OpenFreeMap vector tiles directly (the same files the game map uses, so usually already cached) to
// count every place in a whole area, not just the part of the map on screen. Tiny built-in decoder for the
// two layers we need ("poi" and "place", point features only); no libraries.
// Exposes window.AreaData = { load(lat, lng, rings, template) -> Promise<{ pois, places }> }
//   pois:   [{ lng, lat, name, class, subclass, rank }],  places: [{ lng, lat, name, class, rank }]
(() => {
  const Z = 14;                                   // the most detailed level the tiles have
  const cache = new Map();                        // "x/y" -> Promise<{ pois, places }>

  // ---- minimal protobuf reader ----
  function reader(buf) {
    let pos = 0;
    const varint = () => {
      let v = 0, shift = 0, b;
      do { b = buf[pos++]; v += (b & 0x7f) * Math.pow(2, shift); shift += 7; } while (b & 0x80);
      return v;
    };
    return {
      get pos() { return pos; }, set pos(p) { pos = p; }, end: buf.length, varint,
      bytes() { const n = varint(), s = pos; pos += n; return [s, pos]; },
      skip(type) { if (type === 0) varint(); else if (type === 1) pos += 8; else if (type === 2) { const n = varint(); pos += n; } else if (type === 5) pos += 4; },
    };
  }
  const utf8 = new TextDecoder();
  function readValue(buf, s, e) {
    const r = reader(buf); r.pos = s; let v = null;
    while (r.pos < e) {
      const tag = r.varint(), f = tag >> 3, t = tag & 7;
      if (f === 1) { const [a, b] = r.bytes(); v = utf8.decode(buf.subarray(a, b)); }
      else if (f === 2) { v = new DataView(buf.buffer, buf.byteOffset + r.pos, 4).getFloat32(0, true); r.pos += 4; }
      else if (f === 3) { v = new DataView(buf.buffer, buf.byteOffset + r.pos, 8).getFloat64(0, true); r.pos += 8; }
      else if (f === 4 || f === 5) v = r.varint();
      else if (f === 6) { const n = r.varint(); v = (n % 2) ? -(n + 1) / 2 : n / 2; }
      else if (f === 7) v = !!r.varint();
      else r.skip(t);
    }
    return v;
  }
  function packed(buf, s, e) {
    const r = reader(buf); r.pos = s; const out = [];
    while (r.pos < e) out.push(r.varint());
    return out;
  }
  // Decode the wanted layers of one tile into plain point features with properties.
  function decode(buf, x, y, want) {
    const out = {};
    const r = reader(buf);
    while (r.pos < r.end) {
      const tag = r.varint();
      if ((tag >> 3) !== 3 || (tag & 7) !== 2) { r.skip(tag & 7); continue; }
      const [ls, le] = r.bytes();
      const L = reader(buf); L.pos = ls;
      let name = '', extent = 4096; const keys = [], vals = [], feats = [];
      while (L.pos < le) {
        const t = L.varint(), f = t >> 3;
        if (f === 1) { const [a, b] = L.bytes(); name = utf8.decode(buf.subarray(a, b)); }
        else if (f === 2) feats.push(L.bytes());
        else if (f === 3) { const [a, b] = L.bytes(); keys.push(utf8.decode(buf.subarray(a, b))); }
        else if (f === 4) { const [a, b] = L.bytes(); vals.push([a, b]); }
        else if (f === 5) extent = L.varint();
        else L.skip(t & 7);
      }
      if (!want.includes(name)) continue;
      const valCache = new Map();
      const val = (i) => { if (!valCache.has(i)) valCache.set(i, readValue(buf, vals[i][0], vals[i][1])); return valCache.get(i); };
      const list = out[name] = [];
      feats.forEach(([fs, fe]) => {
        const F = reader(buf); F.pos = fs;
        let tags = [], geom = [], type = 0;
        while (F.pos < fe) {
          const t = F.varint(), f = t >> 3;
          if (f === 2) { const [a, b] = F.bytes(); tags = packed(buf, a, b); }
          else if (f === 3) type = F.varint();
          else if (f === 4) { const [a, b] = F.bytes(); geom = packed(buf, a, b); }
          else F.skip(t & 7);
        }
        if (type !== 1 || geom.length < 3) return;          // points only
        const zz = (n) => (n >> 1) ^ (-(n & 1));
        const px = zz(geom[1]), py = zz(geom[2]);
        const n = Math.pow(2, Z);
        const lng = (x + px / extent) / n * 360 - 180;
        const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + py / extent) / n))) * 180 / Math.PI;
        const p = { lng, lat };
        for (let i = 0; i + 1 < tags.length; i += 2) p[keys[tags[i]]] = val(tags[i + 1]);
        list.push(p);
      });
    }
    return out;
  }
  function tileXY(lat, lng) {
    const n = Math.pow(2, Z);
    return [Math.floor((lng + 180) / 360 * n),
            Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n)];
  }
  function loadTile(template, x, y) {
    const k = x + '/' + y;
    if (!cache.has(k)) {
      const url = template.replace('{z}', Z).replace('{x}', x).replace('{y}', y);
      cache.set(k, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => {
        if (!ab) return { poi: [], place: [] };
        const d = decode(new Uint8Array(ab), x, y, ['poi', 'place']);
        return { poi: d.poi || [], place: d.place || [] };
      }).catch(() => { cache.delete(k); return { poi: [], place: [] }; }));
    }
    return cache.get(k);
  }
  // All points within `rings` tiles of the spot (rings 1 = 3x3 tiles, ~7 km across in Bengaluru).
  async function load(lat, lng, rings, template) {
    const [cx, cy] = tileXY(lat, lng), jobs = [];
    for (let dx = -rings; dx <= rings; dx++) for (let dy = -rings; dy <= rings; dy++) jobs.push(loadTile(template, cx + dx, cy + dy));
    const tiles = await Promise.all(jobs);
    return { pois: tiles.flatMap((t) => t.poi), places: tiles.flatMap((t) => t.place) };
  }
  window.AreaData = { load, tileXY, Z };
})();
