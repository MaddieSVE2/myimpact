const CACHE_NAME = "my-impact-shell-v2";
const SHELL_ASSETS = ["./"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Never cache the service worker request itself, and let API/auth go straight to the network.
  const url = new URL(event.request.url);
  if (url.pathname.includes("/api/") || url.pathname.endsWith("service-worker.js")) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        return new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
        });
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
