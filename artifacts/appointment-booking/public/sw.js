// Kavati Service Worker
// Bumping CACHE_VERSION forces a fresh cache on deploy. Old caches are
// cleaned up during activate.
const CACHE_VERSION = "v1";
const CACHE = `kavati-${CACHE_VERSION}`;

// Minimal app shell — enough to render the install/offline fallback page
// without a network round-trip. The Vite bundle hashes every asset so we
// can't precache the whole app; the fetch handler below caches JS/CSS on
// first successful response instead.
const SHELL = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {
      // Some URLs may 404 in preview builds; don't block the install.
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategy:
//   /api/*              → always network, never touch cache (dynamic data)
//   non-GET             → always network
//   everything else     → network-first, cache fallback
//
// Network-first (not cache-first) means users ALWAYS get the latest
// deploy when they're online, and still get a last-known copy when
// offline — matching Railway's "deploy = instant update" expectation.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // skip third-party
  if (url.pathname.startsWith("/api/")) return; // never cache the API

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/")))
  );
});

// Allow the page to force an update (used by the "check for updates"
// button in the install page — lets users pull the latest PWA without
// having to wait for the periodic SW update cycle).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
