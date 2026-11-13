// Tile-set map styles built from Kenney's CC0 packs (kenney.nl): Tiny City, Tiny Town, Roguelike RPG Pack.
// Each theme crops 16x16 tiles from the pack's sheet, composes small seamless textures, and
// plugs them into a MapLibre style as fill / line patterns.
// Exposes window.KenneyStyles = { THEMES, build(theme) -> Promise<{ style, images, player }> }.
(() => {
  const SHEETS = {
    town:  { url: 'assets/kenney/tiny-town/Tilemap/tilemap_packed.png', T: 16, M: 0 },
    city:  { url: 'assets/kenney/tiny-city/Tilemap/tilemap_packed.png', T: 16, M: 0 },
    rogue: { url: 'assets/kenney/roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png', T: 16, M: 1 },
  };

  // Water tile in the Tiny packs' palette (Tiny Town / Tiny City ship without water).
  const TINY_WATER = (g) => {
    g.fillStyle = '#4f97cf'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#6fb4e3'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 8, 16, 1);
    g.fillStyle = '#b8e2f7'; g.fillRect(2, 4, 4, 1); g.fillRect(6, 3, 2, 1); g.fillRect(10, 12, 4, 1); g.fillRect(14, 11, 2, 1);
  };

  // Zoomed-out woodland: a small dithered forest texture (single trees would be specks at that scale).
  const forest = (base, light, dark) => (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 16, 16);
    g.fillStyle = light; [[1, 1], [9, 3], [4, 9], [13, 11], [7, 14]].forEach(([x, y]) => g.fillRect(x, y, 3, 2));
    g.fillStyle = dark; [[5, 4], [12, 7], [2, 13], [10, 15]].forEach(([x, y]) => g.fillRect(x, y, 2, 1));
  };

  // Each texture is a grid of cells; each cell is a stack of tiles ('sheet:col,row') or a draw function.
  const THEMES = [
    {
      id: 'tiny-town', name: 'TINY TOWN', credit: 'Tiny Town by Kenney (CC0)',
      ground: '#84c669',
      tex: {
        bg:    [[['town:0,0'], ['town:1,0']], [['town:0,0'], ['town:0,0']]],
        park:  [[['town:0,0'], ['town:2,0'], ['town:0,0']], [['town:1,0'], ['town:0,0'], ['town:0,0']],
                [['town:0,0'], ['town:0,0'], ['town:2,0']]],
        forest: [[[forest('#479f4a', '#5fb35a', '#3a8340')]]],
        water: [[[TINY_WATER]]],
        roadMajor: [[['town:1,2']]], roadMinor: [[['town:1,3']]],
      },
      trees: ['town:4,1', 'town:4,2'],
      building: '#bd6c4a',   // the pack's wood-wall brown: earthy partner to the grass, like Roguelike
      casing: '#b9733f', path: '#c98b55', roofEdge: '#763b36', waterEdge: '#2f5f8f',
      label: '#ffffff', labelHalo: '#3d2b33', streetLabel: '#4a2c17', streetHalo: '#eaa56c',
      player: null,
    },
    {
      id: 'tiny-city', name: 'TINY CITY', credit: 'Tiny City + Tiny Town grass by Kenney (CC0)',
      ground: '#b7c3d6',
      tex: {
        bg:    [[['city:4,7'], ['city:4,7']], [['city:4,7'], ['city:4,8']]],
        park:  [[['town:0,0'], ['town:1,0']], [['town:1,0'], ['town:0,0']]],
        forest: [[[forest('#479f4a', '#5fb35a', '#3a8340')]]],
        water: [[[TINY_WATER]]],
        roadMajor: [[['city:4,5']]], roadMinor: [[['city:2,5']]],
      },
      trees: ['town:4,1', 'city:7,5', 'town:4,2'],
      building: '#8b9bb4',   // one shade darker than the pavement (Google-style same-hue buildings)
      casing: '#e8eef6', path: '#8f9db3', roofEdge: '#52607c', waterEdge: '#2f5f8f',
      label: '#ffffff', labelHalo: '#2b2f3d', streetLabel: '#ffffff', streetHalo: '#454f63',
      player: 'city:0,9',
    },
    {
      id: 'roguelike', name: 'ROGUELIKE RPG', credit: 'Roguelike RPG Pack by Kenney (CC0)',
      ground: '#8cc334',
      tex: {
        bg:    [[['rogue:5,0']]],
        park:  [[['rogue:5,0'], ['rogue:5,0'], ['rogue:5,0']], [['rogue:5,0'], ['rogue:0,6'], ['rogue:5,0']],
                [['rogue:5,0'], ['rogue:5,0'], ['rogue:0,9']]],
        forest: [[[forest('#648c32', '#7bad2c', '#55782a')]]],
        water: [[['rogue:0,0'], ['rogue:1,0']], [['rogue:1,0'], ['rogue:0,0']]],
        roadMajor: [[['rogue:6,2']]], roadMinor: [[['rogue:6,0']]],
      },
      trees: ['rogue:13,9', 'rogue:16,9', 'rogue:15,9'],
      building: '#b88453',
      casing: '#6b4a2b', path: '#b28153', roofEdge: '#3a2716', waterEdge: '#2a7f8a',
      label: '#ffffff', labelHalo: '#3a2716', streetLabel: '#3a2716', streetHalo: '#e8dcc0',
      player: null,
    },
  ];

  const sheetCache = {};
  function loadSheet(key) {
    if (!sheetCache[key]) {
      sheetCache[key] = new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('Could not load ' + SHEETS[key].url));
        img.src = SHEETS[key].url;
      });
    }
    return sheetCache[key];
  }

  function drawRef(g, ref, x, y, sheets) {
    if (typeof ref === 'function') { g.save(); g.translate(x, y); ref(g); g.restore(); return; }
    const [key, cr] = ref.split(':'); const [c, r] = cr.split(',').map(Number);
    const s = SHEETS[key];
    g.drawImage(sheets[key], c * (s.T + s.M), r * (s.T + s.M), s.T, s.T, x, y, 16, 16);
  }

  function compose(grid, sheets) {
    const c = document.createElement('canvas');
    c.width = grid[0].length * 16; c.height = grid.length * 16;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    grid.forEach((row, ry) => row.forEach((cell, cx) => cell.forEach((ref) => drawRef(g, ref, cx * 16, ry * 16, sheets))));
    return g.getImageData(0, 0, c.width, c.height);
  }

  // Line patterns run along the road, so turn the tile sideways-safe: MapLibre maps the image's
  // vertical axis across the road width, which is what Kenney's horizontal road tiles expect.
  const ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
  const MAJOR = ['motorway', 'trunk', 'primary', 'secondary'];
  const FONT = ['Noto Sans Bold'];
  const MINOR = ['tertiary', 'minor', 'service'];
  const TREE_ZOOM = (window.Trees && window.Trees.MIN_ZOOM) || 15;
  // Road widths, fading and labels per zoom: see map-scale.js. Zoomed out, a road is only 1-4 px wide,
  // too thin for the road tile texture, so it's drawn in the texture's average color until TEXTURE_ZOOM.
  const S = window.MapScale;
  const TEXTURE_ZOOM = 14;
  function averageColor(img) {
    const d = img.data; let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (!n) return '#808080';
    const h = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }

  // Building borders and shadows have a fixed on-screen size, so on small zoomed-out buildings they
  // swallow the roof color and everything turns black. Fade both in only as you zoom closer.
  const OUTLINE_FROM = 15.3, OUTLINE_FULL = 16.8;
  const fadeIn = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ['interpolate', ['linear'], ['zoom'],
      OUTLINE_FROM, `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0)`, OUTLINE_FULL, hex];
  };
  const SHADOW = ['interpolate', ['linear'], ['zoom'], OUTLINE_FROM, 'rgba(0,0,0,0)', OUTLINE_FULL, 'rgba(0,0,0,0.31)'];
  const SHADOW_OFFSET = ['interpolate', ['linear'], ['zoom'], OUTLINE_FROM, ['literal', [0, 0]], OUTLINE_FULL, ['literal', [3, 3]]];

  function styleFor(t, avg) {
    const P = (id) => 'k-' + t.id + '-' + id;
    return {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
      layers: [
        { id: 'bg-solid', type: 'background', paint: { 'background-color': t.ground } },
        { id: 'bg', type: 'background', paint: { 'background-pattern': P('bg') } },
        { id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
          filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]], paint: { 'fill-pattern': P('park') } },
        { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-pattern': P('park') } },
        // Woods: forest texture when zoomed out; grass when zoomed in (trees.js then plants real-size trees).
        { id: 'landcover-wood-far', type: 'fill', source: 'omt', 'source-layer': 'landcover', maxzoom: TREE_ZOOM,
          filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-pattern': P('forest') } },
        { id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: TREE_ZOOM,
          filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-pattern': P('park') } },
        { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-pattern': P('water') } },
        { id: 'water-edge', type: 'line', source: 'omt', 'source-layer': 'water',
          paint: { 'line-color': t.waterEdge, 'line-width': S.waterEdge() } },
        { id: 'road-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
          filter: ['in', ['get', 'class'], ['literal', ROADS]], layout: { 'line-cap': 'butt', 'line-join': 'miter' },
          paint: { 'line-color': t.casing, 'line-width': S.casingWidth(), 'line-opacity': S.casingOpacity() } },
        { id: 'road-minor-far', type: 'line', source: 'omt', 'source-layer': 'transportation', maxzoom: TEXTURE_ZOOM,
          filter: ['in', ['get', 'class'], ['literal', MINOR]], layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': avg.minor, 'line-width': S.roadWidth(), 'line-opacity': S.roadOpacity() } },
        { id: 'road-far', type: 'line', source: 'omt', 'source-layer': 'transportation', maxzoom: TEXTURE_ZOOM,
          filter: ['in', ['get', 'class'], ['literal', MAJOR]], layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': avg.major, 'line-width': S.roadWidth() } },
        { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: TEXTURE_ZOOM,
          filter: ['in', ['get', 'class'], ['literal', MINOR]], layout: { 'line-cap': 'butt', 'line-join': 'miter' },
          paint: { 'line-pattern': P('roadMinor'), 'line-width': S.roadWidth() } },
        { id: 'road', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: TEXTURE_ZOOM,
          filter: ['in', ['get', 'class'], ['literal', MAJOR]], layout: { 'line-cap': 'butt', 'line-join': 'miter' },
          paint: { 'line-pattern': P('roadMajor'), 'line-width': S.roadWidth() } },
        { id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14,
          filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
          paint: { 'line-color': t.path, 'line-width': S.pathWidth(), 'line-dasharray': [2, 1] } },
        { id: 'building-shadow', type: 'fill', source: 'omt', 'source-layer': 'building',
          paint: { 'fill-color': SHADOW, 'fill-translate': SHADOW_OFFSET } },
        // One solid roof color per theme (taken from the pack's roof tile).
        { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building',
          paint: { 'fill-color': t.building, 'fill-outline-color': fadeIn(t.roofEdge) } },
        ...S.labels({ font: FONT, label: t.label, labelHalo: t.labelHalo, streetLabel: t.streetLabel,
                      streetHalo: t.streetHalo, waterHalo: t.waterEdge, parkHalo: '#2d5a23' }),
      ],
    };
  }

  // Player sprite from the pack (Tiny City has people); themes without one keep the original sprite.
  function playerFrom(ref, sheets) {
    const c = document.createElement('canvas'); c.width = c.height = 16; c.className = 'player kenney';
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    drawRef(g, ref, 0, 0, sheets);
    return c;
  }

  async function build(t) {
    const keys = new Set();
    [...Object.values(t.tex).flat(3), ...t.trees].forEach((ref) => { if (typeof ref === 'string') keys.add(ref.split(':')[0]); });
    if (t.player) keys.add(t.player.split(':')[0]);
    const sheets = {};
    await Promise.all([...keys].map(async (k) => { sheets[k] = await loadSheet(k); }));
    const images = {};
    Object.entries(t.tex).forEach(([id, grid]) => { images['k-' + t.id + '-' + id] = compose(grid, sheets); });
    const avg = { major: averageColor(images['k-' + t.id + '-roadMajor']), minor: averageColor(images['k-' + t.id + '-roadMinor']) };
    const trees = t.trees.map((ref) => compose([[[ref]]], sheets));   // single 16x16 tree sprites, transparent
    return { style: styleFor(t, avg), images, trees, player: t.player ? playerFrom(t.player, sheets) : null };
  }

  window.KenneyStyles = { THEMES, build };
})();
