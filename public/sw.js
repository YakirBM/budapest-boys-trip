/*
 * Budapest Trip — custom service worker (docs/07 §Service worker strategy).
 * ~200 auditable lines: versioned precache, SWR navigations, cache-first static,
 * network-first PostgREST GETs, signed-URL cache eviction, Background Sync bridge.
 * Never caches mutations, auth, or realtime endpoints.
 */

const VERSION = self.BUILD_VERSION || "dev";

try {
  importScripts("./sw-manifest.js");
} catch {
  // manifest not generated (dev) — fallback list below
}

/* global BUILD_VERSION:false */

const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const MEDIA_CACHE = `media-${VERSION}`;

const PRECACHE_URLS = (self.PRECACHE_URLS || [
  "/today",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
]);

const SUPABASE_HOST = "zgvpchdqudheiohlrrvm.supabase.co";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![SHELL_CACHE, RUNTIME_CACHE, DATA_CACHE, MEDIA_CACHE].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CACHE_OFFLINE_PACK" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(DATA_CACHE).then((cache) => Promise.allSettled(
        event.data.urls.map((url) => cache.add(url)),
      )),
    );
  }
});

/** Background Sync → wake a live client to replay the Dexie outbox. */
self.addEventListener("sync", (event) => {
  if (event.tag === "outbox-flush") {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
        for (const client of clients) client.postMessage({ type: "outbox-flush" });
        // If no client is alive, the next app open flushes (useOutboxSync).
      }),
    );
  }
});

function isPostgrestGet(url) {
  return (
    url.hostname === SUPABASE_HOST &&
    url.pathname.startsWith("/rest/v1/") &&
    !url.pathname.startsWith("/rest/v1/rpc")
  );
}

function isSignedMedia(url) {
  return (
    url.hostname === SUPABASE_HOST &&
    (url.pathname.includes("/storage/v1/object/sign/") ||
      url.pathname.includes("/storage/v1/object/authenticated/"))
  );
}

async function staleWhileRevalidate(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    void network;
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  if (fallbackUrl) {
    const fallback = await cache.match(fallbackUrl, { ignoreVary: true });
    if (fallback) return fallback;
  }
  return new Response("offline", { status: 503, statusText: "offline" });
}

async function networkFirstData(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    return new Response(JSON.stringify({ message: "offline", code: "OFFLINE" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function cacheFirstMedia(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      } else if (response.status === 400 || response.status === 403) {
        // Expired signed URL — evict so the client can re-sign and retry.
        cache.delete(request);
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
    void network;
    return cached;
  }
  const fresh = await network;
  return fresh ?? new Response("offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // mutations never cached

  const url = new URL(request.url);

  // Auth + realtime: network-only (skip handling entirely).
  if (
    url.hostname === SUPABASE_HOST &&
    (url.pathname.startsWith("/auth/v1/") || url.pathname.startsWith("/realtime/v1/"))
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE, "/offline"));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstMedia(request));
    return;
  }

  if (isSignedMedia(url)) {
    event.respondWith(cacheFirstMedia(request));
    return;
  }

  if (isPostgrestGet(url)) {
    event.respondWith(networkFirstData(request));
    return;
  }
});
