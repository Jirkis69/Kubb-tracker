const CACHE_VERSION = 'kubb-tracker-cache-v3';  // nastav si verzi podle potřeby
const CACHE_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/favicon.ico',
  // další soubory ke kešování, pokud máš
];

// Instalace SW a kešování souborů
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Instalace a kešování...');
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(CACHE_FILES);
    }).then(() => {
      // Ihned aktivovat SW bez čekání
      return self.skipWaiting();
    })
  );
});

// Aktivace SW - odstraň staré keše a pošli verzi do stránky
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Aktivace', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('kubb-tracker-cache-') && name !== CACHE_VERSION)
          .map(name => caches.delete(name))
      );
    }).then(() => {
      // Předat verzi cache všem klientům (otevřeným stránkám)
      return self.clients.matchAll();
    }).then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'CACHE_VERSION', version: CACHE_VERSION });
      });
    }).then(() => {
      // Převzít kontrolu nad stránkami ihned
      return self.clients.claim();
    })
  );
});

// Zachytávání fetch požadavků a obsluha z cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => {
      return resp || fetch(event.request).then(response => {
        return caches.open(CACHE_VERSION).then(cache => {
          cache.put(event.request, response.clone());
          return response;
        });
      }).catch(() => {
        // fallback pokud chceš (např. offline stránka)
      });
    })
  );
});

// Poslech zpráv od stránky (např. skipWaiting)
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
