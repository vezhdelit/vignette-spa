import { create } from "zustand"
import { api, apiResult } from "@/lib/api"
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

interface LoadOptions {
  silent?: boolean
  /** append this page instead of replacing (load-more) */
  page?: number
  /** CSV filter — omit for all statuses */
  statuses?: OrderStatusKey[]
  /** partner clients: whole account instead of partner-scoped (needs consent) */
  scope?: "all"
}

interface OrdersState {
  orders: Order[]
  pages: { total: number; current: number }
  loading: boolean
  loaded: boolean
  error: string | null

  load: (options?: LoadOptions) => Promise<void>
  loadMore: () => Promise<void>
  create: (
    body: CreateOrderBody,
    options?: { allowDuplication?: boolean }
  ) => Promise<CreateOrderResult>
  getOrder: (id: string) => Promise<Order>
  modify: (
    id: string,
    body: {
      vehicle: { plate: string; country: string; vin_code?: string }
      start_date?: number
    }
  ) => Promise<{ message: string; changes: OrderChange[]; order: Order }>
  refund: (
    id: string
  ) => Promise<{ message: string; amount_eur: number; percent: number; order: Order }>
  transfer: (id: string, targetEmail: string) => Promise<{ message: string; user_id: string }>
  reset: () => void
}

export const useOrdersStore = create<OrdersState>()((set, get) => ({
  orders: [],
  pages: { total: 1, current: 1 },
  loading: false,
  loaded: false,
  error: null,

  async load(options = {}) {
    if (get().loading) return
    const page = options.page ?? 1
    set({ loading: !options.silent, error: null })
    try {
      const envelope = await api<Order[]>("/public/me/orders", {
        query: {
          page,
          status: options.statuses?.length
            ? options.statuses.join(",")
            : undefined,
          scope: options.scope,
        },
      })
      const pages = envelope.pages ?? { total: 1, current: page }
      set({
        orders:
          page > 1 ? [...get().orders, ...envelope.result] : envelope.result,
        pages,
        loading: false,
        loaded: true,
      })
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error: e instanceof Error ? e.message : "Failed to load orders",
      })
    }
  },

  async loadMore() {
    const { pages } = get()
    if (pages.current >= pages.total) return
    await get().load({ page: pages.current + 1, silent: true })
  },

  async create(body, options = {}) {
    const result = await apiResult<CreateOrderResult>("/public/me/orders", {
      method: "POST",
      body,
      // skips checkPartnerDuplicateOrders — offered after a
      // pending/active/approved_orders rejection
      query: options.allowDuplication ? { allow_duplication: true } : undefined,
    })
    void get().load({ silent: true })
    return result
  },

  async getOrder(id) {
    return apiResult<Order>(`/public/me/orders/${encodeURIComponent(id)}`)
  },

  async modify(id, body) {
    const result = await apiResult<{
      message: string
      changes: OrderChange[]
      order: Order
    }>(`/public/me/orders/${encodeURIComponent(id)}/modify`, {
      method: "POST",
      body,
    })
    set({
      orders: get().orders.map((o) => (o.id === id ? result.order : o)),
    })
    return result
  },

  async refund(id) {
    const result = await apiResult<{
      message: string
      amount_eur: number
      percent: number
      order: Order
    }>(`/public/me/orders/${encodeURIComponent(id)}/refund`, { method: "POST" })
    set({
      orders: get().orders.map((o) => (o.id === id ? result.order : o)),
    })
    return result
  },

  async transfer(id, targetEmail) {
    const result = await apiResult<{ message: string; user_id: string }>(
      `/public/me/orders/${encodeURIComponent(id)}/transfer`,
      { method: "POST", body: { target_email: targetEmail } }
    )
    // the order left this account's scope
    set({ orders: get().orders.filter((o) => o.id !== id) })
    return result
  },

  reset() {
    set({
      orders: [],
      pages: { total: 1, current: 1 },
      loading: false,
      loaded: false,
      error: null,
    })
  },
}))
