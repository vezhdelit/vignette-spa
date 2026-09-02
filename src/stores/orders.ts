import { create } from "zustand"
import { apiResult } from "@/lib/api"
import type {
  CreateOrderBody,
  CreateOrderResult,
  Order,
  OrderChange,
} from "@/types/api"

interface OrdersState {
  orders: Order[]
  loading: boolean
  loaded: boolean
  error: string | null

  load: (options?: { silent?: boolean }) => Promise<void>
  create: (body: CreateOrderBody) => Promise<CreateOrderResult>
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
  loading: false,
  loaded: false,
  error: null,

  async load(options = {}) {
    if (get().loading) return
    set({ loading: !options.silent, error: null })
    try {
      // first page is enough for the home screen; page size is 15 server-side
      const orders = await apiResult<Order[]>("/public/me/orders")
      set({ orders, loading: false, loaded: true })
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error: e instanceof Error ? e.message : "Failed to load orders",
      })
    }
  },

  async create(body) {
    const result = await apiResult<CreateOrderResult>("/public/me/orders", {
      method: "POST",
      body,
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
    set({ orders: [], loading: false, loaded: false, error: null })
  },
}))
