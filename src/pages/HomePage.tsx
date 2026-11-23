import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { TriangleAlert } from "lucide-react"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { apiErrorMessage } from "@/lib/api"
import { useT } from "@/i18n"
import { useAuthStore } from "@/stores/auth"
import { isAccountScreen, usePushFocusStore } from "@/stores/push-focus"
import { useOrders, useUnpaidBaskets, type UnpaidBasket } from "@/queries/orders"
import { OrderCard } from "@/components/home/OrderCard"
import { OrderCardSkeleton } from "@/components/home/OrderCardSkeleton"
import { BuyNowCard } from "@/components/home/BuyNowCard"
import { RateUsCard } from "@/components/home/RateUsCard"
import { PaymentDrawer } from "@/components/order/PaymentDrawer"
import { UnpaidBanner } from "@/components/home/UnpaidBanner"
import type { Order } from "@/types/api"

// When the newest of a basket's orders was placed (unix seconds).
const newestOf = (basket: UnpaidBasket) =>
  Math.max(0, ...basket.orders.map((o) => Number(o.purchase_date) || 0))

// The newest basket the user cancelled from the banner, kept for the tab's
// session so a reload does not bring an older one back on top either.
const CANCELLED_KEY = "vignette-unpaid-cancelled-up-to"
const readCancelledUpTo = (): number => {
  try {
    return Number(sessionStorage.getItem(CANCELLED_KEY)) || 0
  } catch {
    return 0
  }
}
const writeCancelledUpTo = (value: number) => {
  try {
    sessionStorage.setItem(CANCELLED_KEY, String(value))
  } catch {
    // storage blocked: the banner still steps aside for this visit
  }
}

const HIDDEN_STATUSES = new Set(["DELETED", "UNPAID DELETED", "USER DELETED", "UNDEFINED"])

export function HomePage() {
  const navigate = useNavigate()
  const { t } = useT()
  const authStatus = useAuthStore((s) => s.status)
  // waits for the session bootstrap on its own, and polls every 20s while
  // any order is still CREATED/PENDING
  const {
    orders,
    pagination,
    isPending,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useOrders()
  // "Awaiting payment" card tapped — reopen its checkout in the modal
  const [paying, setPaying] = useState<Order | null>(null)

  const visible = useMemo(
    () => orders.filter((o) => !HIDDEN_STATUSES.has(o.status)),
    [orders]
  )

  // The newest unpaid basket rides on top as "finish your order" (its own
  // read: ?status=created, grouped by checkout), and the banner is the ONLY
  // place Home shows an unpaid order (2026-11-23): the API keeps one open
  // checkout per account, so there is nothing else to offer — and an older
  // basket that still lingers (made before that rule, or elsewhere) is never
  // promoted when the user cancels the one on top: after a cancel only a
  // basket newer than it may take the banner.
  const { baskets } = useUnpaidBaskets()
  const [cancelledUpTo, setCancelledUpTo] = useState<number>(readCancelledUpTo)
  const banner =
    baskets.find((basket) => newestOf(basket) > cancelledUpTo) ?? null
  const onBannerCancelled = (basket: UnpaidBasket) => {
    const upTo = Math.max(cancelledUpTo, newestOf(basket))
    setCancelledUpTo(upTo)
    writeCancelledUpTo(upTo)
  }
  const listed = useMemo(
    () =>
      visible.filter(
        (o) =>
          // unpaid orders live in the banner, not in the list — except one
          // whose money is moving (a payment confirming, or one that came
          // late), which keeps its card
          !(
            o.status === "CREATED" &&
            !(
              o.checkout &&
              (o.checkout.status === "processing" ||
                o.checkout.status === "paid_late") &&
              o.checkout.id !== banner?.checkout.id
            )
          )
      ),
    [visible, banner]
  )
  const booting = authStatus === "booting" || isPending

  // A tapped push names the order it is about (stores/push-focus.ts). Open
  // that card rather than dropping the reader at the top of their list.
  const pushFocus = usePushFocusStore((s) => s.focus)
  const clearPushFocus = usePushFocusStore((s) => s.clear)
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null)
  /** the order we have already spent a refetch looking for */
  const refetchedForFocus = useRef<string | null>(null)

  useEffect(() => {
    const orderId = pushFocus?.orderId
    // Account screens belong to /account and are routed in App; without an
    // order id there is nothing here to open.
    if (!orderId || booting || isAccountScreen(pushFocus?.screen ?? null)) return

    const target = visible.find((order) => order.id === orderId)
    if (!target) {
      // Orders arrive a page at a time, so the one the push named may be
      // further down. Keep loading until it turns up.
      if (hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
        return
      }
      // On no page at all. `order_transferred` is the ordinary reason: the
      // vignette became this account's moments ago, so every cached page
      // predates it. One refetch, then give up — an order that was deleted,
      // refunded away or belongs to another session never arrives, and this
      // must not become a loop.
      if (refetchedForFocus.current !== orderId) {
        refetchedForFocus.current = orderId
        void refetch()
        return
      }
      clearPushFocus()

      return
    }

    setFocusedOrderId(target.id)
    // "Your order isn't paid yet" — the useful landing is the payment sheet
    // itself, not the card that holds the button.
    if (
      pushFocus?.screen === "checkout" &&
      target.status === "CREATED" &&
      target.checkout
    ) {
      setPaying(target)
    }
    clearPushFocus()
  }, [
    pushFocus,
    visible,
    booting,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    clearPushFocus,
  ])

  return (
    <div className="space-y-4 pt-1">
      {isError && visible.length === 0 ? (
        <Alert variant="destructive" className="rounded-[28px] border-0 bg-white/95">
          <TriangleAlert />
          <AlertTitle className="font-bold">{t("home.loadErrorTitle")}</AlertTitle>
          <AlertDescription className="font-medium text-navy-soft">
            {apiErrorMessage(error, t("home.loadErrorBody"))}
          </AlertDescription>
          <AlertAction>
            <Button variant="brand" size="sm" onClick={() => void refetch()}>
              {t("common.retry")}
            </Button>
          </AlertAction>
        </Alert>
      ) : booting ? (
        <>
          <OrderCardSkeleton />
          <OrderCardSkeleton />
        </>
      ) : visible.length === 0 ? (
        <BuyNowCard onBuy={() => navigate("/vignettes")} />
      ) : (
        <>
          {banner && (
            <UnpaidBanner
              basket={banner}
              onPay={setPaying}
              onCancelled={() => onBannerCancelled(banner)}
            />
          )}
          {/* only while the server says rate_prompt: "anywhere" */}
          <RateUsCard />
          {listed.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onPay={setPaying}
              autoExpand={order.id === focusedOrderId}
            />
          ))}
          {hasNextPage && (
            <Button
              variant="glass"
              size="pill"
              className="w-full"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage
                ? t("common.loading")
                : t("common.loadMore", {
                    current: pagination.current,
                    total: pagination.total,
                  })}
            </Button>
          )}
        </>
      )}

      <PaymentDrawer
        checkoutId={paying?.checkout?.id ?? null}
        open={paying !== null}
        onClose={() => setPaying(null)}
      />
    </div>
  )
}
