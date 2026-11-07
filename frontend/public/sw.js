const CACHE_PREFIX = "beno-pwa-";
const STATIC_CACHE = `${CACHE_PREFIX}static-v1`;
const OFFLINE_CACHE = `${CACHE_PREFIX}offline-v1`;
const OFFLINE_URL = "/offline";
const KEEP_CACHES = [STATIC_CACHE, OFFLINE_CACHE];

function isPrivateOrApiPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/uploads" ||
    pathname.startsWith("/uploads/") ||
    ["/platform", "/admin", "/me", "/account"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

function isStaticAsset(url, request) {
  if (request.method !== "GET" || request.mode === "navigate" || request.headers.has("authorization") || isPrivateOrApiPath(url.pathname)) {
    return false;
  }
  if (url.origin === self.location.origin) {
    return (
      url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/icon" ||
      url.pathname === "/apple-icon" ||
      url.pathname === "/icon-192" ||
      url.pathname === "/icon-maskable" ||
      url.pathname.startsWith("/fonts/")
    );
  }
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch(OFFLINE_URL, { cache: "reload" });
        if (response.ok) {
          const cache = await caches.open(OFFLINE_CACHE);
          await cache.put(OFFLINE_URL, response);
        }
      } catch {
        console.warn("Could not precache the offline page; it will be retried after the next successful installation.");
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !KEEP_CACHES.includes(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.protocol !== "http:" && url.protocol !== "https:") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(async () => {
        const cachedOffline = await caches.open(OFFLINE_CACHE).then((cache) => cache.match(OFFLINE_URL));
        if (cachedOffline) return cachedOffline;
        return new Response("You're offline. Reconnect and try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }),
    );
    return;
  }

  if (!isStaticAsset(url, request)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      const cacheable = response.ok || response.type === "opaque";
      if (cacheable && !request.headers.has("authorization")) await cache.put(request, response.clone());
      return response;
    })(),
  );
});
