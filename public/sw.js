/* Ranker install worker. Leaves every other Retroverse request to the browser. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  const path = url.pathname;
  const rankerAsset =
    path === "/ranker" ||
    path.startsWith("/ranker/") ||
    path.startsWith("/data/ranker/") ||
    path.startsWith("/icons/ranker");
  if (!rankerAsset) return;
  event.respondWith(fetch(event.request));
});
