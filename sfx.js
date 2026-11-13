/* Maps+ — sfx.js
 * Original 8-bit style sound effects synthesized with the Web Audio API.
 * Plain browser script, no dependencies. Exposes window.Sfx.
 */
(function () {
  'use strict';

  var STORE_KEY = 'mapsplus.sound';
  var MASTER = 0.15;

  var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  var ctx = null, master = null, noiseBuf = null, pulse25 = null, pulse125 = null;
  var unlocked = false;
  var lastPlay = {};

  function readEnabled() {
    try {
      var v = window.localStorage.getItem(STORE_KEY);
      return v === null ? true : v !== '0' && v !== 'false';
    } catch (e) { return true; }
  }
  var enabled = readEnabled();

  // ---- context setup --------------------------------------------------------

  function pulseWave(duty) {
    var n = 32;
    var real = new Float32Array(n), imag = new Float32Array(n);
    for (var k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }

  function ensureContext() {
    if (ctx || !AC) return ctx;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
      // 8-bit-ish noise: sample-and-hold white noise at a lower rate.
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0), hold = 0;
      for (var i = 0; i < len; i++) {
        if (i % 4 === 0) hold = Math.random() * 2 - 1;
        data[i] = hold;
      }
      try { pulse25 = pulseWave(0.25); pulse125 = pulseWave(0.125); } catch (e) { pulse25 = pulse125 = null; }
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    if (!enabled || !AC) return;
    if (!ensureContext()) return;
    try {
      if (ctx.state === 'suspended') {
        var p = ctx.resume();
        if (p && p.then) p.then(markUnlocked, function () {});
      } else {
        markUnlocked();
      }
    } catch (e) { /* ignore */ }
  }

  function markUnlocked() {
    // Listeners stay attached (cheap) so a context suspended later by the
    // OS/browser (e.g. iOS interruption) is resumed on the next gesture.
    if (ctx && ctx.state === 'running') unlocked = true;
  }

  var gestureEvents = ['pointerdown', 'keydown', 'touchstart'];
  function onGesture() { unlock(); }
  function addGestureListeners() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    gestureEvents.forEach(function (ev) {
      window.addEventListener(ev, onGesture, { capture: true, passive: true });
    });
  }
  if (AC) addGestureListeners();

  // ---- primitives -----------------------------------------------------------

  function setWave(osc, type) {
    if (type === 'pulse25' && pulse25) osc.setPeriodicWave(pulse25);
    else if (type === 'pulse12' && pulse125) osc.setPeriodicWave(pulse125);
    else osc.type = (type === 'pulse25' || type === 'pulse12') ? 'square' : type;
  }

  // A single enveloped note. t = start time (s), d = duration (s).
  function tone(type, freq, t, d, vol, slideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    setWave(o, type);
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
    var v = vol == null ? 0.6 : vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.setValueAtTime(v, t + Math.max(0.005, d * 0.55));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + d + 0.02);
  }

  function noise(t, d, vol, hp) {
    var src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    f.type = 'highpass';
    f.frequency.value = hp || 1500;
    g.gain.setValueAtTime(vol == null ? 0.4 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + d + 0.02);
  }

  // Note name -> Hz (e.g. 'A4', 'C#5', 'Bb3').
  var SEMI = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  function hz(n) {
    var m = /^([A-G])([#b]?)(\d)$/.exec(n);
    if (!m) return 440;
    var s = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
    return 440 * Math.pow(2, s / 12);
  }

  // Play a sequence of [note, beats] with given step length; returns end time.
  function seq(type, notes, t, stepLen, vol, gap) {
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i], len = n[1] * stepLen;
      if (n[0]) tone(type, hz(n[0]), t, len * (gap || 0.9), vol);
      t += len;
    }
    return t;
  }

  // ---- sounds (original motifs) ---------------------------------------------

  var SOUNDS = {
    // ~40 ms tick
    click: function (t) {
      tone('pulse25', 1760, t, 0.035, 0.45, 1180);
    },
    // Route found: quick upward 4-note figure ending on a 6th (~0.45 s)
    found: function (t) {
      seq('pulse25', [['D5', 1], ['A5', 1], ['F#5', 1], ['B5', 3]], t, 0.07, 0.5);
      seq('triangle', [['D4', 3], ['B3', 3]], t, 0.07, 0.7);
    },
    // Next turn: two-tone "bi-dip" (~0.13 s)
    step: function (t) {
      tone('pulse12', hz('E6'), t, 0.05, 0.4);
      tone('pulse12', hz('B5'), t + 0.06, 0.07, 0.4);
    },
    // Arrived: short original fanfare with bass and a snare tick (~1.1 s)
    arrive: function (t) {
      var s = 0.085;
      seq('pulse25', [['F5', 1], ['A5', 1], ['C6', 2], ['Bb5', 1], ['C6', 1], ['F6', 6]], t, s, 0.5);
      seq('pulse12', [['C5', 1], ['F5', 1], ['A5', 2], ['G5', 1], ['A5', 1], ['C6', 6]], t, s, 0.25);
      seq('triangle', [['F3', 2], ['C4', 2], ['Bb3', 2], ['F3', 6]], t, s, 0.8);
      noise(t, 0.06, 0.25, 2500);
      noise(t + 4 * s, 0.06, 0.25, 2500);
      noise(t + 6 * s, 0.12, 0.3, 1800);
    },
    // Badge: sparkly descending-then-up pentatonic run with an echo (~0.6 s)
    badge: function (t) {
      var run = [['G6', 1], ['E6', 1], ['D6', 1], ['G6', 1], ['A6', 1], ['D7', 3]];
      seq('pulse12', run, t, 0.05, 0.4);
      seq('pulse12', run, t + 0.075, 0.05, 0.15);
      tone('triangle', hz('G4'), t, 0.3, 0.6);
      tone('triangle', hz('D5'), t + 0.25, 0.3, 0.5);
    },
    // Level up: stepped rising triads, then a held top note (~1.15 s)
    levelup: function (t) {
      var s = 0.055;
      var end = seq('pulse25', [
        ['G4', 1], ['B4', 1], ['D5', 1],
        ['A4', 1], ['C#5', 1], ['E5', 1],
        ['B4', 1], ['D#5', 1], ['F#5', 1],
        ['C#5', 1], ['F5', 1], ['G#5', 1]
      ], t, s, 0.45);
      tone('pulse25', hz('C#6'), end, 0.45, 0.5);
      tone('pulse12', hz('G#5'), end, 0.45, 0.2);
      seq('triangle', [['G3', 3], ['A3', 3], ['B3', 3], ['C#4', 3]], t, s, 0.7);
      tone('triangle', hz('C#3'), end, 0.45, 0.8);
    },
    // Error: low descending buzz (~0.32 s)
    error: function (t) {
      tone('square', 180, t, 0.12, 0.35, 150);
      tone('square', 136, t + 0.14, 0.18, 0.35, 110);
      tone('square', 183, t, 0.12, 0.15, 152); // slight detune for grit
      noise(t, 0.05, 0.15, 600);
    },
    // Caught a place for the collection book: bouncy rising chime (~0.6 s)
    catchit: function (t) {
      seq('pulse25', [['C5', 1], ['E5', 1], ['G5', 1], ['C6', 2], ['E6', 1], ['G6', 3]], t, 0.06, 0.45);
      seq('triangle', [['C4', 3], ['G4', 6]], t, 0.06, 0.6);
      noise(t + 0.3, 0.05, 0.15, 5000);
    },
    // Rare / legendary catch: bigger fanfare with a shimmering top (~1.3 s)
    legendary: function (t) {
      var s = 0.075;
      var end = seq('pulse25', [['G4', 1], ['C5', 1], ['E5', 1], ['G5', 2], ['E5', 1], ['G5', 1], ['C6', 4]], t, s, 0.5);
      seq('pulse12', [['E5', 1], ['G5', 1], ['C6', 1], ['E6', 2], ['C6', 1], ['E6', 1], ['G6', 4]], t, s, 0.22);
      seq('triangle', [['C3', 3], ['G3', 3], ['C4', 5]], t, s, 0.8);
      seq('pulse12', [['C7', 1], ['G6', 1], ['E7', 1], ['C7', 1], ['G7', 2]], end, 0.045, 0.2);
      noise(t, 0.08, 0.25, 2500); noise(end, 0.15, 0.2, 6000);
    },
    // Shiny: sparkling high glissando (~0.5 s)
    shiny: function (t) {
      seq('pulse12', [['E7', 1], ['B6', 1], ['G#6', 1], ['E6', 1], ['B6', 1], ['E7', 1], ['G#7', 3]], t, 0.04, 0.3);
      seq('pulse12', [['E7', 1], ['B6', 1], ['G#6', 1], ['E6', 1], ['B6', 1], ['E7', 1], ['G#7', 3]], t + 0.06, 0.04, 0.12);
    },
    // Hazard ahead: two urgent beeps (~0.35 s)
    hazard: function (t) {
      tone('square', hz('A5'), t, 0.12, 0.35);
      tone('square', hz('A5'), t + 0.18, 0.14, 0.35);
    },
    // Save: soft confirm "tick-ding" (~0.35 s)
    save: function (t) {
      noise(t, 0.02, 0.2, 4000);
      tone('triangle', hz('C6'), t + 0.02, 0.09, 0.6);
      tone('pulse12', hz('G6'), t + 0.11, 0.24, 0.35);
      tone('triangle', hz('G5'), t + 0.11, 0.24, 0.5);
    }
  };

  function play(name) {
    try {
      if (!enabled || !AC || !ctx || !unlocked) return;
      if (ctx.state !== 'running') {
        var p = ctx.resume && ctx.resume();
        if (p && p.catch) p.catch(function () {});
        return;
      }
      var fn = SOUNDS[name];
      if (!fn) return;
      var now = ctx.currentTime;
      // Don't stack the same sound within 40 ms.
      if (lastPlay[name] && now - lastPlay[name] < 0.04) return;
      lastPlay[name] = now;
      fn(now + 0.01);
    } catch (e) { /* never throw */ }
  }

  window.Sfx = {
    get enabled() { return enabled; },
    set enabled(v) {
      enabled = !!v;
      try { window.localStorage.setItem(STORE_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
      if (enabled && AC) {
        unlock(); // works when the setter runs inside a user gesture (e.g. a toggle click)
      }
    },
    play: play,
    get supported() { return !!AC; },
    names: Object.keys(SOUNDS)
  };
})();
