/* 20260825022100-bootlaw kill switch — never cache, never navigate, unregister */
self.addEventListener("install", function (e) {
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.registration.unregister();
    }).then(function () {
      return self.clients.claim();
    })
  );
});
self.addEventListener("fetch", function (e) {
  e.respondWith(fetch(e.request, { cache: "no-store" }));
});
