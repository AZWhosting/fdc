// Service worker - Fond de caisse
// Strategie "reseau d'abord" : quand tu es en ligne, l'app charge TOUJOURS
// la derniere version (plus besoin de changer un numero de version a chaque maj).
// Une copie est gardee en cache et ne sert que si le reseau est indisponible.
const CACHE = 'fond-caisse';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }
  e.respondWith(
    fetch(e.request)
      .then(function (resp) {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
        }
        return resp;
      })
      .catch(function () {
        return caches.match(e.request).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
  );
});
