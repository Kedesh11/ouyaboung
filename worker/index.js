self.addEventListener("sync", (event) => {
  if (!event || event.tag !== "ouyaboung-offline-sync") return;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clients) {
        client.postMessage({ type: "OFFLINE_SYNC_TRIGGER" });
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const targetUrl = (notification && notification.data && notification.data.url) || "/";

  notification.close();

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const targetHref = new URL(targetUrl, self.location.origin).href;

      for (const client of allClients) {
        if (client.url === targetHref && "focus" in client) {
          await client.focus();
          return;
        }
      }

      if (allClients.length > 0 && "navigate" in allClients[0]) {
        await allClients[0].navigate(targetHref);
        await allClients[0].focus();
        return;
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetHref);
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  if (!event || !event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== "object") return;

  const title = typeof payload.title === "string" ? payload.title : "Nouvelle notification";
  const body = typeof payload.body === "string" ? payload.body : "";
  const url = typeof payload.url === "string" ? payload.url : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: { url },
      tag: `push-${Date.now()}`,
    })
  );
});
