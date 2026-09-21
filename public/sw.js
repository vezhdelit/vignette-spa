// Web push service worker — the presenting half of vignette.id's
// docs/push/web-integration.md. The push payload is the server's internal
// notification shape as plain JSON ({ title, body, data }, no aps wrapper):
// this worker shows it in the visitor's language, and a tap deep-links into
// the app's orders (Home).
//
// Translation happens here, not on the server (docs/push/ios-integration.md
// §3 "Rendering the device's language"): `title`/`body` are the English
// fallback, and `data.loc` names the `notifications.<type>.*` locale keys
// (single-brace `{name}` placeholders) plus the raw arguments. The catalog for the active UI language is written by the page
// (src/lib/push-catalog.ts) into the Cache API under CATALOG_URL — a worker
// has no localStorage, no module state and no env, and must never fetch on a
// push event it may only have seconds for. Per field: catalog template if
// present, else the English. A missing catalog is the designed degradation,
// never a raw key.
const CATALOG_CACHE = "vignette-push-catalog"
const CATALOG_URL = "/__push-catalog"
// The vignette countries' zone: validity ends at 23:59 there, and a device
// elsewhere would otherwise roll the date.
const TIME_ZONE = "Europe/Berlin"

async function loadCatalog() {
  try {
    const cache = await caches.open(CATALOG_CACHE)
    const hit = await cache.match(CATALOG_URL)
    return hit ? await hit.json() : null
  } catch {
    return null
  }
}

// Same rule as src/i18n#formattingLocale: plain "en" is US conventions,
// this product's English has always shown day first.
const formattingLocale = (language) => (language === "en" ? "en-GB" : language)

// The argument vocabulary — the twin of src/lib/push-catalog.ts#formatArg;
// keep the two in step or the banner and the inbox disagree.
function formatArg(name, value, catalog) {
  const locale = formattingLocale(catalog.language)
  try {
    switch (name) {
      case "country":
      case "country_a":
      case "country_b": {
        const code = String(value).toUpperCase()
        const label = new Intl.DisplayNames([locale], { type: "region" }).of(code)
        return label && label !== code ? label : code
      }
      case "expires_at":
      case "start_date":
      case "end_date":
      case "date":
        // Numeric on purpose: a spelled month ends with an abbreviation
        // point in several languages ("30 вер. 2026 р.") and the templates
        // end with their own full stop.
        return new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: TIME_ZONE,
        }).format(new Date(Number(value) * 1000))
      case "amount":
      case "bonus":
        return new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Number(value) / 100)
      case "period": {
        // The order's period as stored: a day count or an annual code. The
        // wording ("10-day", "annual") is itself in the catalog.
        const annual = String(value).includes("j") || Number(value) >= 365
        const strings = catalog.strings || {}
        if (annual) return strings["notifications.period.annual"] || "annual"
        const template = strings["notifications.period.days"] || "{count}-day"
        return template.replace("{count}", String(Number(value)))
      }
      default:
        return String(value)
    }
  } catch {
    return String(value)
  }
}

function renderField(key, args, fallback, catalog) {
  if (!key || !catalog || !catalog.strings) return fallback
  const template = catalog.strings[key]
  if (typeof template !== "string") return fallback
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(args, name)
      ? formatArg(name, args[name], catalog)
      : whole
  )
}

// { title, body, lang } for showNotification — localized when the payload
// carries `loc` and the page left a catalog behind, the English otherwise.
async function localize(payload) {
  const english = { title: payload.title, body: payload.body, lang: undefined }
  const loc = payload.data && payload.data.loc
  if (!loc || typeof loc !== "object") return english

  const catalog = await loadCatalog()
  if (!catalog) return english

  const args = loc.args && typeof loc.args === "object" ? loc.args : {}
  return {
    title: renderField(loc.title, args, payload.title, catalog),
    body: renderField(loc.body, args, payload.body, catalog),
    lang: catalog.language,
  }
}

self.addEventListener("push", (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    /* not JSON — show the fallback below */
  }

  event.waitUntil(
    localize(payload)
      .catch(() => ({ title: payload.title, body: payload.body }))
      .then(({ title, body, lang }) =>
        self.registration.showNotification(title || "Vignette ID", {
          body: body || "",
          data: payload.data || {},
          lang,
          // The server's collapse key (one per order lifecycle, one per
          // vignette's expiry): a newer moment replaces the stale banner
          // instead of stacking. Older payloads without it fall back to the
          // order id.
          tag: payload.tag || (payload.data && payload.data.order_id) || undefined,
        })
      )
  )
})

// Every alert today is order-scoped, so a tap always lands on Home (where
// orders are listed) — focusing an open tab of this origin when there is
// one, opening a fresh one otherwise.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  // Tell the app it was opened by a push, so it can report
  // `notification.opened` and `app.opened` with via: "push". Nothing else
  // can know: a service worker has no client credential and no session, so
  // it cannot send an event itself, and a navigation to "/" is
  // indistinguishable from someone typing the address. InsightsTracker reads
  // these and strips them from the URL immediately, so they never reach a
  // page view or a shared link.
  const data = event.notification.data || {}
  const params = new URLSearchParams({ vsrc: "push" })
  if (data.type) params.set("vtype", String(data.type))
  if (data.order_id) params.set("void", String(data.order_id))
  const target = `/?${params.toString()}`

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
