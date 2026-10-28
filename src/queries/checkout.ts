import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import type { Checkout, CheckoutConfig, MonobankInvoice } from "@/types/api"

/**
 * Native checkout — the `/public/me/checkouts/:id` routes
 * (docs/checkout/README.md). One checkout per payable: an order batch (the
 * id is the batch custom_id, the same one the hosted /pay URL ends with) or
 * a wallet top-up (`topup_<token>`). The object says what a sheet needs:
 * `methods[]` with fresh provider secrets while it is `open`, the hosted
 * page as the fallback, and `status` as the verdict.
 *
 * Nothing here decides that money arrived. Every read reconciles pending
 * provider objects server-side (a succeeded Stripe intent, a completed
 * PayPal order, a paid Monobank invoice) and completes the payable the way
 * the webhooks do, so the poll is what makes a confirmed card payment land
 * without waiting for a webhook.
 */

export const checkoutKeys = {
  config: () => ["checkout", "config"] as const,
  detail: (scope: string, id: string) => ["checkout", scope, "detail", id] as const,
}

const checkoutPath = (id: string) => `/public/me/checkouts/${encodeURIComponent(id)}`

/** The checkout id behind a hosted page URL (`…/pay/<id>`), or null. */
export function checkoutIdFromPaymentLink(paymentLink: string | null | undefined): string | null {
  if (!paymentLink) return null
  try {
    const url = new URL(paymentLink, window.location.origin)
    const match = /\/pay\/(?:sandbox\/)?([^/?#]+)/.exec(url.pathname)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

/** GET /public/checkout/config — what the client may do before any order exists. */
export function useCheckoutConfig({ enabled = true } = {}) {
  return useQuery({
    queryKey: checkoutKeys.config(),
    queryFn: () => apiResult<CheckoutConfig>("/public/checkout/config"),
    enabled,
    staleTime: 5 * 60_000,
  })
}

const ACTIVE: Checkout["status"][] = ["open", "processing"]

/**
 * GET /public/me/checkouts/:id — the poll and the resume. Polls every 2s
 * while a sheet is up and the checkout is still open or processing, stops on
 * anything else. `initial` seeds the cache with the block the create call
 * answered, so the first render needs no round trip.
 *
 * When a read says `paid`, the order status poll and the wallet queries are
 * invalidated right away — the sheets watching them flip to their success
 * screen without waiting for their own interval.
 */
export function useCheckout(
  id: string | null,
  { watching = true, initial = null }: { watching?: boolean; initial?: Checkout | null } = {}
) {
  const { scope, ready } = useSessionScope()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: checkoutKeys.detail(scope, id ?? ""),
    queryFn: async () => {
      const checkout = await apiResult<Checkout>(checkoutPath(id!))
      if (checkout.status === "paid" || checkout.status === "paid_late") {
        void queryClient.invalidateQueries({ queryKey: ["orders", scope, "status"] })
        void queryClient.invalidateQueries({ queryKey: ["wallet", scope] })
      }
      return checkout
    },
    enabled: ready && id !== null,
    initialData: initial && initial.id === id ? initial : undefined,
    // a seeded block is current enough to render, never to skip the first poll
    initialDataUpdatedAt: 0,
    refetchInterval: (q) =>
      watching && (!q.state.data || ACTIVE.includes(q.state.data.status)) ? 2_000 : false,
    refetchIntervalInBackground: true,
  })
}

/** POST …/sync — the one-shot re-check after a sheet or a redirect closes. */
export function useSyncCheckout() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: ({ id, provider }: { id: string; provider?: "stripe" | "paypal" | "monobank" }) =>
      apiResult<Checkout>(`${checkoutPath(id)}/sync`, {
        method: "POST",
        body: provider ? { provider } : {},
      }),
    onSuccess: (checkout) => {
      queryClient.setQueryData(checkoutKeys.detail(scope, checkout.id), checkout)
      if (checkout.status === "paid" || checkout.status === "paid_late") {
        void queryClient.invalidateQueries({ queryKey: ["orders", scope, "status"] })
        void queryClient.invalidateQueries({ queryKey: ["wallet", scope] })
      }
    },
  })
}

/**
 * POST …/monobank — mints the invoice. `return_url` is only worth sending
 * when this app's host is on the client's allowlist (`CheckoutConfig.
 * return_url.hosts`); otherwise the user comes back to the hosted page and
 * this app's poll still sees the payment.
 */
export function useCreateMonobankInvoice() {
  return useMutation({
    mutationFn: ({ id, returnUrl }: { id: string; returnUrl?: string }) =>
      apiResult<MonobankInvoice>(`${checkoutPath(id)}/monobank`, {
        method: "POST",
        body: returnUrl ? { return_url: returnUrl } : {},
      }),
  })
}

/** POST …/paypal/capture — after the PayPal buttons' onApprove. Idempotent. */
export function usePayPalCapture() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (id: string) =>
      apiResult<{ status: Checkout["status"]; checkout: Checkout }>(
        `${checkoutPath(id)}/paypal/capture`,
        { method: "POST" }
      ),
    onSuccess: ({ checkout }) => {
      queryClient.setQueryData(checkoutKeys.detail(scope, checkout.id), checkout)
      void queryClient.invalidateQueries({ queryKey: ["orders", scope, "status"] })
      void queryClient.invalidateQueries({ queryKey: ["wallet", scope] })
    },
  })
}

/**
 * POST …/cancel — the user gave up on the purchase: the Stripe intent is
 * cancelled, the Monobank invoice removed, the orders closed and the promo
 * slot and wallet hold released. Not a sheet dismissal, which is a retry.
 */
export function useCancelCheckout() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (id: string) =>
      apiResult<Checkout>(`${checkoutPath(id)}/cancel`, { method: "POST" }),
    onSuccess: (checkout) => {
      queryClient.setQueryData(checkoutKeys.detail(scope, checkout.id), checkout)
      void queryClient.invalidateQueries({ queryKey: ["orders", scope] })
      void queryClient.invalidateQueries({ queryKey: ["wallet", scope] })
    },
  })
}

/** POST …/simulate — sandbox clients only: pay or decline as if the provider had. */
export function useSimulateCheckout() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: ({
      id,
      provider,
      outcome,
    }: {
      id: string
      provider: "stripe" | "paypal" | "monobank"
      outcome: "success" | "failure"
    }) =>
      apiResult<Checkout>(`${checkoutPath(id)}/simulate`, {
        method: "POST",
        body: { provider, outcome },
      }),
    onSuccess: (checkout) => {
      queryClient.setQueryData(checkoutKeys.detail(scope, checkout.id), checkout)
      void queryClient.invalidateQueries({ queryKey: ["orders", scope, "status"] })
      void queryClient.invalidateQueries({ queryKey: ["wallet", scope] })
    },
  })
}
