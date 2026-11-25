/* FixAm service worker — push notifications + offline shell (minimal P0-08 version).
   Real caching strategy lands with the app shell in P0-07/P5-05. */

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "FixAm", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-badge-96.png",
      data: { link: data.link || "/" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const link = event.notification.data?.link || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(link)
          return client.focus()
        }
      }
      return self.clients.openWindow(link)
    })
  )
})
