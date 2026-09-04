import { useState } from "react"
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
import { useAuthStore } from "@/stores/auth"
import { useOrders } from "@/queries/orders"
import { OrderCard } from "@/components/home/OrderCard"
import { OrderCardSkeleton } from "@/components/home/OrderCardSkeleton"
import { BuyNowCard } from "@/components/home/BuyNowCard"
import { PaymentDrawer } from "@/components/order/PaymentDrawer"
import type { Order } from "@/types/api"

const HIDDEN_STATUSES = new Set(["DELETED", "UNPAID DELETED", "USER DELETED", "UNDEFINED"])

export function HomePage() {
  const navigate = useNavigate()
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

  const visible = orders.filter((o) => !HIDDEN_STATUSES.has(o.status))
  const booting = authStatus === "booting" || isPending

  return (
    <div className="space-y-4 pt-1">
      {isError && visible.length === 0 ? (
        <Alert variant="destructive" className="rounded-[28px] border-0 bg-white/95">
          <TriangleAlert />
          <AlertTitle className="font-bold">Couldn't load your vignettes</AlertTitle>
          <AlertDescription className="font-medium text-navy-soft">
            {apiErrorMessage(error, "Failed to load orders")}
          </AlertDescription>
          <AlertAction>
            <Button variant="brand" size="sm" onClick={() => void refetch()}>
              Retry
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
          {visible.map((order) => (
            <OrderCard key={order.id} order={order} onPay={setPaying} />
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
                ? "Loading…"
                : `Load more (${pagination.current}/${pagination.total})`}
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
