const CACHE_NAME = "puff2door-app-v5";
const STATIC_CACHE = "puff2door-static-v5";
const PUBLIC_API_CACHE = "puff2door-public-api-v5";
const APP_SHELL = ["/", "/offline.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/favicon.ico"];
const PUBLIC_API_PATHS = [
  "/api/products",
  "/api/content/home",
  "/api/brands",
  "/api/categories",
  "/api/settings",
  "/api/files/",
];

const isPublicApiRequest = (url) => {
  if (url.hostname !== "api.puff2door.com") return false;
  return PUBLIC_API_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(path));
};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const current = [CACHE_NAME, STATIC_CACHE, PUBLIC_API_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !current.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (isPublicApiRequest(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok || response.type === "opaque") {
              caches.open(PUBLIC_API_CACHE).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/offline.html"))),
    );
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || "HD Smoke Shop update";
  const options = {
    body: data.body || "Open HD Smoke Shop to see your update.",
    icon: "/icon-192.png",
    badge: "/icon-96.png",
    data: { url: data.url || "/my-account" },
    tag: data.tag || "puff2door-update",
    renotify: Boolean(data.renotify),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url === target);
      return existing ? existing.focus() : clients.openWindow(target);
    }),
  );
});
