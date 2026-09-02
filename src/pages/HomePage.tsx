import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth"
import { useOrdersStore } from "@/stores/orders"
import { OrderCard } from "@/components/home/OrderCard"
import { OrderCardSkeleton } from "@/components/home/OrderCardSkeleton"
import { BuyNowCard } from "@/components/home/BuyNowCard"

const HIDDEN_STATUSES = new Set(["DELETED", "UNPAID DELETED", "USER DELETED", "UNDEFINED"])

export function HomePage() {
  const navigate = useNavigate()
  const authStatus = useAuthStore((s) => s.status)
  const { orders, pages, loading, loaded, error, load, loadMore } =
    useOrdersStore()

  useEffect(() => {
    // orders.load() creates a guest session on its own if none exists yet
    if (authStatus === "ready") void load()
  }, [authStatus, load])

  // orders paid moments ago show as CREATED → poll until the worker flips them
  const hasProcessing = orders.some(
    (o) => o.status === "CREATED" || o.status === "PENDING"
  )
  useEffect(() => {
    if (!hasProcessing) return
    const timer = setInterval(() => void load({ silent: true }), 20_000)
    return () => clearInterval(timer)
  }, [hasProcessing, load])

  const visible = orders.filter((o) => !HIDDEN_STATUSES.has(o.status))
  const booting = authStatus === "booting" || (!loaded && loading) || !loaded

  return (
    <div className="space-y-4 pt-1">
      {error && visible.length === 0 && loaded ? (
        <div className="rounded-[28px] bg-white/95 p-5 text-center">
          <p className="font-bold text-navy">Couldn't load your vignettes</p>
          <p className="mt-1 text-sm font-medium text-navy-soft">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
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
            <OrderCard key={order.id} order={order} />
          ))}
          {pages.current < pages.total && (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="w-full rounded-full bg-white/20 py-3 text-[15px] font-extrabold text-white transition active:scale-[0.98]"
            >
              Load more ({pages.current}/{pages.total})
            </button>
          )}
        </>
      )}
    </div>
  )
}
