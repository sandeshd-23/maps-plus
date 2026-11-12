// Small geometry helpers for Maps+ (meters, bearings, distance to a route line).
// Exposes window.Geo.
(() => {
  const R = 6371008.8;
  const rad = (d) => d * Math.PI / 180;

  // Great-circle distance in meters between {lat,lng} points.
  function dist(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Compass bearing in degrees (0 = north, 90 = east) from a to b.
  function bearing(a, b) {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // Shortest distance (m) from point p to a polyline given as [[lng,lat], ...], plus how far along it that is.
  // Uses a local flat projection around p, which is accurate for city-scale distances.
  function toLine(p, coords) {
    if (!coords || coords.length === 0) return { dist: Infinity, along: 0 };
    const kx = Math.cos(rad(p.lat)) * 111320, ky = 110540;
    let best = Infinity, bestAlong = 0, along = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const ax = (coords[i][0] - p.lng) * kx, ay = (coords[i][1] - p.lat) * ky;
      const bx = (coords[i + 1][0] - p.lng) * kx, by = (coords[i + 1][1] - p.lat) * ky;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) { best = d; bestAlong = along + t * Math.sqrt(len2); }
      along += Math.sqrt(len2);
    }
    if (coords.length === 1) best = dist(p, { lng: coords[0][0], lat: coords[0][1] });
    return { dist: best, along: bestAlong };
  }

  // Total length (m) of a polyline [[lng,lat], ...].
  function length(coords) {
    let s = 0;
    for (let i = 1; i < coords.length; i++) {
      s += dist({ lng: coords[i - 1][0], lat: coords[i - 1][1] }, { lng: coords[i][0], lat: coords[i][1] });
    }
    return s;
  }

  // Point at a given distance (m) along a polyline, plus the segment's bearing there.
  function atDistance(coords, d) {
    let acc = 0;
    for (let i = 1; i < coords.length; i++) {
      const a = { lng: coords[i - 1][0], lat: coords[i - 1][1] }, b = { lng: coords[i][0], lat: coords[i][1] };
      const seg = dist(a, b);
      if (acc + seg >= d && seg > 0) {
        const t = (d - acc) / seg;
        return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t, bearing: bearing(a, b) };
      }
      acc += seg;
    }
    const n = coords.length - 1, last = { lng: coords[n][0], lat: coords[n][1] };
    return { ...last, bearing: n > 0 ? bearing({ lng: coords[n - 1][0], lat: coords[n - 1][1] }, last) : 90 };
  }

  window.Geo = { dist, bearing, toLine, length, atDistance };
})();
