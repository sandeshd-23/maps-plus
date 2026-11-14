// All Maps+ map themes behind one interface, plus a "night" version of each for dark mode.
// Needs pixel-style.js (Classic) and kenney-styles.js (Roguelike RPG, Tiny Town, Tiny City).
// Exposes window.MapThemes = { LIST, DEFAULT, build(id, dark) -> Promise<Built>, swatch(id, dark) }.
//   Built = { style, images: [{ id, data, pixelRatio }], trees: [ImageData], player: HTMLElement | null }
(() => {
  const KENNEY_RATIO = 0.5;      // one sheet pixel = one rendered pixel at the map's pixelRatio 0.5

  const LIST = [
    { id: 'roguelike', name: 'ROGUELIKE RPG' },
    { id: 'tiny-town', name: 'TINY TOWN' },
    { id: 'tiny-city', name: 'TINY CITY' },
    { id: 'classic',   name: 'CLASSIC' },
  ];
  const DEFAULT = 'roguelike';

  // ---------- night recolor ----------
  // RPG-style night: desaturate a little, darken, and shift toward cool blue. Alpha is kept.
  function nightRGB(r, g, b) {
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    const mix = (c) => c * 0.7 + lum * 0.3;
    return [Math.round(mix(r) * 0.40 + 6), Math.round(mix(g) * 0.45 + 10), Math.round(mix(b) * 0.55 + 34)];
  }
  function parseColor(s) {
    if (typeof s !== 'string') return null;
    let m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) {
      const n = parseInt(m[1], 16);
      return [n >> 16, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1];
    }
    m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    return null;
  }
  // Zoomed-out highways / main roads keep their own night colours so they still stand out after dark.
  const NIGHT_ROADS = { '#f3c341': '#d49a2e', '#f0b030': '#d49a2e', '#fbf0cc': '#a3a1b6', '#f7d77a': '#a3a1b6', '#3a2c22': '#0b0d18' };
  function nightColor(s) {
    if (typeof s === 'string' && NIGHT_ROADS[s.toLowerCase()]) return NIGHT_ROADS[s.toLowerCase()];
    const c = parseColor(s); if (!c) return s;
    const [r, g, b] = nightRGB(c[0], c[1], c[2]);
    return `rgba(${r},${g},${b},${+c[3].toFixed(3)})`;
  }
  // Walk any paint value (plain color or expression) and recolor every color string inside it.
  function recolorValue(v) {
    if (Array.isArray(v)) return v.map(recolorValue);
    return typeof v === 'string' ? nightColor(v) : v;
  }
  const NIGHT_TEXT = '#e9ecff';
  function nightStyle(style) {
    const s = JSON.parse(JSON.stringify(style));
    s.layers.forEach((l) => {
      if (!l.paint) return;
      Object.keys(l.paint).forEach((k) => {
        if (k === 'text-color') l.paint[k] = NIGHT_TEXT;                  // labels stay readable
        else if (k.endsWith('color')) l.paint[k] = recolorValue(l.paint[k]);
      });
    });
    return s;
  }
  function nightImage(img) {
    const out = new ImageData(img.width, img.height), d = img.data, o = out.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = nightRGB(d[i], d[i + 1], d[i + 2]);
      o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = d[i + 3];
    }
    return out;
  }

  // ---------- builders ----------
  const kenneyTheme = (id) => KenneyStyles.THEMES.find((t) => t.id === id);

  async function buildLight(id) {
    if (id === 'classic') {
      return {
        style: JSON.parse(JSON.stringify(PixelMap.style)),
        images: Object.entries(PixelMap.textures).map(([k, data]) => ({ id: k, data, pixelRatio: 1 })),
        trees: PixelMap.treeIcons,
        player: null,
      };
    }
    const b = await KenneyStyles.build(kenneyTheme(id));
    return {
      style: b.style,
      images: Object.entries(b.images).map(([k, data]) => ({ id: k, data, pixelRatio: KENNEY_RATIO })),
      trees: b.trees,
      player: b.player,
    };
  }

  // Night-only lights: warm lit windows on buildings (zoomed in) and a soft street-light glow on main roads.
  function windowsImage() {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    [[2, 3, '#ffd36b'], [9, 2, '#e8a94a'], [5, 10, '#ffd36b'], [12, 11, '#ffe39a'], [13, 6, '#e8a94a']]
      .forEach(([x, y, col]) => { g.fillStyle = col; g.fillRect(x, y, 2, 1); });
    return g.getImageData(0, 0, 16, 16);
  }
  function addNightLights(style) {
    const at = (id) => style.layers.findIndex((l) => l.id === id);
    const b = at('building');
    if (b >= 0) style.layers.splice(b + 1, 0, {
      id: 'night-windows', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 15.5,
      paint: { 'fill-pattern': 'night-windows', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 0, 16.5, 1] },
    });
    const r = at('road-casing');
    if (r >= 0) style.layers.splice(r, 0, {
      id: 'night-road-glow', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      paint: { 'line-color': 'rgba(255,196,96,0.34)', 'line-blur': 6,
               'line-width': MapScale.glowWidth() },
    });
    return style;
  }

  async function build(id, dark) {
    const t = LIST.some((x) => x.id === id) ? id : DEFAULT;
    const light = await buildLight(t);
    if (!dark) return light;
    return {
      style: addNightLights(nightStyle(light.style)),
      images: [...light.images.map((im) => ({ ...im, data: nightImage(im.data) })),
               { id: 'night-windows', data: windowsImage(), pixelRatio: 0.5 }],
      trees: light.trees.map(nightImage),
      player: light.player,             // the character stays bright so you can find yourself
    };
  }

  // Three colors (ground, roads, buildings) for the theme picker.
  function swatch(id, dark) {
    const k = kenneyTheme(id);
    const base = k ? [k.ground, k.casing, k.building] : ['#e6dcb0', '#f2dc9a', '#d8644a'];
    return dark ? base.map(nightColor) : base;
  }

  window.MapThemes = { LIST, DEFAULT, build, swatch, nightColor };
})();
