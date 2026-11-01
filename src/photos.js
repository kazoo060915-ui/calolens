// 食事写真の保存（IndexedDB）と画像処理
const DB_NAME = 'calolens';
const STORE = 'photos';
const MAX_CACHE = 40;
let dbPromise;
const cache = new Map();

function setCache(id, val) {
  if (cache.has(id)) cache.delete(id);
  cache.set(id, val);
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function db() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function run(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

export async function putPhoto(id, dataUrl) {
  setCache(id, dataUrl);
  await run('readwrite', (s) => s.put(dataUrl, id));
}

export async function getPhoto(id) {
  if (cache.has(id)) return cache.get(id);
  const v = (await run('readonly', (s) => s.get(id))) ?? null;
  if (v) setCache(id, v);
  return v;
}

export async function deletePhoto(id) {
  cache.delete(id);
  await run('readwrite', (s) => s.delete(id));
}

export async function clearPhotos() {
  cache.clear();
  await run('readwrite', (s) => s.clear());
}

/** 描画後に <img data-photo="id"> へ写真を流し込む */
export async function hydratePhotos(root) {
  const imgs = root.querySelectorAll('img[data-photo]');
  for (const img of imgs) {
    try {
      const src = await getPhoto(img.dataset.photo);
      if (src) {
        img.onload = () => img.classList.add('loaded');
        img.src = src;
      }
    } catch {
      /* noop */
    }
  }
}

/* ---------- 画像処理 ---------- */

export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** 長辺 max px に縮小して JPEG の dataURL を返す */
export function resizeImage(img, max, quality = 0.8) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
