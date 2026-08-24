self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const cl = await self.clients.matchAll({ type: "window" });
      cl.forEach((c) => c.navigate(c.url.split("#")[0]));
    })(),
  );
});
