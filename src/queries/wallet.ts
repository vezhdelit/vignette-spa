import { useMemo } from "react"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { api, apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import type { TopUp, Wallet, WalletEntryType, WalletTransaction } from "@/types/api"

/**
 * The wallet: balances, the statement, and topping it up.
 *
 * Everything is integer cents. Nothing here runs for a guest session — a
 * guest has no wallet and every endpoint answers 403 guest_not_allowed.
 *
 * The rule that shapes all of it: the client is never the authority on a
 * payment having landed. A top-up is paid through its `checkout` (kind
 * "top_up") like an order, and the checkout read — useCheckoutPaid, every
 * 2 s while paying — makes the server reconcile with the provider, so the
 * wallet is credited whether or not a webhook was quick. (The top-up's own
 * poll and cancel and its `payment` / `payment_link` fields were dropped
 * from the API on 2026-11-23.)
 */

export const walletKeys = {
  all: (scope: string) => ["wallet", scope] as const,
  detail: (scope: string) => ["wallet", scope, "detail"] as const,
  transactions: (scope: string, type?: WalletEntryType) =>
    ["wallet", scope, "transactions", type ?? "all"] as const,
}

/** GET /public/me/wallet — balances plus the top-up options to render. */
export function useWallet() {
  const { scope, ready, guest } = useSessionScope()
  return useQuery({
    queryKey: walletKeys.detail(scope),
    queryFn: () => apiResult<Wallet>("/public/me/wallet"),
    enabled: ready && !guest,
  })
}

interface TransactionsPage {
  items: WalletTransaction[]
  pagination: { total: number; current: number }
}

/** GET /public/me/wallet/transactions — the statement, newest first. */
export function useWalletTransactions({
  type,
  limit = 20,
  enabled = true,
}: { type?: WalletEntryType; limit?: number; enabled?: boolean } = {}) {
  const { scope, ready, guest } = useSessionScope()
  const query = useInfiniteQuery({
    queryKey: walletKeys.transactions(scope, type),
    queryFn: async ({ pageParam }): Promise<TransactionsPage> => {
      const envelope = await api<WalletTransaction[]>("/public/me/wallet/transactions", {
        query: { page: pageParam, limit, type },
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
    enabled: ready && !guest && enabled,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  )

  const pagination = query.data?.pages.at(-1)?.pagination ?? { total: 1, current: 1 }

  return { ...query, items, pagination }
}

/**
 * POST /public/me/wallet/top-ups — writes the pending ledger row and returns
 * the top-up with its `checkout` (kind "top_up"): the native methods and
 * the hosted page this app embeds.
 *
 * `stripe_api_version` is deliberately NOT sent: that switches the server to
 * minting an ephemeral key for the native PaymentSheet configuration, which
 * is an iOS/Android concern. `allowed_payment_providers` is left out too, so
 * the page offers everything the environment supports (live: Stripe, PayPal
 * and Monobank; sandbox: the same three, as test or simulated payments).
 */
export function useCreateTopUp() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (amount: number) =>
      apiResult<TopUp>("/public/me/wallet/top-ups", {
        method: "POST",
        body: { amount },
      }),
    // a pending row now exists — it belongs in the statement
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: walletKeys.all(scope) }),
  })
}

/**
 * Refetch the balances and the statement — after a top-up is credited, and
 * after an order spends from the wallet.
 */
export function useInvalidateWallet() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return () => queryClient.invalidateQueries({ queryKey: walletKeys.all(scope) })
}
