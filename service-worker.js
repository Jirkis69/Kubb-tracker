const CACHE_VERSION = 'v5';
const CACHE_NAME = `kubb-cache-${CACHE_VERSION}`;
const FILES_TO_CACHE = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'service-worker.js',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  console.log('[ServiceWorker] Instalace – cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[ServiceWorker] Přednačítám soubory s cache: reload');
      const cachePromises = FILES_TO_CACHE.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) {
            await cache.put(url, response.clone());
            console.log(`[ServiceWorker] Cached: ${url}`);
          } else {
            console.warn(`[ServiceWorker] Nelze načíst ${url}`, response.status);
          }
        } catch (err) {
          console.error(`[ServiceWorker] Chyba při načítání ${url}:`, err);
        }
      });
      return Promise.all(cachePromises);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Aktivace – mazání starých cache');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME && name.startsWith('kubb-cache-')) {
            console.log('[ServiceWorker] Mažu starou cache:', name);
            return caches.delete(name);
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
      // Volitelný fallback
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
