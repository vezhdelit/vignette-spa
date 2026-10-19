import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { PolicyOrderSheet } from "@/components/order/PolicyOrderSheet"
import { Flag } from "@/lib/countries"
import { formatPrice } from "@/lib/format"
import { useT } from "@/i18n"
import { useGreenCardCatalog } from "@/queries/green-card"

/**
 * The Market tab: what can be bought on its own, without a vignette. One
 * offer today — a standalone Green Card (docs/insurance/README.md), an
 * order row of its own with product "green-card". The page is a list so the
 * next product (OSAGO, travel insurance) is one more card.
 */
export function MarketPage() {
  const { t } = useT()
  const catalogQuery = useGreenCardCatalog()
  const catalog = catalogQuery.data
  const [buying, setBuying] = useState(false)

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-[26px] leading-tight font-extrabold text-white">{t("market.title")}</h1>
        <p className="mt-1 text-[15px] font-medium text-white/85">{t("market.subtitle")}</p>
      </div>

      {catalogQuery.isPending ? (
        <Card className="rounded-[28px] shadow-[0_10px_30px_rgba(0,60,120,0.12)] ring-0">
          <CardContent className="flex gap-3">
            <Skeleton className="size-24 shrink-0 rounded-2xl bg-cloud" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <Skeleton className="h-6 w-2/3 rounded-full bg-cloud" />
              <Skeleton className="h-3 w-full rounded-full bg-cloud" />
              <Skeleton className="h-3 w-5/6 rounded-full bg-cloud" />
            </div>
          </CardContent>
        </Card>
      ) : catalog ? (
        <Card className="rounded-[28px] shadow-[0_10px_30px_rgba(0,60,120,0.12)] ring-0">
          <CardContent className="flex gap-3">
            <div className="relative flex size-24 shrink-0 items-center justify-center rounded-2xl bg-mint/20 sm:size-28">
              <ShieldCheck className="size-14 text-mint-deep" strokeWidth={1.6} />
              <Badge className="absolute -right-1 -bottom-1 rounded-lg bg-brand-tint px-1.5 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                {t("greenCard.new")}
              </Badge>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex items-center gap-1.5">
                {catalog.plate_countries.map((code) => (
                  <Flag key={code} code={code} className="h-3.5 w-5 rounded-xs" />
                ))}
                <span className="truncate text-xs font-extrabold tracking-wider text-orange-400 uppercase">
                  {catalog.provider}
                </span>
              </p>
              <h3 className="mt-0.5 truncate text-[24px] leading-tight font-extrabold text-navy">
                {t("greenCard.title")}
              </h3>
              <p className="mt-1 text-[13px] leading-snug font-semibold text-navy-soft">
                {t("market.greenCard.body")}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex items-center gap-3 border-t-0 bg-transparent pt-0">
            <span className="shrink-0 text-[17px] font-extrabold whitespace-nowrap text-navy">
              {t("market.greenCard.from", {
                price: formatPrice(catalog.from_price.amount, catalog.from_price.currency),
              })}
            </span>
            <Button
              variant="pink"
              size="xl"
              className="flex-1 tracking-[0.15em]"
              disabled={!catalog.enabled}
              onClick={() => setBuying(true)}
            >
              {t("market.greenCard.buy")}
            </Button>
          </CardFooter>
          {!catalog.enabled && (
            <p className="px-5 pb-4 text-center text-[13px] font-semibold text-navy-soft">
              {t("market.greenCard.paused")}
            </p>
          )}
        </Card>
      ) : (
        <Empty className="rounded-[28px] bg-white/10 text-white">
          <EmptyHeader>
            <EmptyDescription className="text-white/85">{t("market.empty")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {catalog && (
        <PolicyOrderSheet catalog={catalog} open={buying} onClose={() => setBuying(false)} />
      )}
    </div>
  )
}
