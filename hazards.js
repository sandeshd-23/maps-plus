// Hazard pins for Maps+: potholes, waterlogging, speed breakers, bad roads... that you mark yourself.
// Stored only on this device. While navigating, the app warns you before you reach one on your route.
// Exposes window.Hazards = { TYPES, list(), add(type, lat, lng), update(id, type), remove(id), get(id),
//                            geojson(), ahead(pos, routeCoords, course, onRoute) -> hazard to warn about | null,
//                            resetWarnings() }.
(() => {
  const KEY = 'mapsplus.hazards';
  const TYPES = [
    { id: 'pothole', label: 'POTHOLE',       say: 'Pothole ahead' },
    { id: 'flood',   label: 'FLOODED',       say: 'Waterlogging ahead' },
    { id: 'bump',    label: 'SPEED BREAKER', say: 'Speed breaker ahead' },
    { id: 'badroad', label: 'BAD ROAD',      say: 'Bad road ahead' },
    { id: 'caution', label: 'CAUTION',       say: 'Caution ahead' },
  ];
  const WARN_AHEAD_M = 150;     // warn this far before reaching it
  const ON_ROUTE_M = 30;        // how close to the route line a pin must be to count as "on your way"
  const REWARN_MS = 10 * 60 * 1000;

  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) {} };
  const warned = new Map();     // id -> time we last warned

  const type = (id) => TYPES.find((t) => t.id === id) || TYPES[TYPES.length - 1];

  function add(t, lat, lng) {
    const h = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: t,
                lat: +lat.toFixed(6), lng: +lng.toFixed(6), t: Date.now() };
    items.push(h); save(); return h;
  }
  function update(id, t) { const h = get(id); if (h) { h.type = t; save(); } return h; }
  function remove(id) { items = items.filter((h) => h.id !== id); warned.delete(id); save(); }
  function get(id) { return items.find((h) => h.id === id) || null; }

  function geojson() {
    return { type: 'FeatureCollection', features: items.map((h) => ({
      type: 'Feature', properties: { id: h.id, type: h.type, label: type(h.type).label },
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] } })) };
  }

  // The next hazard worth warning about, or null.
  //  - With a route: pins within ON_ROUTE_M of the route line, 0-150 m further along it than you are.
  //  - Without one (just riding around): pins within 80 m roughly in your direction of travel.
  function ahead(pos, routeCoords, course) {
    const now = Date.now();
    const fresh = (h) => !warned.has(h.id) || now - warned.get(h.id) > REWARN_MS;
    let best = null, bestD = Infinity;
    if (routeCoords && routeCoords.length > 1) {
      const me = Geo.toLine(pos, routeCoords);
      items.forEach((h) => {
        if (!fresh(h)) return;
        const on = Geo.toLine(h, routeCoords);
        const d = on.along - me.along;
        if (on.dist <= ON_ROUTE_M && d > 0 && d <= WARN_AHEAD_M && d < bestD) { best = h; bestD = d; }
      });
    } else if (course != null) {
      items.forEach((h) => {
        if (!fresh(h)) return;
        const d = Geo.dist(pos, h);
        if (d > 80 || d < 5) return;
        const diff = Math.abs(((Geo.bearing(pos, h) - course + 540) % 360) - 180);
        if (diff <= 35 && d < bestD) { best = h; bestD = d; }
      });
    }
    if (best) warned.set(best.id, now);
    return best ? { ...best, ...type(best.type), meters: Math.round(bestD) } : null;
  }

  window.Hazards = { TYPES, type, list: () => items.slice(), add, update, remove, get, geojson, ahead,
                     resetWarnings: () => warned.clear() };
})();
