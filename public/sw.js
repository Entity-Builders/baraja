const CACHE_NAME = 'baraja-pwa-v2';
const APP_SHELL = ['/', '/manifest.webmanifest', '/baraja-app-icon.svg'];

function isCacheableRequest(request) {
  const url = new URL(request.url);

  return (
    request.method === 'GET' &&
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/@vite/') &&
    !url.pathname.startsWith('/node_modules/.vite/') &&
    !url.pathname.startsWith('/src/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!isCacheableRequest(request)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cached) => cached ?? fetch(request).then((response) => {
        if (!response.ok) {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }))
  );
});
