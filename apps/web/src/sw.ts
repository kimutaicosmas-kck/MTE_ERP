/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { createHandlerBoundToURL } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

try {
  registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//, /^\/uploads\//] }));
} catch {
  /* build-time only */
}

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "mte-api",
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 })],
  })
);

registerRoute(
  ({ request, url }) => request.destination === "image" || url.pathname.startsWith("/uploads/") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".jpg") || url.pathname.endsWith(".png"),
  new StaleWhileRevalidate({
    cacheName: "mte-images",
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 14 })],
  })
);

registerRoute(
  ({ request, url }) => request.destination === "style" || request.destination === "script" || request.destination === "font" || url.hostname.includes("fonts."),
  new CacheFirst({
    cacheName: "mte-static",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

self.addEventListener("push", (event) => {
  let payload = { title: "MTE ERP", body: "You have an update", url: "/" };
  try {
    payload = { ...payload, ...(event.data?.json() || {}) };
  } catch {
    payload.body = event.data?.text() || payload.body;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.jpg",
      badge: "/favicon.svg",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => "focus" in c);
      if (open) {
        open.navigate?.(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("sync", (event: any) => {
  if (event.tag === "mte-sync") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: "SYNC" }));
      })
    );
  }
});
