// Crisp pixel art at any screen sharpness, for Maps+.
// "Sharp" mode draws the map at the screen's real resolution (rounded to a whole number), and every pixel-art
// image is enlarged by a WHOLE number with nearest-neighbour scaling first, so each art pixel becomes an exact
// block of screen pixels (no blur). "Chunky" mode keeps the original half-resolution look.
// Exposes window.Crisp = { mode, ratio, setMode(m), add(map, id, imageData, cssPerTexel), canvas(src, cssScale) }.
(() => {
  const KEY = 'mapsplus.render';
  const dpr = () => window.devicePixelRatio || 1;
  let mode;
  try { mode = localStorage.getItem(KEY); } catch (_) {}
  if (mode !== 'sharp' && mode !== 'chunky') mode = dpr() >= 1.5 ? 'sharp' : 'chunky';   // phones/retina: sharp

  // Map canvas pixels per CSS pixel.
  const ratio = () => (mode === 'sharp' ? Math.max(1, Math.round(dpr())) : 0.5);

  function upscale(img, s) {
    const out = new ImageData(img.width * s, img.height * s), src = img.data, dst = out.data;
    for (let y = 0; y < out.height; y++) {
      const sy = (y / s) | 0;
      for (let x = 0; x < out.width; x++) {
        const si = (sy * img.width + ((x / s) | 0)) * 4, di = (y * out.width + x) * 4;
        dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
      }
    }
    return out;
  }

  // Add (or replace) a map image so each source pixel covers `cssPerTexel` CSS pixels, crisply.
  function add(map, id, img, cssPerTexel) {
    const P = ratio(), s = cssPerTexel * P;
    let data = img, pr = 1 / cssPerTexel;
    if (Number.isInteger(s) && s > 1) { data = upscale(img, s); pr = P; }
    if (map.hasImage(id)) {
      // updateImage only works for the same size (it reports an error instead of throwing), so check first.
      const old = map.getImage && map.getImage(id);
      const same = old && old.data && old.data.width === data.width && old.data.height === data.height && old.pixelRatio === pr;
      if (same) { try { map.updateImage(id, data); return; } catch (_) {} }
      map.removeImage(id);
    }
    map.addImage(id, data, { pixelRatio: pr });
  }

  // A DOM canvas copy of `src`, shown at cssScale x its size but drawn at screen resolution (crisp everywhere,
  // even on browsers that ignore `image-rendering: pixelated`).
  function canvas(src, cssScale) {
    const k = Math.max(1, Math.round(cssScale * Math.max(1, Math.round(dpr()))));
    const c = document.createElement('canvas');
    c.width = src.width * k; c.height = src.height * k;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    c.style.width = src.width * cssScale + 'px'; c.style.height = src.height * cssScale + 'px';
    c.style.imageRendering = 'pixelated';
    return c;
  }

  window.Crisp = {
    get mode() { return mode; },
    ratio,
    setMode(m) { mode = m === 'chunky' ? 'chunky' : 'sharp'; try { localStorage.setItem(KEY, mode); } catch (_) {} },
    add, canvas, upscale,
  };
})();
