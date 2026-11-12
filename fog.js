// Fog of war for Maps+ (opt-in). The map is covered in pixel clouds except the squares you've actually been to.
// Visited squares (~110 m) are stored only on this device. The fog is a canvas drawn right after every map frame,
// so it stays glued to the map while you pan and zoom.
// Exposes window.Fog = { attach(map), enable(bool), visit(lat, lng) -> true if that square is new, setDark(bool), count() }.
(() => {
  const KEY = 'mapsplus.visited';
  const CELL = 0.001;                 // degrees (~110 m in Bengaluru)
  const REVEAL = 1;                   // also reveal this many neighbouring squares around each visit
  const RES = 0.25;                   // fog drawn at quarter resolution for chunky pixel edges
  let visited = new Set();
  try { visited = new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...visited])); } catch (_) {} };
  const key = (i, j) => i + ':' + j;

  let map = null, canvas = null, enabled = false, dark = false, pattern = null;

  function makePattern(ctx) {
    // 8x8 cloud dither in fog colors.
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = dark ? '#161a2b' : '#e9edf3'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = dark ? '#21263b' : '#d5dce7';
    [[1, 1], [5, 2], [2, 5], [6, 6], [0, 4], [4, 0]].forEach(([x, y]) => g.fillRect(x, y, 2, 1));
    return ctx.createPattern(c, 'repeat');
  }

  function draw() {
    if (!canvas) return;
    const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
    const cw = Math.max(1, Math.round(w * RES)), ch = Math.max(1, Math.round(h * RES));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; pattern = null; }
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, cw, ch);
    if (!enabled) return;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = pattern || (pattern = makePattern(g));
    g.fillRect(0, 0, cw, ch);
    // Cut holes for visited squares that are in view.
    const b = map.getBounds();
    const i0 = Math.floor(b.getSouth() / CELL) - 1, i1 = Math.ceil(b.getNorth() / CELL) + 1;
    const j0 = Math.floor(b.getWest() / CELL) - 1, j1 = Math.ceil(b.getEast() / CELL) + 1;
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const pad = 0.15;   // overlap neighbours so revealed areas join up
    // Project all 4 corners, so squares stay correct when the map is rotated (drive mode).
    const cutCell = (i, j) => {
      const pts = [[j - pad, i + 1 + pad], [j + 1 + pad, i + 1 + pad], [j + 1 + pad, i - pad], [j - pad, i - pad]]
        .map(([x, y]) => map.project([x * CELL, y * CELL]));
      g.beginPath();
      pts.forEach((p, k) => (k ? g.lineTo(p.x * RES, p.y * RES) : g.moveTo(p.x * RES, p.y * RES)));
      g.closePath(); g.fill();
    };
    if ((i1 - i0) * (j1 - j0) < visited.size) {
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (visited.has(key(i, j))) cutCell(i, j);
    } else {
      visited.forEach((k) => {
        const [i, j] = k.split(':').map(Number);
        if (i >= i0 && i <= i1 && j >= j0 && j <= j1) cutCell(i, j);
      });
    }
    g.globalCompositeOperation = 'source-over';
  }

  function attach(m) {
    map = m;
    canvas = document.createElement('canvas');
    canvas.className = 'fog-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;';
    // Inside the canvas container, so markers (your avatar, flags) stay above the fog.
    map.getCanvasContainer().appendChild(canvas);
    map.on('render', draw);
    map.on('resize', draw);
  }

  // Returns true if the square you're standing in was new (neighbours are revealed too, but don't count).
  function visit(lat, lng) {
    const ci = Math.floor(lat / CELL), cj = Math.floor(lng / CELL);
    const isNew = !visited.has(key(ci, cj));
    let added = 0;
    for (let di = -REVEAL; di <= REVEAL; di++) for (let dj = -REVEAL; dj <= REVEAL; dj++) {
      const k = key(ci + di, cj + dj);
      if (!visited.has(k)) { visited.add(k); added++; }
    }
    if (added) { save(); draw(); }
    return isNew;
  }

  window.Fog = {
    attach, visit,
    enable(on) { enabled = !!on; draw(); },
    setDark(on) { if (dark !== !!on) { dark = !!on; pattern = null; draw(); } },
    count: () => visited.size,
    get enabled() { return enabled; },
  };
})();
