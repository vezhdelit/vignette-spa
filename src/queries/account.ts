import { useMemo } from "react"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query"
import { api, apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import type {
  AppNotification,
  Consent,
  NotificationsSummary,
  Referrals,
  SessionInfo,
  Vehicle,
  Wallet,
} from "@/types/api"

/**
 * The Account tab's collapsible sections. Each hook is mounted by its
 * section body, which only renders while the section is expanded — so
 * nothing here is fetched until the user opens it (and it is cached for the
 * next open). Endpoints a guest may not call (wallet, referrals, consent
 * writes, the notification read-state writes — all 403 guest_not_allowed)
 * are simply disabled for a guest session.
 */

export const accountKeys = {
  all: (scope: string) => ["account", scope] as const,
  wallet: (scope: string) => ["account", scope, "wallet"] as const,
  referrals: (scope: string) => ["account", scope, "referrals"] as const,
  vehicles: (scope: string) => ["account", scope, "vehicles"] as const,
  /** root of everything notification-shaped (list + summary) */
  notifications: (scope: string) => ["account", scope, "notifications"] as const,
  notificationsList: (scope: string) =>
    ["account", scope, "notifications", "list"] as const,
  notificationsSummary: (scope: string) =>
    ["account", scope, "notifications", "summary"] as const,
  sessions: (scope: string) => ["account", scope, "sessions"] as const,
  consents: (scope: string) => ["account", scope, "consents"] as const,
}

export function useWallet() {
  const { scope, ready, guest } = useSessionScope()
  return useQuery({
    queryKey: accountKeys.wallet(scope),
    // balance/bonuses arrive as integer cents
    queryFn: () => apiResult<Wallet>("/public/me/wallet"),
    enabled: ready && !guest,
  })
}

export function useReferrals() {
  const { scope, ready, guest } = useSessionScope()
  return useQuery({
    queryKey: accountKeys.referrals(scope),
    queryFn: () => apiResult<Referrals>("/public/me/referrals"),
    enabled: ready && !guest,
  })
}

/**
 * GET /public/me/vehicles — guest ok. Signed in: the account's saved cars.
 * Guest: the distinct plates on the orders this session placed itself,
 * newest first, with string ids ("<country>:<plate>") since there is no
 * vehicles row behind them. Either way it's the plate picker's memory.
 */
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

/* ---------------------------------------------------------- notifications */

interface NotificationsPage {
  items: AppNotification[]
  pagination: { total: number; current: number }
  /** whole-inbox numbers as of this page's fetch (already net of its own mark_read) */
  unreadCount: number
  totalCount: number
}

/**
 * GET /public/me/notifications, paginated. A plain fetch never changes read
 * state; pass `markRead` from the one place that IS the user opening the
 * inbox (the list screen mounting), and the fetched page's unread rows flip
 * to read server-side before the response — `unreadCount` then already
 * excludes them. A guest session sees an empty list (alerts are logged
 * against an account).
 */
export function useNotifications({ markRead = false } = {}) {
  const { scope, ready } = useSessionScope()
  const query = useInfiniteQuery({
    queryKey: accountKeys.notificationsList(scope),
    queryFn: async ({ pageParam }): Promise<NotificationsPage> => {
      const envelope = await api<AppNotification[]>("/public/me/notifications", {
        query: { page: pageParam, mark_read: markRead ? true : undefined },
      })
      return {
        items: envelope.result,
        pagination: envelope.pages ?? { total: 1, current: pageParam },
        unreadCount: envelope.unread_count ?? 0,
        totalCount: envelope.total_count ?? envelope.result.length,
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
  const last = query.data?.pages.at(-1)
  const pagination = last?.pagination ?? { total: 1, current: 1 }

  return {
    ...query,
    items,
    pagination,
    unreadCount: last?.unreadCount ?? 0,
    totalCount: last?.totalCount ?? items.length,
  }
}

/**
 * GET /public/me/notifications/summary — the bell badge: unread/total plus
 * the newest row, with no read-state write, so it is safe to poll. Skipped
 * for a guest session (always zero — a guest has no account to log against).
 */
export function useNotificationsSummary() {
  const { scope, ready, guest } = useSessionScope()
  return useQuery({
    queryKey: accountKeys.notificationsSummary(scope),
    queryFn: () => apiResult<NotificationsSummary>("/public/me/notifications/summary"),
    enabled: ready && !guest,
    refetchInterval: 60_000,
  })
}

const notificationPath = (id: AppNotification["id"]) =>
  `/public/me/notifications/${encodeURIComponent(String(id))}`

/**
 * Flip one row (or every row, when `id` is null) in the cached list pages
 * and move each page's unread count by the same amount, so the inbox reacts
 * before the summary poll catches up. The summary itself is invalidated by
 * the caller — one cheap request, no arithmetic to get wrong.
 */
function patchNotificationRead(
  queryClient: QueryClient,
  scope: string,
  id: AppNotification["id"] | null,
  read: boolean
) {
  const now = Math.floor(Date.now() / 1000)
  queryClient.setQueriesData<InfiniteData<NotificationsPage>>(
    { queryKey: accountKeys.notificationsList(scope) },
    (data) => {
      if (!data) return data
      let delta = 0
      const pages = data.pages.map((page) => ({
        ...page,
        items: page.items.map((n) => {
          if ((id !== null && String(n.id) !== String(id)) || n.read === read) return n
          delta += read ? -1 : 1
          return { ...n, read, read_at: read ? now : null }
        }),
      }))
      return {
        ...data,
        pages: pages.map((page) => ({
          ...page,
          unreadCount: id === null && read ? 0 : Math.max(0, page.unreadCount + delta),
        })),
      }
    }
  )
}

/** POST notifications/:id/read — 204, idempotent. No guests (403). */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (id: AppNotification["id"]) =>
      api(`${notificationPath(id)}/read`, { method: "POST" }),
    onSuccess: (_result, id) => {
      patchNotificationRead(queryClient, scope, id, true)
      void queryClient.invalidateQueries({ queryKey: accountKeys.notificationsSummary(scope) })
    },
  })
}

/** POST notifications/:id/unread — the explicit reverse. No guests (403). */
export function useMarkNotificationUnread() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (id: AppNotification["id"]) =>
      api(`${notificationPath(id)}/unread`, { method: "POST" }),
    onSuccess: (_result, id) => {
      patchNotificationRead(queryClient, scope, id, false)
      void queryClient.invalidateQueries({ queryKey: accountKeys.notificationsSummary(scope) })
    },
  })
}

/**
 * POST notifications/mark-all-read — whole inbox, no body; answers how many
 * rows actually flipped (0 is normal for an already-read inbox). No guests.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: () =>
      apiResult<{ updated_count: number }>("/public/me/notifications/mark-all-read", {
        method: "POST",
      }),
    onSuccess: () => {
      patchNotificationRead(queryClient, scope, null, true)
      void queryClient.invalidateQueries({ queryKey: accountKeys.notificationsSummary(scope) })
    },
  })
}

/* --------------------------------------------------------------- consents */

/**
 * Partner-order visibility consent (GET/POST/DELETE /public/me/consents).
 * Grant/revoke applies to the CALLING client's partner; on a first-party
 * client granting is harmless but changes nothing (it already sees all).
 * Reading is guest-ok; the writes are not.
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
