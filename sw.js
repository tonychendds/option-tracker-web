const CACHE = "option-tracker-v2";
const SCOPE_URL = new URL("./", self.location.href);

function scoped(path) {
  return new URL(path, SCOPE_URL).href;
}

const PRECACHE = [
  "",
  "positions/",
  "assigned/",
  "history/",
  "settings/",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
].map(scoped);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            // One missing page should not block the rest of the install.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const basePath = SCOPE_URL.pathname;
  if (!url.pathname.startsWith(basePath)) return;

  const relative = url.pathname.slice(basePath.length);
  if (relative.startsWith("_next/static/") || relative.startsWith("icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = await cache.match(scoped(""));
      if (home) return home;
    }
    return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}
