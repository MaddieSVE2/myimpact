const CACHE_VERSION = "v3";
const SHELL_CACHE = `my-impact-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `my-impact-assets-${CACHE_VERSION}`;
const KNOWN_CACHES = new Set([SHELL_CACHE, ASSET_CACHE]);

self.addEventListener("install", (event) => {
  // Pre-warm the shell cache with the app entry. Best-effort: don't block
  // install if the network is flaky — the network-first fetch handler will
  // populate the cache on first successful navigation.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request("./", { cache: "reload" })))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !KNOWN_CACHES.has(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isNavigationRequest(request) {
  if (request.mode === "navigate") return true;
  if (request.method !== "GET") return false;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isHashedAsset(url) {
  // Vite emits hashed filenames under /assets/ (configurable, but this is
  // the default for our build). Matching on the path keeps cache-first
  // behaviour for anything safely versioned.
  // Vite default: `[name]-[hash].[ext]` (e.g. /assets/index-CiYatGOC.js).
  return /\/assets\/.+[-.][A-Za-z0-9_-]{8,}\.[a-zA-Z0-9]+$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same-origin only. Don't intercept cross-origin (fonts, analytics, etc.).
  if (url.origin !== self.location.origin) return;

  // Never intercept the API or the service worker itself.
  if (url.pathname.startsWith("/api/") || url.pathname.endsWith("service-worker.js")) {
    return;
  }

  // Network-first for HTML/navigations so a redeploy is picked up immediately.
  // The cached shell is only used as an offline fallback.
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // Only cache successful basic responses for the app shell.
          if (networkResponse && networkResponse.ok && networkResponse.type === "basic") {
            const cache = await caches.open(SHELL_CACHE);
            cache.put("./", networkResponse.clone()).catch(() => undefined);
          }
          return networkResponse;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = (await cache.match(request)) || (await cache.match("./"));
          if (cached) return cached;
          return new Response("Offline", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  // Cache-first for hashed static assets — their filenames change on every
  // deploy so stale entries are harmless and they're safe to serve offline.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok && response.type === "basic") {
            cache.put(request, response.clone()).catch(() => undefined);
          }
          return response;
        } catch {
          return new Response("Offline", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain" },
          });
        }
      })
    );
    return;
  }

  // Everything else: pass through to the network and only fall back to the
  // cache if the network fails (stale-while-offline).
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response("Offline", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain" },
      });
    })
  );
});

// ── Web Push handlers ──────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      try {
        payload = { title: "My Impact", body: event.data.text() };
      } catch {
        payload = {};
      }
    }
  }

  const title = payload.title || "My Impact";
  const body = payload.body || "Open My Impact to see what's new.";
  const url = payload.url || "/";
  const tag = payload.tag || payload.type || "my-impact";

  const options = {
    body,
    tag,
    renotify: true,
    badge: "./images/icon-192.png",
    icon: "./images/icon-192.png",
    data: { url, type: payload.type || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = (event.notification.data && event.notification.data.url) || "/";
  // Resolve to an absolute URL inside the SW's scope.
  const targetUrl = new URL(targetPath.replace(/^\//, ""), self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url);
          const targetUrlObj = new URL(targetUrl);
          if (clientUrl.origin === targetUrlObj.origin && "focus" in client) {
            client.focus();
            if ("navigate" in client) {
              try {
                return client.navigate(targetUrl);
              } catch {
                return client;
              }
            }
            return client;
          }
        } catch {
          // ignore malformed client URL
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return null;
    })
  );
});
