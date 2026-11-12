// Map-scaled trees for Maps+.
// Fill patterns stay the same size on screen at every zoom, so patterned trees look giant when zoomed out
// and tiny when zoomed in. Instead, this places individual tree icons on a fixed real-world grid inside
// woodland areas and sizes them in meters, so they grow and shrink with the map like buildings do.
// Usage: const trees = Trees.attach(map, { icons: [ImageData 16x16, ...], beforeId: 'water-name' });
//        trees.setIcons([...])  // e.g. when switching themes
(() => {
  const MIN_ZOOM = 15;        // MapLibre zoom; below this woods use a flat forest texture instead
  const SPACING_M = 13;       // distance between tree spots
  const CANOPY_M = 11;        // tree width on the ground
  const MAX_TREES = 9000;     // safety cap per view
  const SCALE = 4;            // icons are upscaled 4x (nearest neighbor) so they stay crisp when enlarged
  const EMPTY = { type: 'FeatureCollection', features: [] };

  // Deterministic 0..1 noise per grid cell, so trees never jump around between redraws.
  function hash(i, j, salt) {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function inRing(x, y, ring) {
    let inside = false;
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a], [xb, yb] = ring[b];
      if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
    return inside;
  }
  function inPolygon(x, y, rings) {
    if (!inRing(x, y, rings[0])) return false;
    for (let k = 1; k < rings.length; k++) if (inRing(x, y, rings[k])) return false;   // holes
    return true;
  }

  function upscale(img) {
    const out = new ImageData(img.width * SCALE, img.height * SCALE);
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const s = ((y / SCALE | 0) * img.width + (x / SCALE | 0)) * 4, d = (y * out.width + x) * 4;
        out.data[d] = img.data[s]; out.data[d + 1] = img.data[s + 1]; out.data[d + 2] = img.data[s + 2]; out.data[d + 3] = img.data[s + 3];
      }
    }
    return out;
  }

  function attach(map, opts) {
    let icons = (opts.icons || []).map(upscale);
    let gen = 0;                                  // bumps on every theme change so image ids never collide
    const beforeId = opts.beforeId;
    const ids = () => icons.map((_, k) => `tree-${gen}-${k}`);

    // icon-size so one icon (16 px at size 1, after pixelRatio) spans CANOPY_M meters on the ground.
    // MapLibre (512 px tiles): meters per pixel = 78271.517 * cos(lat) / 2^zoom.
    function sizeExpr(lat) {
      const at = (z) => (CANOPY_M * Math.pow(2, z)) / (78271.517 * Math.cos(lat * Math.PI / 180) * 16);
      return ['interpolate', ['exponential', 2], ['zoom'], MIN_ZOOM, at(MIN_ZOOM), 22, at(22)];
    }
    let sizeLat = map.getCenter().lat;

    function ensureLayer() {
      if (!map.isStyleLoaded() && !map.getStyle()) return;
      ids().forEach((id, k) => { if (!map.hasImage(id)) map.addImage(id, icons[k], { pixelRatio: SCALE }); });
      if (!map.getSource('trees')) map.addSource('trees', { type: 'geojson', data: EMPTY });
      if (map.getLayer('trees')) map.removeLayer('trees');
      const list = ids();
      const iconImage = list.length > 1
        ? ['match', ['get', 'v'], ...list.slice(0, -1).flatMap((id, k) => [k, id]), list[list.length - 1]]
        : list[0];
      map.addLayer({
        id: 'trees', type: 'symbol', source: 'trees', minzoom: MIN_ZOOM,
        layout: {
          'icon-image': iconImage, 'icon-size': sizeExpr(sizeLat), 'icon-anchor': 'bottom',
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'symbol-sort-key': ['get', 'k'],                 // southern trees drawn last, over northern ones
        },
      }, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
      regenerate();
    }

    function regenerate() {
      const src = map.getSource('trees'); if (!src) return;
      if (map.getZoom() < MIN_ZOOM || !icons.length) { src.setData(EMPTY); return; }
      const c = map.getCenter();
      if (Math.abs(c.lat - sizeLat) > 0.5 && map.getLayer('trees')) {
        sizeLat = c.lat; map.setLayoutProperty('trees', 'icon-size', sizeExpr(sizeLat));
      }
      const b = map.getBounds();
      const padLat = (b.getNorth() - b.getSouth()) * 0.3, padLng = (b.getEast() - b.getWest()) * 0.3;
      const view = [b.getWest() - padLng, b.getSouth() - padLat, b.getEast() + padLng, b.getNorth() + padLat];

      // Fixed grid in degrees (longitude step uses the whole-degree latitude band so it is stable).
      const dLat = SPACING_M / 111320;
      const dLng = SPACING_M / (111320 * Math.cos(Math.round(c.lat) * Math.PI / 180));

      const polys = [];
      map.querySourceFeatures('omt', { sourceLayer: 'landcover', filter: ['==', ['get', 'class'], 'wood'] }).forEach((f) => {
        const g = f.geometry;
        (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).forEach((rings) => {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          rings[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
          if (x1 < view[0] || x0 > view[2] || y1 < view[1] || y0 > view[3]) return;
          polys.push({ rings, x0: Math.max(x0, view[0]), y0: Math.max(y0, view[1]), x1: Math.min(x1, view[2]), y1: Math.min(y1, view[3]) });
        });
      });

      const seen = new Set(), features = [];
      for (const p of polys) {
        for (let i = Math.floor(p.y0 / dLat); i <= Math.ceil(p.y1 / dLat); i++) {
          for (let j = Math.floor(p.x0 / dLng); j <= Math.ceil(p.x1 / dLng); j++) {
            const key = i + ',' + j; if (seen.has(key)) continue;
            const lat = (i + 0.5 + (hash(i, j, 1) - 0.5) * 0.7) * dLat;
            const lng = (j + 0.5 + (hash(i, j, 2) - 0.5) * 0.7) * dLng;
            if (!inPolygon(lng, lat, p.rings)) continue;
            seen.add(key);
            features.push({ type: 'Feature', properties: { v: Math.floor(hash(i, j, 3) * icons.length), k: -lat },
                            geometry: { type: 'Point', coordinates: [lng, lat] } });
            if (features.length >= MAX_TREES) break;
          }
          if (features.length >= MAX_TREES) break;
        }
        if (features.length >= MAX_TREES) break;
      }
      src.setData({ type: 'FeatureCollection', features });
    }

    let timer = 0;
    const soon = () => { clearTimeout(timer); timer = setTimeout(regenerate, 200); };
    map.on('style.load', ensureLayer);
    map.on('moveend', soon);
    map.on('sourcedata', (e) => { if (e.sourceId === 'omt' && e.isSourceLoaded) soon(); });
    if (map.isStyleLoaded()) ensureLayer();

    return {
      setIcons(newIcons) { icons = newIcons.map(upscale); gen++; if (map.isStyleLoaded()) ensureLayer(); },
      regenerate,
    };
  }

  window.Trees = { attach, MIN_ZOOM };
})();
