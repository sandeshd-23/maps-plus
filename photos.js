// Your own photos for the collection book, kept on this device (IndexedDB), resized to save space.
// Exposes window.Photos = { fromFile(file) -> Promise<Blob>, put(key, blob), get(key) -> Promise<Blob|null>,
//                           url(key) -> Promise<string|null> (object URL, cached), remove(key) }.
(() => {
  const DB = 'mapsplus-photos', STORE = 'photos', MAX = 1280, QUALITY = 0.82;
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
  const tx = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
  const urls = new Map();

  // Shrink a camera photo to at most 1280 px on its long side, as JPEG.
  async function fromFile(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) { bmp = await createImageBitmap(file); }
    const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((resolve) => c.toBlob((b) => resolve(b || file), 'image/jpeg', QUALITY));
  }
  function put(key, blob) {
    if (urls.has(key)) { URL.revokeObjectURL(urls.get(key)); urls.delete(key); }
    return tx('readwrite', (s) => s.put(blob, key));
  }
  const get = (key) => tx('readonly', (s) => s.get(key)).then((b) => b || null).catch(() => null);
  async function url(key) {
    if (urls.has(key)) return urls.get(key);
    const b = await get(key);
    if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(key, u); return u;
  }
  function remove(key) {
    if (urls.has(key)) { URL.revokeObjectURL(urls.get(key)); urls.delete(key); }
    return tx('readwrite', (s) => s.delete(key));
  }
  window.Photos = { fromFile, put, get, url, remove };
})();
