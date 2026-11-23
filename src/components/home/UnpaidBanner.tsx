import { useEffect, useState } from "react"
import { Clock3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { CancelUnpaidOrder } from "@/components/home/CancelUnpaidOrder"
import { countryLabel, FlagRect } from "@/lib/countries"
import { formatCents, formatDotDateTime } from "@/lib/format"
import { useT } from "@/i18n"
import type { UnpaidBasket } from "@/queries/orders"
import type { Order } from "@/types/api"

/** "in 3 hours" / "in 25 minutes", in the app's language */
function relativeUntil(language: string, seconds: number): string {
  const format = new Intl.RelativeTimeFormat(language === "en" ? "en-GB" : language, {
    numeric: "auto",
  })
  return seconds >= 90 * 60
    ? format.format(Math.round(seconds / 3600), "hour")
    : format.format(Math.max(1, Math.round(seconds / 60)), "minute")
}

/**
 * The newest unpaid basket, at the top of Home — the "finish your order"
 * the API makes one read for (GET /public/me/orders?status=created, each
 * unpaid order carrying its `checkout`). It speaks for the basket by its
 * checkout's state:
 *   open        what is due, until when, Pay — and Cancel order
 *   processing  a payment is being confirmed: no Pay, no Cancel
 *   paid_late   the money came after the deadline: the team handles it
 * The deadline is read off the clock, so the banner steps aside the moment
 * it passes, before the server has closed the order. Other unpaid baskets
 * stay in the list below.
 */
export function UnpaidBanner({
  basket,
  others,
  onPay,
}: {
  basket: UnpaidBasket
  /** how many more unpaid baskets the list holds */
  others: number
  onPay: (order: Order) => void
}) {
  const { t, language } = useT()
  const { checkout, orders } = basket
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  // the countdown moves every half minute; nothing to tick without a deadline
  useEffect(() => {
    if (!checkout.expires_at) return
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000)
    return () => clearInterval(timer)
  }, [checkout.expires_at])

  const left = checkout.expires_at ? checkout.expires_at - now : null
  if (checkout.status === "open" && left !== null && left <= 0) return null

  const due = formatCents(checkout.due ?? 0, "EUR")

  return (
    <Card className="gap-0 overflow-hidden rounded-[28px] border-0 bg-white p-0 shadow-[0_12px_32px_rgba(15,28,63,0.18)]">
      <div className="flex items-center justify-between gap-2 bg-sun px-4 py-2.5 text-[#4a3200]">
        <span className="flex items-center gap-2 text-[14px] font-extrabold">
          <Clock3 className="size-4" />
          {checkout.status === "processing"
            ? t("unpaid.titleProcessing")
            : checkout.status === "paid_late"
              ? t("unpaid.titleLate")
              : t("unpaid.title")}
        </span>
        {others > 0 && (
          <span className="text-[12px] font-bold opacity-80">
            {t("unpaid.others", { count: others })}
          </span>
        )}
      </div>

      <div className="space-y-3 p-4">
        <ul className="space-y-1.5">
          {orders.slice(0, 3).map((order) => (
            <li key={order.id} className="flex items-center gap-2 text-[15px] font-bold text-navy">
              <FlagRect code={order.country} />
              <span className="truncate">{countryLabel(order.country)}</span>
              {order.cars[0]?.plate && (
                <span className="ml-auto shrink-0 rounded-lg bg-[#ECEFF3] px-2 py-0.5 font-mono text-[13px] tracking-wider">
                  {order.cars[0].plate}
                </span>
              )}
            </li>
          ))}
          {orders.length > 3 && (
            <li className="text-[13px] font-semibold text-navy-soft">
              {t("unpaid.moreItems", { count: orders.length - 3 })}
            </li>
          )}
        </ul>

        {checkout.status === "open" && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold text-navy-soft">
                {t("payment.amountDue")}
              </span>
              <span className="text-[26px] font-extrabold text-navy">{due}</span>
            </div>
            {checkout.expires_at && left !== null && (
              <p className="text-[13px] font-semibold text-navy-soft">
                {t("unpaid.payBy", {
                  date: formatDotDateTime(checkout.expires_at),
                  relative: relativeUntil(language, left),
                })}
              </p>
            )}
            <Button variant="mint" size="xl" className="w-full" onClick={() => onPay(orders[0])}>
              {t("payment.payAmount", { amount: due })}
            </Button>
            <div className="flex justify-center">
              <CancelUnpaidOrder checkoutId={checkout.id} className="w-full" />
            </div>
          </>
        )}

        {checkout.status === "processing" && (
          <p className="flex items-center gap-2 text-[14px] font-semibold text-navy-soft">
            <Spinner className="size-4 text-brand" />
            {t("payment.confirming")}
          </p>
        )}

        {checkout.status === "paid_late" && (
          <p className="text-[14px] font-semibold text-navy-soft">{t("payment.paidLate")}</p>
        )}
      </div>
    </Card>
  )
}
