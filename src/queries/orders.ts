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
  CreateOrderBody,
  CreateOrderResult,
  Order,
  OrderChange,
} from "@/types/api"

/** valid keys for the ?status CSV filter (repositories/orders.js AUTH_STATUS_KEYS) */
export type OrderStatusKey =
  | "created"
  | "pending"
  | "deferred"
  | "will_be_active"
  | "active"
  | "expired"
  | "refunded"
  | "deleted"

export interface OrdersFilter {
  /** CSV filter — omit for all statuses */
  statuses?: OrderStatusKey[]
  /** partner clients: whole account instead of partner-scoped (needs consent) */
  scope?: "all"
}

interface OrdersPage {
  orders: Order[]
  pagination: { total: number; current: number }
}

export const orderKeys = {
  all: (scope: string) => ["orders", scope] as const,
  lists: (scope: string) => ["orders", scope, "list"] as const,
  list: (scope: string, filter: OrdersFilter) =>
    ["orders", scope, "list", filter] as const,
  detail: (scope: string, id: string) =>
    ["orders", scope, "detail", id] as const,
}

const orderPath = (id: string) => `/public/me/orders/${encodeURIComponent(id)}`

async function fetchOrdersPage(page: number, filter: OrdersFilter): Promise<OrdersPage> {
  const envelope = await api<Order[]>("/public/me/orders", {
    query: {
      page,
      status: filter.statuses?.length ? filter.statuses.join(",") : undefined,
      scope: filter.scope,
    },
  })
  return {
    orders: envelope.result,
    pagination: envelope.pages ?? { total: 1, current: page },
  }
}

const isProcessing = (order: Order) =>
  order.status === "CREATED" || order.status === "PENDING"

/**
 * The account's orders, page by page (load-more). While any order is still
 * CREATED/PENDING the list polls every 20s so it flips to active on its own.
 */
export function useOrders(filter: OrdersFilter = {}) {
  const { scope, ready } = useSessionScope()
  const query = useInfiniteQuery({
    queryKey: orderKeys.list(scope, filter),
    queryFn: ({ pageParam }) => fetchOrdersPage(pageParam, filter),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.current < last.pagination.total
        ? last.pagination.current + 1
        : undefined,
    enabled: ready,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.orders.some(isProcessing)) ? 20_000 : false,
  })

  const orders = useMemo(
    () => query.data?.pages.flatMap((p) => p.orders) ?? [],
    [query.data]
  )
  const pagination = query.data?.pages.at(-1)?.pagination ?? { total: 1, current: 1 }

  return { ...query, orders, pagination }
}

/** One order; `pollUntilPaid` refetches every 4s while it is still CREATED. */
export function useOrder(
  id: string | null,
  { enabled = true, pollUntilPaid = false } = {}
) {
  const { scope, ready } = useSessionScope()
  return useQuery({
    queryKey: orderKeys.detail(scope, id ?? ""),
    queryFn: () => apiResult<Order>(orderPath(id!)),
    enabled: ready && enabled && id !== null,
    refetchInterval: (q) =>
      pollUntilPaid && (!q.state.data || q.state.data.status === "CREATED")
        ? 4_000
        : false,
  })
}

/**
 * Checkout companion: watches a freshly created order while the user pays
 * (in the in-sheet iframe) and reports the moment it leaves CREATED.
 */
export function usePaymentStatus(orderId: string | null, watching: boolean) {
  const { data } = useOrder(orderId, { enabled: watching, pollUntilPaid: true })
  return { paid: Boolean(data && data.status !== "CREATED"), order: data ?? null }
}

/** Refetch every orders list of this session (after a payment landed, etc). */
export function useInvalidateOrders() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return () => queryClient.invalidateQueries({ queryKey: orderKeys.all(scope) })
}

/* ------------------------------------------------------------ mutations */

/** Rewrite one order in every cached list page (or drop it when `next` is null). */
function patchOrderLists(
  queryClient: QueryClient,
  scope: string,
  id: string,
  next: Order | null
) {
  queryClient.setQueriesData<InfiniteData<OrdersPage>>(
    { queryKey: orderKeys.lists(scope) },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          orders: next
            ? page.orders.map((o) => (o.id === id ? next : o))
            : page.orders.filter((o) => o.id !== id),
        })),
      }
  )
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: ({
      body,
      allowDuplication = false,
    }: {
      body: CreateOrderBody
      /** skips checkPartnerDuplicateOrders — offered after a pending/active/approved_orders rejection */
      allowDuplication?: boolean
    }) =>
      apiResult<CreateOrderResult>("/public/me/orders", {
        method: "POST",
        body,
        query: allowDuplication ? { allow_duplication: true } : undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all(scope) }),
  })
}

export function useModifyOrder() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: {
        vehicle: { plate: string; country: string; vin_code?: string }
        start_date?: number
      }
    }) =>
      apiResult<{ message: string; changes: OrderChange[]; order: Order }>(
        `${orderPath(id)}/modify`,
        { method: "POST", body }
      ),
    onSuccess: (result, { id }) => {
      patchOrderLists(queryClient, scope, id, result.order)
      queryClient.setQueryData(orderKeys.detail(scope, id), result.order)
    },
  })
}

export function useRefundOrder() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (id: string) =>
      apiResult<{ message: string; amount_eur: number; percent: number; order: Order }>(
        `${orderPath(id)}/refund`,
        { method: "POST" }
      ),
    onSuccess: (result, id) => {
      patchOrderLists(queryClient, scope, id, result.order)
      queryClient.setQueryData(orderKeys.detail(scope, id), result.order)
    },
  })
}

export function useTransferOrder() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: ({ id, targetEmail }: { id: string; targetEmail: string }) =>
      apiResult<{ message: string; user_id: string }>(`${orderPath(id)}/transfer`, {
        method: "POST",
        body: { target_email: targetEmail },
      }),
    // the order left this account's scope
    onSuccess: (_result, { id }) => {
      patchOrderLists(queryClient, scope, id, null)
      queryClient.removeQueries({ queryKey: orderKeys.detail(scope, id) })
    },
  })
}
