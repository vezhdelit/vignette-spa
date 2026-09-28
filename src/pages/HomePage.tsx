import { useEffect, useMemo, useState } from "react"
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
import { useOrders } from "@/queries/orders"
import { OrderCard } from "@/components/home/OrderCard"
import { OrderCardSkeleton } from "@/components/home/OrderCardSkeleton"
import { BuyNowCard } from "@/components/home/BuyNowCard"
import { RateUsCard } from "@/components/home/RateUsCard"
import { PaymentDrawer } from "@/components/order/PaymentDrawer"
import type { Order } from "@/types/api"

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
  const booting = authStatus === "booting" || isPending

  // A tapped push names the order it is about (stores/push-focus.ts). Open
  // that card rather than dropping the reader at the top of their list.
  const pushFocus = usePushFocusStore((s) => s.focus)
  const clearPushFocus = usePushFocusStore((s) => s.clear)
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null)

  useEffect(() => {
    const orderId = pushFocus?.orderId
    // Account screens belong to /account and are routed in App; without an
    // order id there is nothing here to open.
    if (!orderId || booting || isAccountScreen(pushFocus?.screen ?? null)) return

    const target = visible.find((order) => order.id === orderId)
    if (!target) {
      // Orders arrive a page at a time, so the one the push named may be
      // further down. Keep loading until it turns up — or the pages run out,
      // which is an order that was deleted, refunded away or belongs to
      // another session: land on Home as any other visit would.
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
      else clearPushFocus()

      return
    }

    setFocusedOrderId(target.id)
    // "Your order isn't paid yet" — the useful landing is the payment sheet
    // itself, not the card that holds the button.
    if (
      pushFocus?.screen === "checkout" &&
      target.status === "CREATED" &&
      target.payment_link
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
          {/* only while the server says rate_prompt: "anywhere" */}
          <RateUsCard />
          {visible.map((order) => (
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
        orderId={paying?.id ?? null}
        paymentLink={paying?.payment_link ?? null}
        open={paying !== null}
        onClose={() => setPaying(null)}
      />
    </div>
  )
}
