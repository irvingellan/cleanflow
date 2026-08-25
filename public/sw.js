self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Keep authenticated operational data network-only; this worker intentionally does not cache it.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
