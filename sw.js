/* Maps+ service worker.
 *
 * Strategy
 *  - Same-origin (the app's own HTML/JS/PNGs): NETWORK-FIRST, cache fallback. Code edits show up on the next
 *    reload; offline (or a network slower than NETWORK_TIMEOUT_MS) falls back to the last good copy.
 *  - OpenFreeMap TileJSON (tiles.openfreemap.org/planet): stale-while-revalidate (instant from cache, refreshed
 *    in the background; it names the current dated tile set).
 *  - OpenFreeMap tiles / glyphs / sprites: CACHE-FIRST in a size-capped cache (oldest entries trimmed).
 *    Tile URLs contain the tile-set version, so a cached tile never goes stale.
 *  - unpkg (MapLibre, version-pinned) and Google Fonts: CACHE-FIRST.
 *  - Everything else (Google Maps JS/tiles, Routes, Places, Open-Meteo, any other host) is NOT intercepted:
 *    no respondWith, so the browser handles it exactly as if there were no service worker. Never cached.
 *  - Only GET requests with ok basic/cors responses are ever stored (no opaque, no errors, no POST).
 *
 * Bump VERSION only when the caching logic or the precache list changes; code edits don't need it.
 */
'use strict';

const VERSION = 'v5';
const PREFIX = 'mapsplus-';
const SHELL_CACHE = PREFIX + 'shell-' + VERSION;
const CDN_CACHE = PREFIX + 'cdn-' + VERSION;
const TILE_CACHE = PREFIX + 'tiles-' + VERSION;
const KEEP = [SHELL_CACHE, CDN_CACHE, TILE_CACHE];

const MAX_TILES = 3000;          // entries in TILE_CACHE (~ 30-60 MB of vector tiles)
const TRIM_EVERY = 50;           // check the cap after this many new tiles
const NETWORK_TIMEOUT_MS = 3000; // same-origin: use the cached copy if the network is slower than this

const START_PAGE = 'game-overlay.html';

// App shell, relative to this file. Each entry is cached on its own; a missing file never fails the install.
const PRECACHE = [
  START_PAGE,
  'native.js',
  'crisp.js',
  'map-scale.js',
  'pixel-style.js',
  'trees.js',
  'kenney-styles.js',
  'themes.js',
  'avatars.js',
  'routing.js',
  'geo-utils.js',
  'progress.js',
  'fog.js',
  'pixel-art.js',
  'sky.js',
  'sfx.js',
  'pwa.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon-180.png',
  'assets/kenney/tiny-town/Tilemap/tilemap_packed.png',
  'assets/kenney/tiny-city/Tilemap/tilemap_packed.png',
  'assets/kenney/roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png',
];

// Third-party, version-pinned / long-lived resources fetched once at install (also best-effort).
const CDN_PRECACHE = [
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://tiles.openfreemap.org/planet',
];

const TILE_HOST = 'tiles.openfreemap.org';
const CDN_HOSTS = new Set(['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);

// ---------------------------------------------------------------- lifecycle

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.all(PRECACHE.map((path) =>
        shell.add(new Request(path, { cache: 'reload' })).catch(() => {})));
      const cdn = await caches.open(CDN_CACHE);
      await Promise.all(CDN_PRECACHE.map((url) =>
        fetch(url, { mode: 'cors', credentials: 'omit' })
          .then((resp) => (cacheable(resp) ? cdn.put(url, resp) : undefined))
          .catch(() => {})));
    } catch (e) { /* never fail the install */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names
        .filter((n) => n.startsWith(PREFIX) && !KEEP.includes(n))
        .map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await trimTiles();
    } catch (e) { /* ignore */ }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const d = event.data;
  if (d === 'SKIP_WAITING' || (d && d.type === 'SKIP_WAITING')) self.skipWaiting();
});

// ---------------------------------------------------------------- routing

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event, req));
    return;
  }
  if (url.hostname === TILE_HOST) {
    if (isTileJSON(url)) event.respondWith(staleWhileRevalidate(event, req, CDN_CACHE));
    else event.respondWith(cacheFirst(event, req, TILE_CACHE, true));
    return;
  }
  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(event, req, CDN_CACHE, false));
    return;
  }
  // Google Maps / Routes / Places, Open-Meteo, anything else: pass straight through (not intercepted).
});

// TileJSON is a single path segment with no extension, e.g. /planet. Tiles/glyphs/sprites are deeper paths.
function isTileJSON(url) {
  return /^\/[^/.]+\/?$/.test(url.pathname);
}

// ---------------------------------------------------------------- helpers

function cacheable(resp) {
  return !!resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors');
}

// <script>/<link> requests to a CDN are no-cors, which would give an opaque (uncheckable) response.
// unpkg and Google Fonts send CORS headers, so re-request in cors mode: we can then see the status and
// only cache real successes. A cors response is a valid answer to a no-cors request.
function fetchCors(req) {
  if (req.mode === 'no-cors') {
    return fetch(req.url, { mode: 'cors', credentials: 'omit' }).catch(() => fetch(req));
  }
  return fetch(req);
}

function fromNetwork(event, req) {
  if (req.mode === 'navigate' && event.preloadResponse) {
    return Promise.resolve(event.preloadResponse)
      .catch(() => undefined)
      .then((r) => r || fetch(req));
  }
  return fetch(req);
}

function offlineResponse(req) {
  if (req.mode === 'navigate') {
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
      '<title>Maps+ offline</title><body style="background:#22263a;color:#e9ecff;font:16px monospace;' +
      'display:grid;place-items:center;height:100vh;margin:0"><p>Maps+ is offline. Reconnect and reload.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return Response.error();
}

// ---------------------------------------------------------------- strategies

function networkFirst(event, req) {
  const cacheP = caches.open(SHELL_CACHE);

  const net = fromNetwork(event, req).then((resp) => {
    if (!cacheable(resp)) return resp;
    const copy = resp.clone();
    return cacheP.then((c) => c.put(req.url, copy)).then(() => resp, () => resp);
  });
  event.waitUntil(net.catch(() => {}));   // keep the SW alive until the cache update finishes

  const fromCache = () => cacheP.then(async (c) => {
    const opts = { ignoreVary: true };
    return (await c.match(req.url, opts)) ||
           (await c.match(req.url, { ignoreVary: true, ignoreSearch: true })) ||
           (req.mode === 'navigate'
             ? await c.match(new URL(START_PAGE, self.registration.scope).href, opts)
             : undefined);
  }).catch(() => undefined);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => { if (!settled && r) { settled = true; resolve(r); } return !!r; };
    // Slow network: answer from cache if we have it; the network response still refreshes the cache.
    const timer = setTimeout(() => { fromCache().then(finish); }, NETWORK_TIMEOUT_MS);
    net.then(
      (resp) => { clearTimeout(timer); finish(resp); },
      () => {
        clearTimeout(timer);
        fromCache().then((hit) => finish(hit) || finish(offlineResponse(req)));
      });
  });
}

function cacheFirst(event, req, cacheName, capped) {
  return (async () => {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(req.url, { ignoreVary: true });
    if (hit) return hit;
    const resp = await fetchCors(req);
    if (cacheable(resp)) {
      const copy = resp.clone();
      event.waitUntil(cache.put(req.url, copy)
        .then(() => (capped ? noteTileAdded() : undefined))
        .catch(() => {}));
    }
    return resp;
  })().catch(() => Response.error());
}

function staleWhileRevalidate(event, req, cacheName) {
  const cacheP = caches.open(cacheName);
  const net = cacheP.then((cache) => fetchCors(req).then((resp) => {
    if (!cacheable(resp)) return resp;
    const copy = resp.clone();
    return cache.put(req.url, copy).then(() => resp, () => resp);
  }));
  event.waitUntil(net.catch(() => {}));
  return cacheP
    .then((cache) => cache.match(req.url, { ignoreVary: true }))
    .then((hit) => hit || net)
    .catch(() => Response.error());
}

// ---------------------------------------------------------------- tile cache cap

let tilesSinceTrim = 0;
let trimming = null;

function noteTileAdded() {
  if (++tilesSinceTrim < TRIM_EVERY) return Promise.resolve();
  tilesSinceTrim = 0;
  return trimTiles();
}

// cache.keys() returns entries in insertion order, so the first ones are the oldest.
function trimTiles() {
  if (trimming) return trimming;
  trimming = (async () => {
    try {
      const cache = await caches.open(TILE_CACHE);
      const keys = await cache.keys();
      const excess = keys.length - MAX_TILES;
      for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
    } catch (e) { /* ignore */ }
  })().finally(() => { trimming = null; });
  return trimming;
}
