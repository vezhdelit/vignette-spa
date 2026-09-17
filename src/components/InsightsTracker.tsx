import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import {
  flush,
  takeSigninMethod,
  track,
  trackOncePerSession,
} from "@/lib/insights"
import { useAuthStore } from "@/stores/auth"

/**
 * The lifecycle events no single component owns, kept in one place so the
 * SPA reports the same shape as the Nuxt site (plugins/insights.client.js)
 * and the two are comparable in the panel:
 *
 *   app.opened             once per session, and again when the tab comes
 *                          back after a long absence. Always carries `via`
 *                          (cold · foreground · push · link) — the dimension
 *                          that says what caused the visit, and the one all
 *                          three clients have to agree on
 *   notification.opened    a push was tapped (the service worker marks the
 *                          URL; nothing else can tell)
 *   app.link_opened        arrived through a campaign link or an external
 *                          referrer — never both this and notification.opened
 *                          for one arrival, which would count it twice
 *   page.viewed            on every navigation to a new path
 *   user.identified        when a real account replaces the guest, once per
 *                          user per browser, so the guest's earlier events
 *                          join it
 *   user.signin_completed  every successful sign-in, with the method the
 *                          flow started with — which user.identified cannot
 *                          answer, being once-per-user by design
 *
 * Renders nothing. Must sit inside the router — it reads the location.
 */

const IDENTIFIED_KEY = "vignette_identified_for"
/** Matches the session rotation window in lib/insights. */
const SESSION_GAP_MS = 30 * 60 * 1000

/** "/" → "index", "/vignettes" → "vignettes". The Pages breakdown reads it. */
const pageName = (pathname: string): string => {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "")
  return trimmed || "index"
}

/** What the service worker adds to the URL when a push is tapped (sw.js). */
const PUSH_PARAMS = ["vsrc", "vtype", "void"]
/** Campaign markers — a visit carrying one arrived through a link we placed. */
const CAMPAIGN_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "ref"]

/**
 * How this visit started, read once before anything strips the URL.
 *
 * `via` is what makes a session attributable, and it is the one dimension
 * the three clients have to agree on: the native apps can be opened by a
 * launch, a push tap or a deep link, and so can this one. Without it every
 * arrival is a single undifferentiated number.
 */
const readArrival = () => {
  if (typeof window === "undefined") return { via: "cold" as const }
  const params = new URLSearchParams(window.location.search)

  if (params.get("vsrc") === "push") {
    return {
      via: "push" as const,
      notification: {
        type: params.get("vtype") || undefined,
        orderId: params.get("void") || undefined,
      },
    }
  }

  const campaign = CAMPAIGN_PARAMS.map((key) => params.get(key)).find(Boolean)
  if (campaign) return { via: "link" as const, source: campaign }

  // An external referrer is the other kind of link: someone followed one to
  // get here, we just did not place it ourselves.
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname
      if (host && host !== window.location.hostname) {
        return { via: "link" as const, source: host.replace(/^www\./, "") }
      }
    }
  } catch {
    /* an unparseable referrer is no referrer */
  }

  return { via: "cold" as const }
}

/**
 * Takes the service worker's markers back out of the address bar, so they
 * never end up in a page view, a bookmark or a shared link. Replaces the
 * history entry rather than pushing one, so Back still leaves the app.
 */
const stripPushParams = () => {
  try {
    const url = new URL(window.location.href)
    if (!PUSH_PARAMS.some((key) => url.searchParams.has(key))) return
    PUSH_PARAMS.forEach((key) => url.searchParams.delete(key))
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
  } catch {
    /* leaving them in the URL is cosmetic, not worth throwing over */
  }
}

export function InsightsTracker() {
  const location = useLocation()
  // Only a real account identifies; the guest session is not a person
  // signing in, it is how this app talks to the API at all.
  const accountId = useAuthStore((s) => (s.user && !s.user.guest ? s.user.id : null))

  // app.opened — the first view of a session. A reload inside the same
  // session is the same visit and does not repeat it.
  //
  // A push tap and a campaign link are each their own arrival and get their
  // own event besides: `notification.opened` is the only thing that can say
  // whether a push was acted on (the server knows what it sent, nothing else
  // knows what was opened), and `app.link_opened` is the same question for
  // every other kind of link. Deliberately not both for one arrival — that
  // would count it twice.
  useEffect(() => {
    const arrival = readArrival()
    stripPushParams()

    trackOncePerSession("app_opened", "app.opened", {
      page: pageName(window.location.pathname),
      via: arrival.via,
    })

    if (arrival.via === "push") {
      track(
        "notification.opened",
        { ...(arrival.notification?.type ? { type: arrival.notification.type } : {}) },
        arrival.notification?.orderId ? { order_id: arrival.notification.orderId } : {},
      )
      return
    }
    if (arrival.via === "link") {
      trackOncePerSession("app_link_opened", "app.link_opened", {
        ...(arrival.source ? { source: arrival.source } : {}),
      })
    }
  }, [])

  // Coming back after a long time away is a new visit: the id rotates on
  // its own inside track(), so this only has to announce the reopening.
  // Leaving is also the last safe moment to send whatever is still queued —
  // a phone switching apps may never run another timer.
  useEffect(() => {
    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
        flush()
        return
      }
      if (hiddenAt && Date.now() - hiddenAt > SESSION_GAP_MS) {
        track("app.opened", {
          page: pageName(window.location.pathname),
          // `resumed` predates `via` and is kept so rows already in the
          // stream stay readable next to the new ones; via: "foreground"
          // says the same thing in the vocabulary all three clients share.
          resumed: true,
          via: "foreground",
        })
      }
      hiddenAt = null
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", flush)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", flush)
    }
  }, [])

  // page.viewed — path only. A query string change is the same page with a
  // different filter on it, and counting those separately would make the
  // Pages breakdown a list of permutations.
  const lastPath = useRef<string | null>(null)
  useEffect(() => {
    if (lastPath.current === location.pathname) return
    lastPath.current = location.pathname
    track("page.viewed", { page: pageName(location.pathname) })
  }, [location.pathname])

  // user.identified — the login boundary. Remembered so a reload does not
  // resend it; the marker carries the user so switching accounts on one
  // browser identifies again.
  //
  // user.signin_completed rides alongside and is *not* the same event.
  // identified fires once per user per browser, by design, which means a
  // returning user signing in again emits nothing — so a
  // signin_started → identified funnel reports a failure every single time.
  // signin_completed fires on every successful sign-in, which is what makes
  // success rate by method measurable, and that number is what catches a
  // provider button that has quietly stopped working.
  useEffect(() => {
    if (!accountId) return

    // Only a sign-in this tab actually started counts: the remembered method
    // is the evidence. Without that guard every reload of a signed-in
    // session would look like a fresh sign-in.
    const method = takeSigninMethod()
    if (method) track("user.signin_completed", { method })

    try {
      const marker = String(accountId)
      if (window.localStorage.getItem(IDENTIFIED_KEY) === marker) return
      window.localStorage.setItem(IDENTIFIED_KEY, marker)
    } catch {
      // no storage: identify on every sign-in rather than never
    }
    track("user.identified")
  }, [accountId])

  return null
}
