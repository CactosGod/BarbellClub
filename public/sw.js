/* Minimal service worker so Chromium treats the app as installable.
   Network-only: no offline cache for now. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Required for installability; requests go to the network as usual.
});
