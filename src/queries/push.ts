import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, apiResult } from "@/lib/api"
import {
  currentSubscription,
  getInstallationId,
  subscribe,
  unsubscribe,
  webPushSupported,
} from "@/lib/webpush"
import { track, trackCustom } from "@/lib/insights"
import { apiLanguage, useLanguage } from "@/i18n"

/**
 * Web push registration — the browser as a push install, mirroring what the
 * iOS app does over APNs (vignette.id docs/push/web-integration.md). The
 * subscription itself is browser state (PushManager), read through a query
 * so the toggle reflects it; enable/disable are mutations that walk the
 * full chain and write the result back into that query.
 */

export const pushKeys = {
  subscription: ["push", "subscription"] as const,
}

/** The browser's IANA zone, or undefined where Intl cannot say (the API then assumes Berlin). */
function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

// What `locale`/`timezone` this browser last told the server, so a mount
// that already matches skips the call — the client-API's cheap rule for
// "re-register whenever either differs" (docs/push/web-integration.md).
// Keyed like `getInstallationId()`'s own storage; missing/unreadable just
// means the next check re-sends, which costs nothing.
const LAST_SENT_KEY = "vignette-spa.push-locale-sent"

interface SentPushMeta {
  locale: string
  timezone: string | undefined
}

function readSentLocale(): SentPushMeta | null {
  try {
    const raw = localStorage.getItem(LAST_SENT_KEY)
    return raw ? (JSON.parse(raw) as SentPushMeta) : null
  } catch {
    return null
  }
}

function rememberSentLocale(meta: SentPushMeta): void {
  try {
    localStorage.setItem(LAST_SENT_KEY, JSON.stringify(meta))
  } catch {
    /* private mode / storage blocked — every mount just re-sends */
  }
}

function forgetSentLocale(): void {
  try {
    localStorage.removeItem(LAST_SENT_KEY)
  } catch {
    /* ignore */
  }
}

/** The browser's current PushSubscription for this origin, if any. */
export function usePushSubscription() {
  return useQuery({
    queryKey: pushKeys.subscription,
    queryFn: currentSubscription,
    enabled: webPushSupported(),
    staleTime: Infinity,
    retry: false,
  })
}

export type EnablePushResult =
  | { status: "registered"; subscription: PushSubscription }
  /** the browser prompt was declined ("denied" sticks until the user resets site settings) */
  | { status: "denied" | "dismissed" }

/**
 * permission → service worker → GET /public/devices/web-push-key →
 * pushManager.subscribe → POST /public/devices with the subscription as the
 * token. The session at registration time (guest or signed-in) decides the
 * binding — re-enable after signing in to re-bind to the account.
 */
export function useEnablePush() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<EnablePushResult> => {
      // first await in the click handler, so the browser still counts it as
      // a user gesture
      const permission = await Notification.requestPermission()
      // The standard name, and the same one the native apps send for their
      // own prompts — what share of installs we can actually reach is one
      // question across all three, not three questions. A dismissed prompt
      // counts as not granted: the user can be asked again, a denial cannot.
      track("app.permission_set", {
        permission: "notifications",
        granted: permission === "granted",
      })
      if (permission !== "granted") {
        return { status: permission === "denied" ? "denied" : "dismissed" }
      }

      // Client credential only — the VAPID key is server config, not
      // user-scoped. 404 not_configured surfaces as the mutation error.
      const { public_key } = await apiResult<{ public_key: string }>(
        "/public/devices/web-push-key",
        { auth: false }
      )

      const subscription = await subscribe(public_key)

      const timezone = browserTimezone()
      const locale = apiLanguage()

      await apiResult("/public/devices", {
        method: "POST",
        body: {
          installation_id: getInstallationId(),
          platform: "web",
          token: subscription.toJSON(),
          // The browser's zone, for the news channel's quiet hours
          // (22:00–08:00 local). Those channels are on by default, so no
          // `channels` field is needed; a settings switch would send
          // `channels: { news: false }` to turn one off.
          timezone,
          // The app's own language, not the device's — a person who picked
          // a language here overrode the device, and that override is what
          // support should see. Informational only: pushes are still
          // translated on the device from the catalogue.
          locale,
        },
      })
      rememberSentLocale({ locale, timezone })

      return { status: "registered", subscription }
    },
    onError: () => {
      // Granted the permission and still no push: the VAPID key is not
      // configured, the browser refused the subscription, or POST /devices
      // failed. Nothing in app.permission_set can show this — it is a
      // registration that fell over after a yes, and is this app's own
      // problem rather than a shared concept.
      trackCustom("push.registration_failed")
    },
    onSuccess: (result) => {
      if (result.status === "registered") {
        queryClient.setQueryData(pushKeys.subscription, result.subscription)
      }
    },
  })
}

/** Browser-side unsubscribe paired with DELETE /public/devices. */
export function useDisablePush() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await unsubscribe()
      await api("/public/devices", {
        method: "DELETE",
        body: { installation_id: getInstallationId() },
      })
    },
    onSuccess: () => {
      // Turning push back off is a decision worth counting, and the
      // catalogue has no name for it: app.permission_set is the OS prompt,
      // which is not what happened here — the permission is still granted.
      trackCustom("push.disabled")
      queryClient.setQueryData(pushKeys.subscription, null)
      forgetSentLocale()
    },
  })
}

/**
 * Keeps the server's `locale`/`timezone` for this install in step with the
 * browser. The client-API contract puts the burden on the client because
 * a page never "relaunches" the way an app does on a system language
 * change: every switch is the in-app case, so this is the only signal
 * there is. Mount once near the app root (see `App.tsx`'s
 * `InsightsTracker`-style trackers) — a no-op whenever push was never
 * enabled, and at most one POST per language or timezone change, since the
 * last value actually sent is remembered locally and compared first.
 */
export function usePushLocaleSync(): void {
  const subscription = usePushSubscription().data ?? null
  const language = useLanguage()
  const inFlight = useRef(false)

  useEffect(() => {
    if (!subscription || inFlight.current) return

    const timezone = browserTimezone()
    const locale = apiLanguage()
    const last = readSentLocale()
    if (last && last.locale === locale && last.timezone === timezone) return

    inFlight.current = true
    void apiResult("/public/devices", {
      method: "POST",
      body: {
        installation_id: getInstallationId(),
        platform: "web",
        token: subscription.toJSON(),
        timezone,
        locale,
      },
    })
      .then(() => rememberSentLocale({ locale, timezone }))
      .catch(() => {
        // Best-effort: nothing in the UI depends on this succeeding right
        // away, and the next language change or page load tries again.
      })
      .finally(() => {
        inFlight.current = false
      })
    // `language` drives the retrigger on a switch; `locale` above is read
    // fresh from the store rather than depended on directly.
  }, [subscription, language])
}
