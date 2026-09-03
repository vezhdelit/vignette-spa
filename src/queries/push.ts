import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, apiResult } from "@/lib/api"
import {
  currentSubscription,
  getInstallationId,
  subscribe,
  unsubscribe,
  webPushSupported,
} from "@/lib/webpush"

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

      await apiResult("/public/devices", {
        method: "POST",
        body: {
          installation_id: getInstallationId(),
          platform: "web",
          token: subscription.toJSON(),
        },
      })

      return { status: "registered", subscription }
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
    onSuccess: () => queryClient.setQueryData(pushKeys.subscription, null),
  })
}
