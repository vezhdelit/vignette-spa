import { useMemo } from "react"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { api, apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import type {
  AppNotification,
  Consent,
  Referrals,
  SessionInfo,
  Vehicle,
  Wallet,
} from "@/types/api"

/**
 * The Account tab's collapsible sections. Each hook is mounted by its
 * section body, which only renders while the section is expanded — so
 * nothing here is fetched until the user opens it (and it is cached for the
 * next open).
 */

export const accountKeys = {
  all: (scope: string) => ["account", scope] as const,
  wallet: (scope: string) => ["account", scope, "wallet"] as const,
  referrals: (scope: string) => ["account", scope, "referrals"] as const,
  vehicles: (scope: string) => ["account", scope, "vehicles"] as const,
  notifications: (scope: string) => ["account", scope, "notifications"] as const,
  sessions: (scope: string) => ["account", scope, "sessions"] as const,
  consents: (scope: string) => ["account", scope, "consents"] as const,
}

export function useWallet() {
  const { scope, ready } = useSessionScope()
  return useQuery({
    queryKey: accountKeys.wallet(scope),
    // balance/bonuses arrive as integer cents
    queryFn: () => apiResult<Wallet>("/public/me/wallet"),
    enabled: ready,
  })
}

export function useReferrals() {
  const { scope, ready } = useSessionScope()
  return useQuery({
    queryKey: accountKeys.referrals(scope),
    queryFn: () => apiResult<Referrals>("/public/me/referrals"),
    enabled: ready,
  })
}

export function useVehicles() {
  const { scope, ready } = useSessionScope()
  return useQuery({
    queryKey: accountKeys.vehicles(scope),
    queryFn: () => apiResult<Vehicle[]>("/public/me/vehicles"),
    enabled: ready,
  })
}

/** GET /public/auth/sessions — the refresh-token families of this account. */
export function useSessions() {
  const { scope, ready } = useSessionScope()
  return useQuery({
    queryKey: accountKeys.sessions(scope),
    queryFn: () => apiResult<SessionInfo[]>("/public/auth/sessions"),
    enabled: ready,
  })
}

interface NotificationsPage {
  items: AppNotification[]
  pagination: { total: number; current: number }
}

/** Paginated; fetching a page marks it read server-side (mark_read defaults on). */
export function useNotifications() {
  const { scope, ready } = useSessionScope()
  const query = useInfiniteQuery({
    queryKey: accountKeys.notifications(scope),
    queryFn: async ({ pageParam }): Promise<NotificationsPage> => {
      const envelope = await api<AppNotification[]>("/public/me/notifications", {
        query: { page: pageParam },
      })
      return {
        items: envelope.result,
        pagination: envelope.pages ?? { total: 1, current: pageParam },
      }
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.current < last.pagination.total
        ? last.pagination.current + 1
        : undefined,
    enabled: ready,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  )
  const pagination = query.data?.pages.at(-1)?.pagination ?? { total: 1, current: 1 }

  return { ...query, items, pagination }
}

/* --------------------------------------------------------------- consents */

/**
 * Partner-order visibility consent (GET/POST/DELETE /public/me/consents).
 * Grant/revoke applies to the CALLING client's partner; on a first-party
 * client granting is harmless but changes nothing (it already sees all).
 */
export function useConsents() {
  const { scope, ready } = useSessionScope()
  return useQuery({
    queryKey: accountKeys.consents(scope),
    queryFn: () => apiResult<Consent[]>("/public/me/consents"),
    enabled: ready,
  })
}

export function useGrantConsent() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: () => apiResult<Consent>("/public/me/consents", { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: accountKeys.consents(scope) }),
  })
}

export function useRevokeConsent() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: () => api("/public/me/consents", { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: accountKeys.consents(scope) }),
  })
}
