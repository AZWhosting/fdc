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
  var req = e.request;
  if (req.method !== 'GET') { return; }
  e.respondWith(
    fetch(req)
      .then(function (resp) {
        if (resp && (resp.ok || resp.type === 'opaque')) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return resp;
      })
      .catch(function () {
        return caches.match(req).then(function (cached) {
          if (cached) { return cached; }
          // Ne JAMAIS renvoyer index.html a la place d'une ressource (manifest.json,
          // icones .png, ...). Sinon Chrome recoit du HTML au lieu du manifest/de
          // l'icone et refuse d'installer la PWA (raccourci a icone generique).
          // Le fallback HTML ne sert que pour une navigation de page.
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return Response.error();
        });
      })
  );
});
