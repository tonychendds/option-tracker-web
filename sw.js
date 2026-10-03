const CACHE = "option-tracker-v27";
const SCOPE_URL = new URL("./", self.location.href);

function scoped(path) {
  return new URL(path, SCOPE_URL).href;
}

const PRECACHE = [
  "",
  "positions/",
  "ideas/",
  "assigned/",
  "history/",
  "settings/",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
].map(scoped);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
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
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(
        windows.map(async (client) => {
          if (!client.url.startsWith("http") || typeof client.navigate !== "function") return;
          try {
            await client.navigate(client.url);
          } catch {
            // The page reloads itself on controllerchange when this build is already running.
          }
        }),
      );
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "GET_CACHE" && event.ports && event.ports[0]) event.ports[0].postMessage({ cache: CACHE });
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const basePath = SCOPE_URL.pathname;
  if (!url.pathname.startsWith(basePath)) return;

  const relative = url.pathname.slice(basePath.length);
  // Hashed chunks are safe to keep for this cache name. Activating a new CACHE deletes every older cache.
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
    // Bypass the browser HTTP cache so a Pages max-age cannot pin an old document or sw.js.
    const fresh = await fetch(request, { cache: "no-store" });
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
