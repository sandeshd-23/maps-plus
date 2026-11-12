// XP, levels and badges for Maps+. Everything is stored only on this device (localStorage).
// Exposes window.Progress = { state, level(), levelInfo(), BADGES, addDistance(), visitCell(), award(), on(cb), ... }.
(() => {
  const KEY = 'mapsplus.progress';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (_) { return null; } };
  const state = Object.assign({
    xp: 0,
    km: { WALK: 0, TWO_WHEELER: 0, DRIVE: 0, TRANSIT: 0 },
    badges: {},          // id -> ISO date earned
    parks: [],           // names of parks visited
    landmarks: [],       // ids of landmarks visited
    cells: 0,            // map squares visited (about 110 m each)
    trips: 0, transitTrips: 0,
  }, load() || {});
  state.km = Object.assign({ WALK: 0, TWO_WHEELER: 0, DRIVE: 0, TRANSIT: 0 }, state.km);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} };

  // XP per km by travel mode (walking and cycling are worth the most).
  const XP_PER_KM = { WALK: 20, TWO_WHEELER: 12, DRIVE: 3, TRANSIT: 5 };
  const totalKm = () => Object.values(state.km).reduce((a, b) => a + b, 0);

  // Level n needs 50 * (n-1)^2 XP: quick early levels, slower later.
  const level = () => Math.floor(Math.sqrt(state.xp / 50)) + 1;
  function levelInfo() {
    const lv = level(), from = 50 * (lv - 1) ** 2, to = 50 * lv ** 2;
    return { level: lv, xp: state.xp, into: state.xp - from, need: to - from, pct: (state.xp - from) / (to - from) };
  }

  const BADGES = [
    { id: 'first-trip',  name: 'FIRST STEPS',     desc: 'Start your first trip',            test: () => state.trips >= 1 },
    { id: 'walker',      name: 'WALKER',          desc: 'Walk 5 km',                        test: () => state.km.WALK >= 5 },
    { id: 'cyclist',     name: 'ROAD RIDER',      desc: 'Ride 20 km on two wheels',         test: () => state.km.TWO_WHEELER >= 20 },
    { id: 'metro',       name: 'METRO RIDER',     desc: 'Finish a metro or bus trip',       test: () => state.transitTrips >= 1 },
    { id: 'km10',        name: 'TRAVELER',        desc: 'Travel 10 km in total',            test: () => totalKm() >= 10 },
    { id: 'km100',       name: 'ROAD WARRIOR',    desc: 'Travel 100 km in total',           test: () => totalKm() >= 100 },
    { id: 'parks5',      name: 'PARK HOPPER',     desc: 'Visit 5 different parks',          test: () => state.parks.length >= 5 },
    { id: 'lake',        name: 'LAKESIDE',        desc: 'Stand by a lake',                  test: () => !!state.badges.lake },
    { id: 'landmarks3',  name: 'SIGHTSEER',       desc: 'Visit 3 Bengaluru landmarks',      test: () => state.landmarks.length >= 3 },
    { id: 'explorer',    name: 'EXPLORER',        desc: 'Visit 100 map squares',            test: () => state.cells >= 100 },
    { id: 'night-owl',   name: 'NIGHT OWL',       desc: 'Travel after dark',                test: () => !!state.badges['night-owl'] },
    { id: 'early-bird',  name: 'EARLY BIRD',      desc: 'Travel before 7 AM',               test: () => !!state.badges['early-bird'] },
  ];

  const listeners = [];
  const emit = (ev) => listeners.forEach((cb) => { try { cb(ev); } catch (_) {} });

  function addXp(n) {
    const before = level();
    state.xp = Math.round(state.xp + n);
    const after = level();
    if (after > before) emit({ type: 'levelup', level: after });
    emit({ type: 'xp' });
  }

  // Award a badge once; returns true if newly earned.
  function award(id) {
    if (state.badges[id]) return false;
    state.badges[id] = new Date().toISOString();
    const b = BADGES.find((x) => x.id === id);
    addXp(50);
    save();
    emit({ type: 'badge', badge: b || { id, name: id.toUpperCase(), desc: '' } });
    return true;
  }
  function checkBadges() { BADGES.forEach((b) => { if (!state.badges[b.id] && b.test()) award(b.id); }); }

  // Called with real movement while tracking (meters, travel mode, time of day).
  function addDistance(meters, mode, when = new Date()) {
    if (!(meters > 0)) return;
    const km = meters / 1000;
    state.km[mode] = (state.km[mode] || 0) + km;
    addXp(km * (XP_PER_KM[mode] || 5));
    const h = when.getHours();
    if (h < 7 && h >= 4) award('early-bird');
    save(); checkBadges();
  }
  function markNight() { award('night-owl'); }
  function visitCell() { state.cells += 1; addXp(1); save(); checkBadges(); }
  function visitPark(name) {
    if (!name || state.parks.includes(name)) return false;
    state.parks.push(name); addXp(10); save(); checkBadges(); return true;
  }
  function visitLandmark(id) {
    if (!id || state.landmarks.includes(id)) return false;
    state.landmarks.push(id); addXp(30); save(); checkBadges(); return true;
  }
  function visitLake() { award('lake'); }
  function tripStarted() { state.trips += 1; save(); checkBadges(); }
  function tripFinished(mode) { addXp(25); if (mode === 'TRANSIT') state.transitTrips += 1; save(); checkBadges(); }

  window.Progress = {
    state, BADGES, level, levelInfo, totalKm, award, addDistance, markNight, visitCell, visitPark, visitLandmark,
    visitLake, tripStarted, tripFinished, on: (cb) => listeners.push(cb),
  };
})();
