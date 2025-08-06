const CACHE_NAME = 'kubb-tracker-cache-v1';
const urlsToCache = [
  '.',
  'index.html',
  'manifest.json',
  // Přidej sem i své CSS, JS a obrázky
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response; // cache hit
        }
        return fetch(event.request);
      })
  );
});
