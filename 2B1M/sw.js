const CACHE_NAME = '2b1m-pwa-v2';
const SHELL_ASSETS = [
  '/2B1M/',
  '/2B1M/index.html',
  '/2B1M/favicon.svg',
  '/2B1M/icon-192.png',
  '/2B1M/icon-512.png',
  '/2B1M/apple-touch-icon.png',
  '/2B1M/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/2B1M/')) return;

  // Network-first so deployed builds always reflect fresh code immediately
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/2B1M/index.html', { ignoreSearch: true });
          }
          return undefined;
        })
      )
  );
});
