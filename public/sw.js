// Hashed build assets are immutable, so they are served cache-first. Pages use the network and fall back offline. The API is never cached here.
// Bump CACHE when this file's behaviour changes, so old caches are dropped.
const CACHE = "rhythm-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

/** A network request that gives up, so a stalled server never leaves a navigation or a page chunk spinning. */
const fetchWithin = (request, ms) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(t));
};

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetchWithin(event.request, 20000);
        // A missing chunk comes back as the HTML app shell; caching that would break the page for good.
        if (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html")) await cache.put(event.request, res.clone());
        return res;
      }),
    );
  } else if (event.request.mode === "navigate") {
    event.respondWith(
      fetchWithin(event.request, 15000)
        .then(async (res) => {
          if (res.ok) await caches.open(CACHE).then((cache) => cache.put("/", res.clone())).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match("/")) ?? Response.error()),
    );
  }
});
