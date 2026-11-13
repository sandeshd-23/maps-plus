// Collection book for Maps+: places you've really been to, like a Pokedex for Bengaluru.
// Four chapters (FOOD, SHOPS, PLACES, SERVICES), rarity, 1-in-20 shiny catches, numbered entries, visits,
// medals, per-area progress, and a photo gallery (your own photos live in photos.js storage, not here).
// The app asks "were you here?" before anything is caught. Everything is stored only on this device.
// Exposes window.Book = { CHAPTERS, RARITY, MEDALS, chapterFor(group), rarityFor(chapter, kind), has(key),
//   get(key), entries(), stats(), catchPlace(c) -> { entry, isNew, medals }, visit(key), setGid(key, id),
//   setPhoto(key, bool), decline(key), declined(key), noteAreaTotals(area, counts), areaTotals(area), medalsEarned() }.
// c = { key, name, chapter, kind ('landmark' | icon key), icon, lat, lng, area }
(() => {
  const KEY = 'mapsplus.book', AREAS_KEY = 'mapsplus.bookAreas', NO_KEY = 'mapsplus.bookDeclined';
  const SHINY_ODDS = 20;
  const REVISIT_MS = 6 * 3600 * 1000;
  const DECLINE_MS = 7 * 24 * 3600 * 1000;      // "No, I wasn't there": don't ask again for a week

  const CHAPTERS = [
    { id: 'food',     label: 'FOOD' },
    { id: 'shops',    label: 'SHOPS' },
    { id: 'places',   label: 'PLACES' },
    { id: 'services', label: 'SERVICES' },
  ];
  // Map icon groups -> book chapter (bars count as food, landmarks as places). Others aren't collected.
  const chapterFor = (group) => ({ food: 'food', drinks: 'food', shops: 'shops', places: 'places', landmarks: 'places',
                                   services: 'services' })[group] || null;

  const RARITY = {
    common:    { id: 'common',    label: 'COMMON',    color: '#8a8f9e', xp: 5 },
    uncommon:  { id: 'uncommon',  label: 'UNCOMMON',  color: '#3fa34d', xp: 10 },
    rare:      { id: 'rare',      label: 'RARE',      color: '#3a78d8', xp: 25 },
    legendary: { id: 'legendary', label: 'LEGENDARY', color: '#e8a020', xp: 100 },
  };
  const rarityFor = (chapter, kind) => kind === 'landmark' ? 'legendary'
    : chapter === 'places' ? 'rare' : chapter === 'food' ? 'uncommon' : 'common';

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
  let book = Object.assign({ n: 0, entries: {}, medals: {} }, load(KEY, {}));
  let areas = load(AREAS_KEY, {});
  let declinedAt = load(NO_KEY, {});
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(book)); } catch (_) {} };

  const list = () => Object.values(book.entries).sort((a, b) => b.first - a.first);

  function stats() {
    const all = list(), byChapter = {}, byArea = {};
    all.forEach((e) => {
      byChapter[e.chapter] = (byChapter[e.chapter] || 0) + 1;
      byArea[e.area] = (byArea[e.area] || 0) + 1;
    });
    return { total: all.length, shiny: all.filter((e) => e.shiny).length,
             legendary: all.filter((e) => e.rarity === 'legendary').length, photos: all.filter((e) => e.photo).length,
             byChapter, byArea, chapters: Object.keys(byChapter).length, bestArea: Math.max(0, ...Object.values(byArea)) };
  }

  const MEDALS = [
    { id: 'first',    name: 'FIRST CATCH',      desc: 'Catch your first place',        test: (s) => s.total >= 1 },
    { id: 'c10',      name: 'COLLECTOR I',      desc: 'Catch 10 places',               test: (s) => s.total >= 10 },
    { id: 'c50',      name: 'COLLECTOR II',     desc: 'Catch 50 places',               test: (s) => s.total >= 50 },
    { id: 'c150',     name: 'COLLECTOR III',    desc: 'Catch 150 places',              test: (s) => s.total >= 150 },
    { id: 'c500',     name: 'MASTER COLLECTOR', desc: 'Catch 500 places',              test: (s) => s.total >= 500 },
    { id: 'foodie',   name: 'FOODIE',           desc: 'Catch 25 places to eat',        test: (s) => (s.byChapter.food || 0) >= 25 },
    { id: 'shopper',  name: 'SHOPAHOLIC',       desc: 'Catch 25 shops',                test: (s) => (s.byChapter.shops || 0) >= 25 },
    { id: 'wander',   name: 'WANDERER',         desc: 'Catch 10 places (parks, temples...)', test: (s) => (s.byChapter.places || 0) >= 10 },
    { id: 'all4',     name: 'ALL-ROUNDER',      desc: 'Catch in all 4 chapters',       test: (s) => s.chapters >= 4 },
    { id: 'shiny',    name: 'SHINY HUNTER',     desc: 'Catch a shiny (1 in 20)',       test: (s) => s.shiny >= 1 },
    { id: 'legend',   name: 'LEGEND SEEKER',    desc: 'Catch a legendary landmark',    test: (s) => s.legendary >= 1 },
    { id: 'legend10', name: 'CITY LEGEND',      desc: 'Catch all 10 landmarks',        test: (s) => s.legendary >= 10 },
    { id: 'photo10',  name: 'PHOTOGRAPHER',     desc: 'Add 10 of your own photos',     test: (s) => s.photos >= 10 },
    { id: 'local',    name: 'LOCAL HERO',       desc: 'Catch 25 places in one area',   test: (s) => s.bestArea >= 25 },
  ];
  function newMedals() {
    const s = stats(), now = Date.now(), got = MEDALS.filter((m) => !book.medals[m.id] && m.test(s));
    got.forEach((m) => { book.medals[m.id] = now; });
    return got;
  }

  function catchPlace(c) {
    const old = book.entries[c.key];
    if (old) return { entry: old, isNew: false, medals: [] };
    const now = Date.now();
    const rarity = rarityFor(c.chapter, c.kind);
    const shiny = Math.random() < 1 / SHINY_ODDS;
    const entry = { key: c.key, n: ++book.n, name: c.name, chapter: c.chapter, kind: c.kind, icon: c.icon, rarity, shiny,
                    lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), area: c.area || 'BENGALURU',
                    first: now, last: now, visits: 1, xp: RARITY[rarity].xp * (shiny ? 3 : 1), gid: null, photo: false };
    book.entries[c.key] = entry;
    const medals = newMedals();
    save();
    return { entry, isNew: true, medals };
  }
  // Back at a place you've caught: counts as a new visit if it's been 6 hours.
  function visit(key) {
    const e = book.entries[key]; if (!e) return false;
    if (Date.now() - e.last < REVISIT_MS) return false;
    e.visits += 1; e.last = Date.now(); save(); return true;
  }
  function setGid(key, id) { const e = book.entries[key]; if (e) { e.gid = id || ''; save(); } }
  // Returns medals newly earned by adding a photo.
  function setPhoto(key, has) {
    const e = book.entries[key]; if (!e) return [];
    e.photo = !!has; const m = newMedals(); save(); return m;
  }
  function decline(key) {
    declinedAt[key] = Date.now();
    Object.keys(declinedAt).forEach((k) => { if (Date.now() - declinedAt[k] > DECLINE_MS) delete declinedAt[k]; });
    try { localStorage.setItem(NO_KEY, JSON.stringify(declinedAt)); } catch (_) {}
  }
  const declined = (key) => !!declinedAt[key] && Date.now() - declinedAt[key] < DECLINE_MS;

  // How many places of each chapter an area has (as far as the map has shown so far: keeps the biggest count).
  function noteAreaTotals(area, counts) {
    if (!area) return;
    const a = areas[area] = areas[area] || {};
    let changed = false;
    Object.entries(counts).forEach(([g, n]) => { if (!(a[g] >= n)) { a[g] = n; changed = true; } });
    if (changed) try { localStorage.setItem(AREAS_KEY, JSON.stringify(areas)); } catch (_) {}
  }

  window.Book = { CHAPTERS, RARITY, MEDALS, chapterFor, rarityFor, has: (k) => !!book.entries[k],
                  get: (k) => book.entries[k] || null, entries: list, stats, catchPlace, visit, setGid, setPhoto,
                  decline, declined, medalsEarned: () => ({ ...book.medals }),
                  noteAreaTotals, areaTotals: (area) => ({ ...(areas[area] || {}) }) };
})();
