/* Maps+ — sky.js
 * Sun times (NOAA solar calculation), current weather (Open-Meteo) and a
 * pixel-art rain overlay. Plain browser script, no dependencies.
 * Exposes window.Sky.
 */
(function () {
  'use strict';

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var DAY_MS = 86400000;

  // ---------------------------------------------------------------------------
  // Solar math (NOAA Solar Calculator / Meeus low-precision formulas)
  // ---------------------------------------------------------------------------

  // Julian Day for 0h UTC of the given UTC calendar date.
  function julianDayUTC(y, m, d) {
    return Date.UTC(y, m, d) / DAY_MS + 2440587.5;
  }

  // Solar declination (deg) and equation of time (minutes) at Julian Day jd.
  function solarParams(jd) {
    var T = (jd - 2451545) / 36525; // Julian centuries since J2000.0
    var L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
    if (L0 < 0) L0 += 360;
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var Mr = M * RAD;
    var C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
            Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
            Math.sin(3 * Mr) * 0.000289;
    var trueLong = L0 + C;
    var omega = 125.04 - 1934.136 * T;
    var lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    var eps = eps0 + 0.00256 * Math.cos(omega * RAD);
    var decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
    var yv = Math.tan((eps / 2) * RAD);
    yv *= yv;
    var L0r = L0 * RAD;
    var eqTime = 4 * DEG * (
      yv * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * yv * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * yv * yv * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr)
    );
    return { decl: decl, eqTime: eqTime };
  }

  // Minutes after 0h UTC (of the day starting at jd0) of sunrise (rising=true)
  // or sunset. Returns NaN-free number, or 'day' / 'night' for polar cases.
  function eventMinutes(jd0, lat, lng, rising) {
    var mins = 720 - 4 * lng; // first guess: solar noon
    for (var i = 0; i < 4; i++) {
      var p = solarParams(jd0 + mins / 1440);
      var cosHA = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(p.decl * RAD)) -
                  Math.tan(lat * RAD) * Math.tan(p.decl * RAD);
      if (cosHA > 1) return 'night';  // sun never rises
      if (cosHA < -1) return 'day';   // sun never sets
      var HA = Math.acos(cosHA) * DEG;
      mins = 720 - 4 * (lng + (rising ? HA : -HA)) - p.eqTime;
    }
    return mins;
  }

  // The calendar day "at that location" is taken from local mean solar time
  // (UTC + lng/15 h), which needs no timezone database.
  function localDayParts(lng, date) {
    var t = new Date(date.getTime() + (lng / 15) * 3600000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
  }

  function sunTimes(lat, lng, date) {
    date = date instanceof Date ? date : (date != null ? new Date(date) : new Date());
    var p = localDayParts(lng, date);
    var jd0 = julianDayUTC(p.y, p.m, p.d);
    var base = Date.UTC(p.y, p.m, p.d);
    var r = eventMinutes(jd0, lat, lng, true);
    var s = eventMinutes(jd0, lat, lng, false);
    if (typeof r === 'string' || typeof s === 'string') {
      // Polar day / polar night: no sunrise or sunset on this day.
      var polar = typeof r === 'string' ? r : s;
      return { sunrise: null, sunset: null, polar: polar };
    }
    return {
      sunrise: new Date(base + Math.round(r * 60000)),
      sunset: new Date(base + Math.round(s * 60000))
    };
  }

  function isNight(lat, lng, date) {
    date = date instanceof Date ? date : (date != null ? new Date(date) : new Date());
    var st = sunTimes(lat, lng, date);
    if (st.polar) return st.polar === 'night';
    var t = date.getTime();
    return t < st.sunrise.getTime() || t >= st.sunset.getTime();
  }

  function nextChange(lat, lng, date) {
    date = date instanceof Date ? date : (date != null ? new Date(date) : new Date());
    var t = date.getTime();
    for (var i = 0; i < 3; i++) {
      var st = sunTimes(lat, lng, new Date(t + i * DAY_MS));
      if (st.polar) continue;
      if (st.sunrise.getTime() > t) return st.sunrise;
      if (st.sunset.getTime() > t) return st.sunset;
    }
    // Polar regime (or nothing found): re-check in 6 hours.
    return new Date(t + 6 * 3600000);
  }

  // ---------------------------------------------------------------------------
  // Weather (Open-Meteo, no key)
  // ---------------------------------------------------------------------------

  var WMO = {
    0: 'CLEAR', 1: 'MOSTLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'CLOUDY',
    45: 'FOG', 48: 'FOG',
    51: 'LIGHT DRIZZLE', 53: 'DRIZZLE', 55: 'HEAVY DRIZZLE',
    56: 'FREEZING DRIZZLE', 57: 'FREEZING DRIZZLE',
    61: 'LIGHT RAIN', 63: 'RAIN', 65: 'HEAVY RAIN',
    66: 'FREEZING RAIN', 67: 'FREEZING RAIN',
    71: 'LIGHT SNOW', 73: 'SNOW', 75: 'HEAVY SNOW', 77: 'SNOW GRAINS',
    80: 'LIGHT SHOWERS', 81: 'SHOWERS', 82: 'HEAVY SHOWERS',
    85: 'SNOW SHOWERS', 86: 'SNOW SHOWERS',
    95: 'THUNDERSTORM', 96: 'THUNDERSTORM', 99: 'THUNDERSTORM'
  };
  var HEAVY = { 63: 1, 65: 1, 67: 1, 81: 1, 82: 1 };

  function isRainCode(c) {
    return (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || (c >= 95 && c <= 99);
  }

  var CACHE_MS = 10 * 60 * 1000;
  var FAIL_CACHE_MS = 60 * 1000;
  var cache = {};    // key -> { t, data }
  var inflight = {}; // key -> Promise

  function round2(v) { return Math.round(Number(v) * 100) / 100; }

  function fetchWithTimeout(url, ms) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) { /* ignore */ } }
        reject(new Error('timeout'));
      }, ms);
    });
    var req = fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    return Promise.race([req, timeout]).then(function (res) {
      clearTimeout(timer);
      return res;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function parseWeather(json) {
    var cur = json && json.current;
    if (!cur || typeof cur.weather_code !== 'number') return null;
    var code = cur.weather_code;
    var rainMm = (Number(cur.rain) || 0) + (Number(cur.showers) || 0);
    var precip = Number(cur.precipitation) || 0;
    var raining = isRainCode(code) || rainMm > 0.1;
    var thunder = code >= 95 && code <= 99;
    var heavy = !!HEAVY[code] || code >= 95 || precip >= 4;
    var label = WMO[code] || (raining ? 'RAIN' : 'UNKNOWN');
    if (code === 96 || code === 99) label = 'THUNDER + HAIL';
    if (!isRainCode(code) && raining) label = 'LIGHT RAIN';
    // Convenience 0..1 for createRain().start(intensity)
    var intensity = 0;
    if (raining) {
      intensity = heavy ? 0.85 : (code === 51 || code === 56 || code === 61 || code === 80 ? 0.35 : 0.55);
      if (thunder) intensity = 1;
      if (!isRainCode(code)) intensity = 0.3;
    }
    return {
      code: code,
      raining: raining,
      heavy: raining && heavy,
      thunder: thunder,
      isDay: cur.is_day === 1,
      tempC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
      label: label,
      intensity: intensity,
      precipitation: precip
    };
  }

  function weather(lat, lng) {
    try {
      if (typeof fetch !== 'function') return Promise.resolve(null);
      var la = round2(lat), lo = round2(lng);
      if (!isFinite(la) || !isFinite(lo)) return Promise.resolve(null);
      var key = la.toFixed(2) + ',' + lo.toFixed(2);
      var hit = cache[key];
      var now = Date.now();
      if (hit && now - hit.t < (hit.data ? CACHE_MS : FAIL_CACHE_MS)) {
        return Promise.resolve(hit.data);
      }
      if (inflight[key]) return inflight[key];
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + la.toFixed(2) +
        '&longitude=' + lo.toFixed(2) +
        '&current=weather_code,precipitation,rain,showers,is_day,temperature_2m';
      var p = fetchWithTimeout(url, 6000).then(function (res) {
        if (!res || !res.ok) return null;
        return res.json();
      }).then(parseWeather).catch(function () { return null; }).then(function (data) {
        cache[key] = { t: Date.now(), data: data };
        delete inflight[key];
        return data;
      });
      inflight[key] = p;
      return p;
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Pixel rain overlay
  // ---------------------------------------------------------------------------

  var PIX = 3;           // CSS px per rain pixel (chunky)
  var MAX_DROPS = 240;   // hard cap on streaks (phone-friendly)
  var MAX_SPLASH = 80;

  function createRain(container, opts) {
    opts = opts || {};
    var zIndex = opts.zIndex == null ? 4 : opts.zIndex;
    var noop = { start: function () {}, stop: function () {}, setDark: function () {}, destroy: function () {} };
    if (!container || typeof document === 'undefined') return noop;

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'sky-rain';
    var s = canvas.style;
    s.position = 'absolute';
    s.left = s.top = s.right = s.bottom = '0';
    s.inset = '0';
    s.width = '100%';
    s.height = '100%';
    s.pointerEvents = 'none';
    s.zIndex = String(zIndex);
    s.imageRendering = 'pixelated';
    try {
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    } catch (e) { /* ignore */ }
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (!ctx) return noop;

    var W = 0, H = 0;
    var drops = [], splashes = [];
    var running = false, intensity = 0, dark = false;
    var raf = 0, last = 0;
    var mq = null;
    try { mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { mq = null; }
    function reduced() { return !!(mq && mq.matches); }

    function colors() {
      return dark
        ? { head: 'rgba(235,242,255,0.85)', tail: 'rgba(200,215,240,0.45)', splash: 'rgba(240,246,255,0.8)' }
        : { head: 'rgba(165,215,255,0.9)', tail: 'rgba(110,170,235,0.5)', splash: 'rgba(200,232,255,0.85)' };
    }

    function targetCount() {
      var area = W * H;
      return Math.min(MAX_DROPS, Math.round((area / 130) * Math.max(0, Math.min(1, intensity))));
    }

    function newDrop(anywhere) {
      var len = 3 + ((Math.random() * 4) | 0) + (intensity > 0.7 ? 2 : 0);
      return {
        x: Math.random() * (W + H * 0.5),
        y: anywhere ? Math.random() * H : -len * 2 - Math.random() * H * 0.3,
        len: len,
        v: (90 + Math.random() * 60) * (0.8 + intensity * 0.6), // rain px / s
        land: H * (0.15 + Math.random() * 0.95)                  // where it "hits the ground"
      };
    }

    function syncCount(anywhere) {
      var n = targetCount();
      while (drops.length < n) drops.push(newDrop(anywhere));
      if (drops.length > n) drops.length = n;
    }

    function resize() {
      var r = container.getBoundingClientRect();
      var w = Math.max(1, Math.ceil(r.width / PIX));
      var h = Math.max(1, Math.ceil(r.height / PIX));
      if (w === W && h === H) return;
      W = w; H = h;
      canvas.width = W;
      canvas.height = H;
      drops = [];
      splashes = [];
      if (running) {
        syncCount(true);
        if (reduced()) drawStatic(); else draw();
      }
    }

    // Diagonal streak: every 2 pixels down, 1 pixel left (wind from the right).
    function drawDrop(d, c) {
      var x0 = Math.round(d.x), y0 = Math.round(d.y);
      ctx.fillStyle = c.tail;
      for (var i = d.len - 1; i >= 1; i--) {
        ctx.fillRect(x0 + ((i + 1) >> 1), y0 - i, 1, 1);
      }
      ctx.fillStyle = c.head;
      ctx.fillRect(x0, y0, 1, 1);
    }

    function draw() {
      var c = colors();
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < drops.length; i++) drawDrop(drops[i], c);
      ctx.fillStyle = c.splash;
      for (var j = 0; j < splashes.length; j++) {
        var sp = splashes[j];
        var k = sp.age < 0.06 ? 1 : 2;
        ctx.fillRect(sp.x - k, sp.y, 1, 1);
        ctx.fillRect(sp.x + k, sp.y, 1, 1);
        if (sp.age < 0.06) ctx.fillRect(sp.x, sp.y - 1, 1, 1);
      }
    }

    function drawStatic() {
      // Reduced motion: a sparse, still rain texture.
      var c = colors();
      ctx.clearRect(0, 0, W, H);
      var n = Math.min(MAX_DROPS, Math.round((W * H / 260) * Math.max(0.2, intensity)));
      var seed = 1337;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      for (var i = 0; i < n; i++) {
        drawDrop({ x: rnd() * (W + H * 0.5), y: rnd() * H, len: 3 + ((rnd() * 4) | 0) }, c);
      }
    }

    function step(dt) {
      var dx = 0.5; // horizontal per vertical
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i];
        var dy = d.v * dt;
        d.y += dy;
        d.x -= dy * dx;
        if (d.y >= d.land) {
          if (splashes.length < MAX_SPLASH && Math.random() < 0.35) {
            splashes.push({ x: Math.round(d.x), y: Math.round(d.y), age: 0 });
          }
          drops[i] = newDrop(false);
        } else if (d.x < -4) {
          drops[i] = newDrop(false);
        }
      }
      for (var j = splashes.length - 1; j >= 0; j--) {
        splashes[j].age += dt;
        if (splashes[j].age > 0.14) splashes.splice(j, 1);
      }
    }

    function frame(ts) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      step(dt);
      draw();
    }

    function startLoop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (reduced()) { drawStatic(); return; }
      raf = requestAnimationFrame(frame);
    }

    var ro = null;
    function onWinResize() { resize(); }
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { resize(); });
      ro.observe(container);
    } else {
      window.addEventListener('resize', onWinResize);
    }
    function onMotionChange() { if (running) startLoop(); }
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onMotionChange);
      else if (mq.addListener) mq.addListener(onMotionChange);
    }
    resize();

    var api = {
      canvas: canvas,
      start: function (level) {
        intensity = level == null ? 0.6 : Math.max(0, Math.min(1, Number(level) || 0));
        if (intensity <= 0) { api.stop(); return; }
        resize();
        var wasRunning = running;
        running = true;
        syncCount(!wasRunning);
        if (!wasRunning || reduced()) startLoop();
      },
      stop: function () {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        drops = [];
        splashes = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
      setDark: function (v) {
        dark = !!v;
        if (running && reduced()) drawStatic();
      },
      destroy: function () {
        api.stop();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', onWinResize);
        if (mq) {
          if (mq.removeEventListener) mq.removeEventListener('change', onMotionChange);
          else if (mq.removeListener) mq.removeListener(onMotionChange);
        }
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
    return api;
  }

  window.Sky = {
    sunTimes: sunTimes,
    isNight: isNight,
    nextChange: nextChange,
    weather: weather,
    createRain: createRain,
    _parseWeather: parseWeather // exposed for testing
  };
})();
