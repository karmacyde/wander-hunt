/*
 * sw.js — offline support.
 *
 * Wander has no server side and no live data, so the whole app is
 * precached on install and served cache-first afterwards. Once the first
 * load succeeds the hunts work with no signal at all.
 *
 * Bump CACHE whenever a shell file changes; the old cache is deleted on
 * activate and the page shows an "Update ready" pill.
 */

const CACHE = "wander-v6";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./adventures.js",
  "./hunts.js",
  "./group.js",
  "./config.js",
  "./storage.js",
  "./photos.js",
  "./effects.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Add individually so one missing optional file can't fail the whole install.
    await Promise.all(SHELL.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: "reload" }));
      } catch (err) {
        console.warn("[sw] could not cache", url, err);
      }
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the cached shell so a deep link or a cold offline
  // start still opens the app.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match("./index.html", { ignoreSearch: true });
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok && fresh.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
