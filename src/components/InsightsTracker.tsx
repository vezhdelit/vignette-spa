import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { flush, track, trackOncePerSession } from "@/lib/insights"
import { useAuthStore } from "@/stores/auth"

/**
 * The lifecycle events no single component owns, kept in one place so the
 * SPA reports the same shape as the Nuxt site (plugins/insights.client.js)
 * and the two are comparable in the panel:
 *
 *   app.opened       once per session, and again when the tab comes back
 *                    after a long absence
 *   page.viewed      on every navigation to a new path
 *   user.identified  when a real account replaces the guest, once per user
 *                    per browser, so the guest's earlier events join it
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

export function InsightsTracker() {
  const location = useLocation()
  // Only a real account identifies; the guest session is not a person
  // signing in, it is how this app talks to the API at all.
  const accountId = useAuthStore((s) => (s.user && !s.user.guest ? s.user.id : null))

  // app.opened — the first view of a session. A reload inside the same
  // session is the same visit and does not repeat it.
  useEffect(() => {
    trackOncePerSession("app_opened", "app.opened", {
      page: pageName(window.location.pathname),
    })
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
          resumed: true,
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
  useEffect(() => {
    if (!accountId) return
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
