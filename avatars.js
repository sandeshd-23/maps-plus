// Travel-mode avatars for Maps+ (original pixel art), recolored per map theme.
// Avatars.make(themeId, modeId) -> HTMLElement (a wrapper holding a crisp, upscaled canvas).
//   modeId: 'DRIVE' | 'TWO_WHEELER' | 'WALK'. All sprites face right; use Avatars.face(el, 'left'|'right').
(() => {
  const SCALE = 3;   // on-screen pixels per sprite pixel

  // ---------- sprites (one character per pixel; '.' = transparent) ----------
  // Letters are palette slots, filled in per theme below.
  const WALKER = [
    '....KKKK....',
    '...KHHHHK...',
    '..KHHHHHHK..',
    '..KKKKKKKK..',
    '..KSSKKSSK..',
    '..KSSSSSSK..',
    '...KSSSSK...',
    '..KCCCCCCK..',
    '.KSKCCCCKSK.',
    '.KSKCCCCKSK.',
    '..KCCCCCCK..',
    '..KPPKKPPK..',
    '..KPPKKPPK..',
    '..KKK..KKK..',
  ];

  const CAR = [
    '................',
    '.....KKKKKK.....',
    '....KWWKWWWK....',
    '...KWWWKWWWWK...',
    '.KKBBBBBBBBBBKK.',
    'KBBBBBBBBBBBBBBK',
    'KBDBBBBDBBBBBBYK',
    'KBBBBBBBBBBBBBBK',
    'KKKGGGKKKKGGGKKK',
    '..KGLGK..KGLGK..',
    '...KKK....KKK...',
  ];

  const SCOOTER = [
    '......HHHH......',
    '.....HHHHHV.....',
    '.....HSSSS......',
    '......SSS.......',
    '.....CCCC.......',
    '....CCCCCSS.....',
    '....CCCC..SK....',
    '....PPPP...K....',
    '...PPPPPP..K....',
    '..BBBBBBBBBBK...',
    '..BBBBBBBBBBBB..',
    '..KBBB....BBBYK.',
    '.KGGGK...KGGGK..',
    '.KGLGK...KGLGK..',
    '..KKK.....KKK...',
  ];

  const BICYCLE = [
    '......HHH.......',
    '.....HSSS.......',
    '......SS........',
    '.....CCCC.......',
    '....CCCCCSS.....',
    '.....CCC...K....',
    '.....PPP...K....',
    '....PP..P..K....',
    '.KKK..FFFFF.KKK.',
    'K...KF.P.F.K...K',
    'K.L.K.F.F..K.L.K',
    'K...K..F...K...K',
    '.KKK.......KKK..',
  ];

  const HORSE_RIDER = [
    '......HH..........',
    '.....HSS..........',
    '......SS.......MM.',
    '.....CCCC.....NNNM',
    '....CCCCCS...NNENN',
    '.....CCC.S..NNN.QQ',
    '....PPPPPPKNNN....',
    '..MNNPPNNNNNN.....',
    '.MMNNNNNNNNNN.....',
    '.M..NNNNNNNNN.....',
    '....NN.....NN.....',
    '....NN.....NN.....',
    '....KK.....KK.....',
  ];

  const WAGON = [
    '..KKKKKKKK.............',
    '.KWWWWWWWWK............',
    'KWWWWWWWWWWK.......MM..',
    'KWWWWWWWWWWK......NNNM.',
    'KWWWWWWWWWWK.....NNENN.',
    'KDDDDDDDDDDK....NNN.QQ.',
    'KDDDDDDDDDDKKKKNNNN....',
    'KDDDDDDDDDDK..NNNNNNN..',
    '.KGGGK.KGGGK..NNNNNNN..',
    'KGGLGGKGGLGGK.N.N..N.N.',
    '.KGGGK.KGGGK..N.N..N.N.',
    '..KKK...KKK...K.K..K.K.',
  ];

  const TRAIN = [
    '..KKKKKKKKKKKKKKKK..',
    '.KBBBBBBBBBBBBBBBBK.',
    'KBWWKWWKWWKWWKWWBBBK',
    'KBWWKWWKWWKWWKWWBBWK',
    'KBBBBBBBBBBBBBBBBBBK',
    'KTTTTTTTTTTTTTTTTTTK',
    'KBBBBBBBBBBBBBBBBBYK',
    'KKKKKKKKKKKKKKKKKKKK',
    '..KGGK......KGGK....',
    '...KK........KK.....',
    'RRRRRRRRRRRRRRRRRRRR',
  ];

  const MINECART = [
    '......HH........',
    '.....HSS........',
    '......SS........',
    '.....CCCC.......',
    '....SCCCCS......',
    '.KKKKKKKKKKKKKK.',
    '.KWWWWWWWWWWWWK.',
    '.KWDWWWWWWWWDWK.',
    '..KWWWWWWWWWWK..',
    '..KGGK....KGGK..',
    '...KK......KK...',
    'RRRRRRRRRRRRRRRR',
  ];

  // ---------- palettes per theme ----------
  const SKIN = '#f4c89c', OUTLINE = '#202020', TIRE = '#2b2b33', HUB = '#c8c8d0', GLASS = '#a4d8ff', LAMP = '#ffe066';
  const P = {
    classic: {
      walker: { H: '#e8502c', C: '#3a78d8', P: '#40406a' },
      DRIVE: { sprite: CAR, colors: { B: '#e8502c', D: '#b83a20', W: GLASS } },
      TWO_WHEELER: { sprite: SCOOTER, colors: { H: '#e8502c', V: '#202040', C: '#3a78d8', P: '#40406a', B: '#3a78d8' } },
      TRANSIT: { sprite: TRAIN, colors: { B: '#8a2d98', T: '#e6e0f0', W: GLASS, R: '#7a7a88' } },   // Namma Metro purple
    },
    roguelike: {
      walker: { H: '#6b4424', C: '#3f8a3a', P: '#8a5a2c' },
      // Covered wagon pulled by a horse, and a rider on horseback.
      DRIVE: { sprite: WAGON, colors: { W: '#f0e6c8', D: '#9a6a3a', N: '#8a5a34', M: '#4a2c17', E: '#202020', Q: '#6b4424', G: '#7a5230', L: '#c8a070' } },
      TWO_WHEELER: { sprite: HORSE_RIDER, colors: { H: '#6b4424', C: '#3f8a3a', P: '#8a5a2c', N: '#8a5a34', M: '#4a2c17', E: '#202020', Q: '#6b4424' } },
      TRANSIT: { sprite: MINECART, colors: { H: '#6b4424', C: '#3f8a3a', W: '#9a6a3a', D: '#4a2c17', R: '#8a8a8a' } },
    },
    'tiny-town': {
      walker: { H: '#eaa56c', C: '#bd6c4a', P: '#5a6988' },
      DRIVE: { sprite: CAR, colors: { B: '#c34b35', D: '#8a3426', W: '#c0cbdc' } },
      TWO_WHEELER: { sprite: BICYCLE, colors: { H: '#eaa56c', C: '#bd6c4a', P: '#5a6988', F: '#479f4a' } },
      TRANSIT: { sprite: TRAIN, colors: { B: '#479f4a', T: '#eaa56c', W: '#c0cbdc', R: '#8b9bb4' } },   // little green tram
    },
    'tiny-city': {
      walker: { H: '#3f2631', C: '#c34b35', P: '#52607c' },     // only used if the pack sprite is missing
      DRIVE: { sprite: CAR, colors: { B: '#5a6988', D: '#3f4c66', W: '#c0cbdc' } },
      TWO_WHEELER: { sprite: SCOOTER, colors: { H: '#e8eef6', V: '#202040', C: '#97695a', P: '#52607c', B: '#c34b35' } },
      TRANSIT: { sprite: TRAIN, colors: { B: '#8a2d98', T: '#c0cbdc', W: '#c0cbdc', R: '#52607c' } },
    },
  };
  const BASE = { K: OUTLINE, S: SKIN, G: TIRE, L: HUB, Y: LAMP };

  function draw(rows, colors) {
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const col = colors[ch] || BASE[ch];
      if (ch !== '.' && col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }));
    return c;
  }

  function wrap(canvas) {
    const el = document.createElement('div');
    el.className = 'avatar';
    canvas.style.cssText = `display:block;width:${canvas.width * SCALE}px;height:${canvas.height * SCALE}px;`
      + 'image-rendering:pixelated;filter:drop-shadow(2px 3px 0 #0005);transition:transform .15s steps(1);';
    el.appendChild(canvas);
    return el;
  }

  // packWalker: optional canvas (e.g. Tiny City's own person sprite) used for WALK.
  function make(themeId, modeId, packWalker) {
    const p = P[themeId] || P.classic;
    if (modeId === 'WALK' || !p[modeId]) {
      if (packWalker) {
        const c = document.createElement('canvas'); c.width = packWalker.width; c.height = packWalker.height;
        c.getContext('2d').drawImage(packWalker, 0, 0);
        return wrap(c);
      }
      return wrap(draw(WALKER, p.walker));
    }
    return wrap(draw(p[modeId].sprite, p[modeId].colors));
  }

  // Turn the avatar to face left or right (the outer element is positioned by the map, so flip the inner canvas).
  function face(el, dir) {
    const c = el && el.firstChild; if (c) c.style.transform = dir === 'left' ? 'scaleX(-1)' : '';
  }

  window.Avatars = { make, face, THEMES: Object.keys(P) };
})();
