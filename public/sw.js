// Alora PWA Service Worker
const CACHE_NAME = "alora-pwa-v1";
const PRECACHE_ASSETS = [
  "/",
  "/inbox",
  "/playground",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

// Install: precache app shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("Pre-caching assets failed:", err);
      });
    }),
  );
});

// Activate: clean up outdated caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }).then(() => self.clients.claim()),
  );
});

// Fetch: Network-first with cache fallback for pages, Cache-first for icons/static
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API or Next.js development hot-reload requests
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/webpack-hmr")
  ) {
    return;
  }

  // Static icons: cache-first
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
        );
      }),
    );
    return;
  }

  // App pages: Network-first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === "navigate") {
            return caches.match("/inbox") || caches.match("/");
          }
          return new Response("Offline", { status: 503, statusText: "Offline" });
        });
      }),
  );
});

// Push: Show system notification when customer messages arrive
self.addEventListener("push", (event) => {
  let payload = {
    title: "Alora — New Customer Message",
    body: "You have a new message waiting in your inbox.",
    url: "/inbox",
    tag: "alora-message",
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = { ...payload, ...json };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    vibrate: [100, 50, 100],
    data: { url: payload.url || "/inbox" },
    tag: payload.tag || "alora-notification",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Notification click: Focus or open the Inbox
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/inbox";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
