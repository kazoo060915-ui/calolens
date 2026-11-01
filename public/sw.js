// CaloLens Service Worker
// アプリ本体をキャッシュしてオフラインでも起動できるようにする（AI解析はオンライン時のみ）
const CACHE = 'calolens-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Gemini APIなど外部APIはキャッシュしない
  if (url.hostname.includes('googleapis.com') && !url.hostname.startsWith('fonts')) return;

  // ネットワーク優先、失敗時はキャッシュ（ページ遷移時のみ '/' にフォールバック）
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && (url.origin === location.origin || url.hostname.startsWith('fonts'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((r) => r || (request.mode === 'navigate' ? caches.match('/') : Response.error()))
      )
  );
});
