// Trip journal for Maps+: every navigation trip is recorded (the path you actually took, distance, time,
// speed, XP) and kept on this device so you can look back and replay it.
// Exposes window.Trips = { start(info), point(pos, accuracy, time), finish(extra) -> trip | null,
//                          list(), get(id), remove(id), current }.
(() => {
  const KEY = 'mapsplus.trips';
  const MAX_TRIPS = 60, MAX_POINTS = 600;
  const MIN_STEP_M = 12;                       // ignore GPS jitter
  let trips = [];
  try { trips = JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) {}
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(trips)); }
    catch (_) { trips = trips.slice(0, Math.floor(trips.length / 2)); try { localStorage.setItem(KEY, JSON.stringify(trips)); } catch (__) {} }
  };
  let cur = null;

  function start(info) {
    cur = { id: Date.now().toString(36), start: Date.now(), end: 0, mode: info.mode, dest: info.dest || '',
            from: info.from || '', xp0: info.xp || 0, xp: 0, dist: 0, maxSpeed: 0, arrived: false, pts: [] };
  }
  // pos = { lat, lng }; points are stored as [lng, lat, seconds since start]
  function point(pos, acc, t) {
    if (!cur || (acc != null && acc > 50)) return;
    const last = cur.pts[cur.pts.length - 1];
    const sec = Math.round(((t || Date.now()) - cur.start) / 1000);
    if (last) {
      const d = Geo.dist({ lng: last[0], lat: last[1] }, pos);
      if (d < MIN_STEP_M || d > 2000) return;     // too small (jitter) or a GPS jump
      cur.dist += d;
      const dt = sec - last[2];
      if (dt > 0) cur.maxSpeed = Math.max(cur.maxSpeed, Math.min(60, d / dt));
    }
    cur.pts.push([+pos.lng.toFixed(5), +pos.lat.toFixed(5), sec]);
  }
  function thin(pts) {
    if (pts.length <= MAX_POINTS) return pts;
    const step = pts.length / MAX_POINTS, out = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) out.push(pts[Math.floor(i * step)]);
    out.push(pts[pts.length - 1]);
    return out;
  }
  // Ends the trip; keeps it if it was a real trip (100 m or a minute of movement).
  function finish(extra = {}) {
    if (!cur) return null;
    const t = cur; cur = null;
    Object.assign(t, extra);
    t.end = Date.now();
    if (t.dist < 100 || t.pts.length < 2) return null;
    t.pts = thin(t.pts);
    t.dist = Math.round(t.dist);
    t.maxSpeed = +t.maxSpeed.toFixed(1);
    trips.unshift(t);
    trips = trips.slice(0, MAX_TRIPS);
    save();
    return t;
  }

  window.Trips = { start, point, finish, list: () => trips.slice(), get: (id) => trips.find((t) => t.id === id),
                   remove(id) { trips = trips.filter((t) => t.id !== id); save(); },
                   get current() { return cur; } };
})();
