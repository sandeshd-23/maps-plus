// Shared pixel-art game style for MapLibre, built on free OpenFreeMap / OpenStreetMap vector tiles.
// Exposes window.PixelMap = { style, textures, makePlayer }.
(() => {
  function tile(size, painter) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); painter(g, size);
    return g.getImageData(0, 0, size, size);
  }
  function px(g, x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }

  // Original 16x16 pixel textures, used as fill patterns.
  const textures = {
    grass: tile(16, (g) => {
      g.fillStyle = '#8fd46e'; g.fillRect(0, 0, 16, 16);
      [[2,3],[9,1],[12,9],[4,11],[7,6]].forEach(([x,y]) => {
        px(g,x,y+1,'#5fae46'); px(g,x+1,y,'#5fae46'); px(g,x+2,y+1,'#5fae46');
      });
      [[0,8],[14,4],[6,14]].forEach(([x,y]) => px(g,x,y,'#b6eb94'));
    }),
    water: tile(16, (g) => {
      g.fillStyle = '#58a8f0'; g.fillRect(0, 0, 16, 16);
      [[1,3],[9,10]].forEach(([x,y]) => {
        g.fillStyle = '#a4d8ff'; g.fillRect(x, y, 4, 1); g.fillRect(x+4, y-1, 2, 1);
      });
    }),
    tree: tile(16, (g) => {
      g.fillStyle = '#5aa848'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#1f5a24'; g.fillRect(3,1,10,13); g.fillRect(1,3,14,9);
      g.fillStyle = '#2f8a36'; g.fillRect(4,2,8,11); g.fillRect(2,4,12,7);
      g.fillStyle = '#56b250'; g.fillRect(4,3,4,3); g.fillRect(3,5,2,2);
      g.fillStyle = '#6b4424'; g.fillRect(7,13,2,3);
    }),
    pave: tile(8, (g) => {
      g.fillStyle = '#e6dcb0'; g.fillRect(0, 0, 8, 8);
      px(g,1,1,'#d4c896'); px(g,5,4,'#d4c896');
    }),
  };

  // Zoom interpolation must be the outermost expression, so per-class widths go inside each stop.
  const byClass = (big, mid, small, k) => ['match', ['get', 'class'],
    ['motorway', 'trunk', 'primary'], big * k, ['secondary', 'tertiary'], mid * k, small * k];
  const roadWidth = (big, mid, small) => ['interpolate', ['linear'], ['zoom'],
    13, byClass(big, mid, small, 0.4), 16, byClass(big, mid, small, 1), 19, byClass(big, mid, small, 3)];
  const ROADS = ['motorway','trunk','primary','secondary','tertiary','minor','service'];
  const FONT = ['Noto Sans Bold'];

  const style = {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      { id: 'bg-solid', type: 'background', paint: { 'background-color': '#e6dcb0' } },
      { id: 'bg', type: 'background', paint: { 'background-pattern': 'pave' } },
      { id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]], paint: { 'fill-pattern': 'grass' } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-pattern': 'grass' } },
      // Woods: tree texture when zoomed out; grass when zoomed in, where trees.js plants real-size trees.
      { id: 'landcover-wood-far', type: 'fill', source: 'omt', 'source-layer': 'landcover', maxzoom: 15,
        filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-pattern': 'tree' } },
      { id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: 15,
        filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-pattern': 'grass' } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-pattern': 'water' } },
      { id: 'water-edge', type: 'line', source: 'omt', 'source-layer': 'water',
        paint: { 'line-color': '#2c5d8f', 'line-width': 2 } },
      { id: 'road-casing', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ROADS]],
        layout: { 'line-cap': 'square', 'line-join': 'miter' },
        paint: { 'line-color': '#7a5a36', 'line-width': roadWidth(14, 11, 8) } },
      { id: 'road', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ROADS]],
        layout: { 'line-cap': 'square', 'line-join': 'miter' },
        paint: { 'line-color': ['match', ['get','class'], ['motorway','trunk','primary'], '#f7c860', '#f2dc9a'],
          'line-width': roadWidth(10, 8, 5.5) } },
      { id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['path','track']]],
        paint: { 'line-color': '#c99a5b', 'line-width': 2.5, 'line-dasharray': [2, 1] } },
      // Borders and shadows fade in only when zoomed close; zoomed out they'd swallow small roofs (all black).
      { id: 'building-shadow', type: 'fill', source: 'omt', 'source-layer': 'building',
        paint: { 'fill-color': ['interpolate', ['linear'], ['zoom'], 15.3, 'rgba(0,0,0,0)', 16.8, 'rgba(0,0,0,0.33)'],
                 'fill-translate': ['interpolate', ['linear'], ['zoom'], 15.3, ['literal', [0, 0]], 16.8, ['literal', [3, 3]]] } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building',
        paint: { 'fill-color': '#d8644a',   // one solid roof color
          'fill-outline-color': ['interpolate', ['linear'], ['zoom'], 15.3, 'rgba(42,32,48,0)', 16.8, '#2a2030'] } },
      { id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        layout: { 'text-field': ['upcase', ['get','name']], 'text-font': FONT, 'text-size': 15 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#1d3c66', 'text-halo-width': 2 } },
      { id: 'street-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name',
        filter: ['in', ['get','class'], ['literal', ['primary','secondary','tertiary','minor']]],
        layout: { 'symbol-placement': 'line', 'text-field': ['upcase', ['get','name']],
          'text-font': FONT, 'text-size': 13, 'text-letter-spacing': 0.05 },
        paint: { 'text-color': '#3a2a18', 'text-halo-color': '#f2dc9a', 'text-halo-width': 1.5 } },
      { id: 'park-name', type: 'symbol', source: 'omt', 'source-layer': 'poi',
        filter: ['==', ['get','class'], 'park'],
        layout: { 'text-field': ['upcase', ['get','name']], 'text-font': FONT, 'text-size': 15 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#225a24', 'text-halo-width': 2 } },
      { id: 'place-name', type: 'symbol', source: 'omt', 'source-layer': 'place',
        layout: { 'text-field': ['upcase', ['get','name']], 'text-font': FONT, 'text-size': 18 },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#202030', 'text-halo-width': 2.5 } },
    ],
  };

  // Original 12x14 player sprite.
  function makePlayer(className = 'player') {
    const rows = ['....KKKK....','...KRRRRK...','..KRRRRRRK..','..KKKKKKKK..','..KSSKKSSK..','..KSSSSSSK..',
                  '...KSSSSK...','..KBBBBBBK..','.KSKBBBBKSK.','.KSKBBBBKSK.','..KBBBBBBK..','..KNNKKNNK..',
                  '..KNNKKNNK..','..KKK..KKK..'];
    const pal = { K:'#202020', R:'#e8502c', S:'#f4c89c', B:'#3a78d8', N:'#40406a' };
    const c = document.createElement('canvas'); c.width = 12; c.height = 14; c.className = className;
    const g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) px(g, x, y, pal[ch]); }));
    return c;
  }

  // Register the textures on a map. Background patterns don't always trigger 'styleimagemissing',
  // so add everything once the style loads, and keep the missing-image hook as a fallback.
  function attach(map) {
    const add = (id) => { if (textures[id] && !map.hasImage(id)) map.addImage(id, textures[id]); };
    map.on('style.load', () => Object.keys(textures).forEach(add));
    map.on('styleimagemissing', (e) => add(e.id));
  }

  // Original 16x16 tree sprites on transparent background, for trees.js (round tree + pine).
  const treeIcons = [
    tile(16, (g) => {
      g.fillStyle = '#1f5a24'; g.fillRect(3,1,10,11); g.fillRect(1,3,14,7);
      g.fillStyle = '#2f8a36'; g.fillRect(4,2,8,9); g.fillRect(2,4,12,5);
      g.fillStyle = '#56b250'; g.fillRect(4,3,4,3); g.fillRect(3,5,2,2);
      g.fillStyle = '#3d2a1a'; g.fillRect(6,12,4,4); g.fillStyle = '#6b4424'; g.fillRect(7,12,2,4);
    }),
    tile(16, (g) => {
      g.fillStyle = '#17451c';
      [[7,0,2],[6,2,4],[5,4,6],[4,6,8],[3,8,10],[2,10,12]].forEach(([x,y,w]) => g.fillRect(x,y,w,2));
      g.fillStyle = '#2a7a33';
      [[7,1,2],[6,3,3],[5,5,4],[4,7,5],[3,9,6],[3,11,7]].forEach(([x,y,w]) => g.fillRect(x,y,w,1));
      g.fillStyle = '#6b4424'; g.fillRect(7,12,2,4);
    }),
  ];

  window.PixelMap = { style, textures, makePlayer, attach, treeIcons };
})();
