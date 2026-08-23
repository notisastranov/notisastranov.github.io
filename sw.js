/* Astranov service worker — network-only OS kernel. Never serve a stale build. */
const CACHE = 'astranov-v59-phoneos';

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(Promise.resolve());
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isKernel(url) {
  if (url.origin !== self.location.origin) return false;
  var p = url.pathname;
  return (
    p === '/' ||
    p === '/index.html' ||
    p === '/sw.js' ||
    p.indexOf('/js/') === 0 ||
    /^\/astranov-/.test(p)
  );
}

self.addEventListener('message', function (e) {
  var data = e.data || {};
  if (data.type === 'SN_PURGE' || data === 'SN_PURGE') {
    e.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
    );
  }
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (isKernel(url)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(function () {
        return fetch(e.request);
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request).catch(function () {
      return caches.match(e.request);
    })
  );
});
