const CACHE_VERSION = 'v6'; // Zvýšeno z v4
const CACHE_NAME = `kubb-cache-${CACHE_VERSION}`;
const FILES_TO_CACHE = [
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'service-worker.js',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  console.log('[ServiceWorker] Instalace, cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachePromises = FILES_TO_CACHE.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) {
            await cache.put(url, response.clone());
          } else {
            console.warn(`[ServiceWorker] Nelze fetchnout: ${url}`, response.status);
          }
        } catch (err) {
          console.error(`[ServiceWorker] Chyba při fetchu ${url}:`, err);
        }
      });
      return Promise.all(cachePromises);
    })
  );
  self.skipWaiting(); // okamžitá aktivace nové verze
});

self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Aktivace, mazání starých cache');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('kubb-cache-')) {
            console.log('[ServiceWorker] Odstraňuji starou cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => {
      // fallback, pokud by bylo třeba
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    console.log('[ServiceWorker] Přijata zpráva skipWaiting');
    self.skipWaiting();
  }
});

