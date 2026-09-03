import { useState } from "react"
import { useNavigate } from "react-router-dom"
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
        <div className="rounded-[28px] bg-white/95 p-5 text-center">
          <p className="font-bold text-navy">Couldn't load your vignettes</p>
          <p className="mt-1 text-sm font-medium text-navy-soft">
            {apiErrorMessage(error, "Failed to load orders")}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-full bg-brand px-6 py-2.5 font-bold text-white"
          >
            Retry
          </button>
        </div>
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
            <button
              type="button"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
              className="w-full rounded-full bg-white/20 py-3 text-[15px] font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {isFetchingNextPage
                ? "Loading…"
                : `Load more (${pagination.current}/${pagination.total})`}
            </button>
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
