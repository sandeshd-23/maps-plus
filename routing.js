// Directions + traffic for Maps+.
// Routes come from Google's Routes API (traffic-aware) and are drawn on the pixel overlay in game colors.
// Exposes window.GameRoutes.
(() => {
  // Color themes for the route. Each traffic level gets its own color; walking routes use `walk`.
  const THEMES = [
    { id: 'hp',    name: 'HP BAR', clear: '#3ee06a', slow: '#ffd23a', jam: '#ff3b3b', walk: '#3aa0ff', casing: '#1b1b22', dash: '#ffffff' },
    { id: 'magic', name: 'MAGIC',  clear: '#4fe3ff', slow: '#b57bff', jam: '#ff4fb0', walk: '#8affd2', casing: '#1a1035', dash: '#fff6c8' },
    { id: 'lava',  name: 'LAVA',   clear: '#9be15d', slow: '#ff9f1c', jam: '#c81d25', walk: '#ffe066', casing: '#2b0f05', dash: '#ffe9a8' },
  ];

  const MODES = [
    { id: 'DRIVE',       label: 'CAR'  },
    { id: 'TWO_WHEELER', label: 'BIKE' },
    { id: 'WALK',        label: 'WALK' },
    { id: 'TRANSIT',     label: 'METRO' },   // Namma Metro + BMTC buses (with walking between)
  ];
  // Fallback line colors if Google doesn't send one (Namma Metro purple, bus green).
  const VEHICLE_COLOR = { SUBWAY: '#8a2d98', METRO_RAIL: '#8a2d98', HEAVY_RAIL: '#8a2d98', LIGHT_RAIL: '#8a2d98',
                          RAIL: '#8a2d98', TRAM: '#c0392b', BUS: '#2e8b3e', INTERCITY_BUS: '#2e8b3e', TROLLEYBUS: '#2e8b3e' };

  // Google's encoded polyline format → [[lng, lat], ...]
  function decodePolyline(str) {
    const out = []; let i = 0, lat = 0, lng = 0;
    while (i < str.length) {
      for (const which of [0, 1]) {
        let shift = 0, result = 0, b;
        do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const d = (result & 1) ? ~(result >> 1) : (result >> 1);
        if (which === 0) lat += d; else lng += d;
      }
      out.push([lng / 1e5, lat / 1e5]);
    }
    return out;
  }

  // Cut the route line into runs that share one traffic speed (NORMAL / SLOW / TRAFFIC_JAM).
  function splitByTraffic(coords, intervals, defaultSpeed) {
    const n = coords.length; if (n < 2) return [];
    const seg = new Array(n - 1).fill(defaultSpeed);          // seg[i] = speed from point i to i+1
    (intervals || []).forEach((iv) => {
      const s = iv.startPolylinePointIndex ?? 0, e = iv.endPolylinePointIndex ?? (n - 1);
      for (let k = s; k < e && k < n - 1; k++) seg[k] = iv.speed || 'NORMAL';
    });
    const feats = []; let start = 0;
    for (let i = 1; i <= n - 1; i++) {
      if (i === n - 1 || seg[i] !== seg[start]) {
        feats.push({ type: 'Feature', properties: { speed: seg[start] },
                     geometry: { type: 'LineString', coordinates: coords.slice(start, i + 1) } });
        start = i;
      }
    }
    return feats;
  }

  const FIELDS = [
    'routes.duration', 'routes.staticDuration', 'routes.distanceMeters',
    'routes.polyline.encodedPolyline', 'routes.travelAdvisory.speedReadingIntervals',
    'routes.legs.steps.navigationInstruction', 'routes.legs.steps.distanceMeters',
    // For live navigation (where each step ends) and transit (per-step lines, stops and vehicles).
    'routes.legs.steps.startLocation', 'routes.legs.steps.endLocation', 'routes.legs.steps.polyline.encodedPolyline',
    'routes.legs.steps.travelMode', 'routes.legs.steps.transitDetails',
  ].join(',');

  async function callRoutes(key, body) {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data.error && data.error.message) || ('HTTP ' + res.status));
      err.status = res.status; throw err;
    }
    if (!data.routes || !data.routes.length) throw new Error('No route found between those points.');
    return data.routes[0];
  }

  async function computeRoute(key, from, to, mode) {
    const body = {
      origin:      { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat,   longitude: to.lng   } } },
      travelMode: mode, polylineQuality: 'HIGH_QUALITY', languageCode: 'en-IN', units: 'METRIC',
    };
    if (mode === 'WALK' || mode === 'TRANSIT') return callRoutes(key, body);   // no road traffic for these
    body.extraComputations = ['TRAFFIC_ON_POLYLINE'];
    try {
      return await callRoutes(key, { ...body, routingPreference: 'TRAFFIC_AWARE_OPTIMAL' });
    } catch (e) {
      if (e.status !== 400) throw e;                  // some modes only accept the simpler traffic setting
      return callRoutes(key, { ...body, routingPreference: 'TRAFFIC_AWARE' });
    }
  }

  const EMPTY = { type: 'FeatureCollection', features: [] };
  const width = (a, b, c) => window.MapScale.routeWidth(a, b, c);   // thinner when zoomed out (map-scale.js)
  const ll = (p) => p && p.latLng ? { lat: p.latLng.latitude, lng: p.latLng.longitude } : null;

  // Turn a Routes API route into map features + a flat coordinate list + simple step records.
  //   Road modes: one line split by traffic. TRANSIT: walking steps as dots, each ride in its line's color.
  function featuresFor(route, modeId) {
    const rawSteps = (route.legs || []).flatMap((l) => l.steps || []);
    const steps = rawSteps.map((s) => ({ ...s, start: ll(s.startLocation), end: ll(s.endLocation), text: stepText(s) }));
    if (modeId !== 'TRANSIT') {
      const coords = decodePolyline(route.polyline.encodedPolyline);
      const intervals = route.travelAdvisory && route.travelAdvisory.speedReadingIntervals;
      return { coords, steps, feats: splitByTraffic(coords, intervals, modeId === 'WALK' ? 'WALK' : 'NORMAL'), stops: [] };
    }
    const feats = [], coords = [], stops = [];
    rawSteps.forEach((s) => {
      const c = s.polyline && s.polyline.encodedPolyline ? decodePolyline(s.polyline.encodedPolyline) : [];
      if (c.length < 2) return;
      coords.push(...(coords.length ? c.slice(1) : c));
      const td = s.transitDetails;
      if (s.travelMode === 'TRANSIT' && td) {
        const line = td.transitLine || {}, type = (line.vehicle && line.vehicle.type) || 'BUS';
        const color = /^#[0-9a-f]{6}$/i.test(line.color || '') ? line.color : (VEHICLE_COLOR[type] || '#8a2d98');
        feats.push({ type: 'Feature', properties: { speed: 'TRANSIT', color }, geometry: { type: 'LineString', coordinates: c } });
        const rail = !/BUS/.test(type);
        [td.stopDetails && td.stopDetails.departureStop, td.stopDetails && td.stopDetails.arrivalStop].forEach((st) => {
          const p = st && ll(st.location);
          if (p) stops.push({ type: 'Feature', properties: { icon: rail ? 'stop-rail' : 'stop-bus', name: st.name || '' },
                              geometry: { type: 'Point', coordinates: [p.lng, p.lat] } });
        });
      } else {
        feats.push({ type: 'Feature', properties: { speed: 'WALK' }, geometry: { type: 'LineString', coordinates: c } });
      }
    });
    return { coords, steps, feats, stops };
  }

  // A short game-dialog sentence for one step.
  function stepText(s) {
    const td = s.transitDetails;
    if (s.travelMode === 'TRANSIT' && td) {
      const line = td.transitLine || {}, v = line.vehicle && line.vehicle.type;
      const what = /BUS/.test(v || '') ? 'BUS' : 'METRO';
      const name = line.nameShort || line.name || '';
      const to = td.stopDetails && td.stopDetails.arrivalStop && td.stopDetails.arrivalStop.name;
      const n = td.stopCount ? ` (${td.stopCount} stop${td.stopCount > 1 ? 's' : ''})` : '';
      return `Take the ${what} ${name}${td.headsign ? ' toward ' + td.headsign : ''}${n}. Get off at ${to || 'your stop'}.`;
    }
    return (s.navigationInstruction && s.navigationInstruction.instructions) || 'Continue';
  }

  // Jam stretches get a roadblock icon at their middle.
  function obstaclePoints(feats) {
    return feats.filter((f) => f.properties.speed === 'TRAFFIC_JAM').map((f) => {
      const c = f.geometry.coordinates;
      return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c[Math.floor(c.length / 2)] } };
    });
  }

  // Walking parts of a route (the whole route in WALK mode, or the last bit to a spot off the road)
  // are drawn as a trail of pixel dots; the road part is a line whose look depends on the travel mode.
  const ROAD = ['!', ['in', ['get', 'speed'], ['literal', ['WALK', 'TRANSIT']]]];   // car / bike line
  const RIDE = ['==', ['get', 'speed'], 'TRANSIT'];                                   // metro / bus rides
  const EDGED = ['!=', ['get', 'speed'], 'WALK'];                                     // gets a dark casing
  const FOOT = ['==', ['get', 'speed'], 'WALK'];
  const MODE_LOOK = {
    // CAR: thick solid band in traffic colors, white dashed lane line down the middle.
    DRIVE:       { casing: width(10, 15, 26), line: width(6, 10, 18), dashes: null,       lane: 'visible' },
    // BIKE: thinner dark track with traffic-colored dashes on top.
    TWO_WHEELER: { casing: width(5, 8, 13),   line: width(4, 6.5, 11), dashes: [2, 1.2],  lane: 'none' },
    WALK:        { casing: width(5, 8, 13),   line: width(4, 6.5, 11), dashes: null,       lane: 'none' },
    // METRO: rides drawn in each line's own color (purple / green ...), walking parts as dots.
    TRANSIT:     { casing: width(10, 15, 26), line: width(6, 10, 18), dashes: null,       lane: 'none' },
  };

  // Route layers sit above roads and buildings, below the labels.
  function addLayers(pmap, beforeId) {
    pmap.addSource('route', { type: 'geojson', data: EMPTY });
    const layout = { 'line-cap': 'square', 'line-join': 'miter' };
    pmap.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout, filter: EDGED,
                    paint: { 'line-width': width(10, 15, 26) } }, beforeId);
    pmap.addLayer({ id: 'route-transit', type: 'line', source: 'route', layout: { 'line-cap': 'butt', 'line-join': 'round' },
                    filter: RIDE, paint: { 'line-width': width(6, 10, 18), 'line-color': ['get', 'color'] } }, beforeId);
    pmap.addLayer({ id: 'route-transit-rail', type: 'line', source: 'route', filter: RIDE,
                    paint: { 'line-width': width(1, 1.5, 2.5), 'line-color': '#ffffff', 'line-dasharray': [4, 2] } }, beforeId);
    pmap.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'butt', 'line-join': 'miter' },
                    filter: ROAD, paint: { 'line-width': width(6, 10, 18) } }, beforeId);
    // BIKE uses its own dashed layer (a dash pattern can't be reliably added to an existing line layer later).
    pmap.addLayer({ id: 'route-bike', type: 'line', source: 'route', layout: { 'line-cap': 'butt', 'line-join': 'miter', visibility: 'none' },
                    filter: ROAD, paint: { 'line-width': width(4, 6.5, 11), 'line-dasharray': [2, 1.2] } }, beforeId);
    pmap.addLayer({ id: 'route-dash', type: 'line', source: 'route', filter: ROAD,
                    paint: { 'line-width': width(1.5, 2.5, 4), 'line-dasharray': [1, 3] } }, beforeId);
    pmap.addLayer({ id: 'route-dots', type: 'symbol', source: 'route', filter: FOOT,
                    layout: {
                      'symbol-placement': 'line',
                      'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 12, 12, 15, 16, 18, 24],
                      'icon-image': 'route-dot',
                      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 12, 0.45, 15, 0.8, 18, 1.15],
                      'icon-allow-overlap': true, 'icon-ignore-placement': true,
                    } }, beforeId);
    // Metro / bus stops where you get on and off, and roadblocks on traffic jams.
    pmap.addSource('route-points', { type: 'geojson', data: EMPTY });
    pmap.addLayer({ id: 'route-points', type: 'symbol', source: 'route-points',
                    layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                              'icon-anchor': 'bottom',
                              'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 12, 0.55, 16, 1, 18, 1.3] } }, beforeId);
  }

  // 8x8 pixel dot with a dark outline and a highlight, in the theme's walking color.
  function makeDot(fill, edge) {
    const rows = ['..EEEE..', '.EFFFFE.', 'EFHFFFFE', 'EFFFFFFE', 'EFFFFFFE', 'EFFFFFFE', '.EFFFFE.', '..EEEE..'];
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const col = { E: edge, F: fill, H: '#ffffff' }[ch];
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }));
    return g.getImageData(0, 0, 8, 8);
  }

  function applyTheme(pmap, t) {
    if (!pmap.getLayer('route-line')) return;
    pmap.setPaintProperty('route-casing', 'line-color', t.casing);
    const traffic = ['match', ['get', 'speed'], 'SLOW', t.slow, 'TRAFFIC_JAM', t.jam, 'WALK', t.walk, t.clear];
    pmap.setPaintProperty('route-line', 'line-color', traffic);
    pmap.setPaintProperty('route-bike', 'line-color', traffic);
    pmap.setPaintProperty('route-dash', 'line-color', t.dash);
    const dot = makeDot(t.walk, t.casing);
    if (window.Crisp) Crisp.add(pmap, 'route-dot', dot, 2);             // crisp at any screen sharpness
    else if (pmap.hasImage('route-dot')) pmap.updateImage('route-dot', dot);
    else pmap.addImage('route-dot', dot, { pixelRatio: 0.5 });
  }

  // Switch the road-part look for CAR / BIKE / WALK.
  function setMode(pmap, modeId) {
    if (!pmap.getLayer('route-line')) return;
    const m = MODE_LOOK[modeId] || MODE_LOOK.DRIVE;
    pmap.setPaintProperty('route-casing', 'line-width', m.casing);
    pmap.setPaintProperty('route-line', 'line-width', m.line);
    pmap.setLayoutProperty('route-line', 'visibility', m.dashes ? 'none' : 'visible');
    pmap.setLayoutProperty('route-bike', 'visibility', m.dashes ? 'visible' : 'none');
    pmap.setLayoutProperty('route-dash', 'visibility', m.lane);
    pmap.setPaintProperty('route-transit', 'line-width', m.line);
  }

  // A small sample of each mode's line, for the legend.
  function sampleCSS(modeId, t) {
    if (modeId === 'WALK') return `background:radial-gradient(circle,${t.walk} 2.5px,${t.casing} 3.5px,transparent 4px) 0 50%/9px 9px repeat-x`;
    if (modeId === 'TWO_WHEELER') return `background:repeating-linear-gradient(90deg,${t.clear} 0 7px,${t.casing} 7px 11px)`;
    if (modeId === 'TRANSIT') return `background:linear-gradient(#8a2d98 0 40%,#fff 40% 60%,#8a2d98 60%);border-color:${t.casing}`;
    return `background:linear-gradient(${t.clear} 0 35%,#fff 35% 65%,${t.clear} 65%);border-color:${t.casing}`;
  }

  // features: route lines; stops: metro/bus stop points (TRANSIT). Roadblocks are added for jams automatically.
  function setRoute(pmap, features, stops = []) {
    const src = pmap.getSource('route');
    if (src) src.setData({ type: 'FeatureCollection', features });
    const pts = pmap.getSource('route-points');
    const blocks = obstaclePoints(features).map((f) => ({ ...f, properties: { icon: 'roadblock' } }));
    if (pts) pts.setData({ type: 'FeatureCollection', features: [...blocks, ...stops] });
  }

  // Original pixel-art goal flag (10x14).
  function makeFlag() {
    const rows = ['KKKKKKK...','KRRRRRRK..','KRRWWRRRK.','KRRWWRRRRK','KRRRRRRRK.','KRRRRRRK..','KKKKKKK...',
                  'KG........','KG........','KG........','KG........','KG........','KKK.......','KKKK......'];
    const pal = { K: '#202020', R: '#e8302c', W: '#ffffff', G: '#c8c8c8' };
    const c = document.createElement('canvas'); c.width = 10; c.height = 14; c.className = 'flag';
    const g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
    if (!window.Crisp) return c;
    const sharp = Crisp.canvas(c, 3); sharp.classList.add('flag');
    return sharp;
  }

  window.GameRoutes = { THEMES, MODES, decodePolyline, splitByTraffic, featuresFor, stepText, computeRoute, addLayers,
                        applyTheme, setMode, sampleCSS, setRoute, makeFlag };
})();
