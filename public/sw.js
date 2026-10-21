/*
 * Written by Buildy when the Installable app setting is turned off.
 * Browsers that already installed the previous service worker pick this one up
 * on their next visit. It clears the caches, unregisters itself, and reloads
 * open tabs so they run without a service worker. Safe to delete later.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("buildy-pwa-")).map((key) => caches.delete(key))
      );
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});
