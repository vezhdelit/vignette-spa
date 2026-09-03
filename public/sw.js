// Web push service worker — ported from vignette-auth-tester-spa/public/sw.js,
// the presenting half of vignette.id's docs/push/web-integration.md. The push
// payload is the server's internal notification shape as plain JSON
// ({ title, body, data }, no aps wrapper): this worker shows it, and a tap
// deep-links into the app's orders (Home).
self.addEventListener("push", (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    /* not JSON — show the fallback below */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Vignette ID", {
      body: payload.body || "",
      data: payload.data || {},
      // One notification per order: a newer status replaces the stale one
      // instead of stacking.
      tag: (payload.data && payload.data.order_id) || undefined,
    })
  )
})

// Every alert today is order-scoped, so a tap always lands on Home (where
// orders are listed) — focusing an open tab of this origin when there is
// one, opening a fresh one otherwise.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = "/"

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const win of windows) {
          if (new URL(win.url).origin === self.location.origin) {
            win.navigate(target)
            return win.focus()
          }
        }
        return self.clients.openWindow(target)
      })
  )
})
