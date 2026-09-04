import { Car, Calendar, RectangleHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Empty-state card: ghosted vignette preview + the pink BUY NOW button. */
export function BuyNowCard({ onBuy }: { onBuy: () => void }) {
  return (
    <div>
      <Card className="rounded-[28px] shadow-[0_10px_30px_rgba(0,60,120,0.12)] ring-0 [--card-spacing:--spacing(5)]">
        <CardContent>
          <div className="flex gap-3 opacity-60">
            <div className="relative flex aspect-square w-1/3 max-w-32 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cloud to-white">
              <Car className="size-3/5 text-[#c3d3e3]" strokeWidth={1.4} />
              <span className="absolute top-3 right-3 size-5 rounded-full bg-[#dfe9f2]" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col pt-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-8 shrink-0 animate-none rounded bg-cloud" />
                <Skeleton className="h-3 flex-1 animate-none rounded-full bg-cloud" />
              </div>
              <Skeleton className="mt-4 h-6 w-full animate-none rounded-full bg-cloud" />
              <p className="mt-4 truncate text-sm font-bold tracking-[0.18em] text-[#b8c7d6]">
                DETAILS
              </p>
              <div className="mt-2 flex min-w-0 gap-2">
                <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border-2 border-dashed border-[#dbe5ee] px-2 py-2">
                  <span className="flex min-w-0 items-center gap-1 text-[10px] font-bold text-[#a9bccd]">
                    <RectangleHorizontal className="size-3.5 shrink-0" />
                    <span className="truncate">PLATE</span>
                  </span>
                  <Skeleton className="h-2 w-4/5 animate-none rounded-full bg-cloud" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border-2 border-dashed border-[#dbe5ee] px-2 py-2">
                  <span className="flex min-w-0 items-center gap-1 text-[10px] font-bold text-[#a9bccd]">
                    <Calendar className="size-3.5 shrink-0" />
                    <span className="truncate">EXPIRES</span>
                  </span>
                  <Skeleton className="h-2 w-4/5 animate-none rounded-full bg-cloud" />
                </span>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t-0 bg-transparent pt-0">
          <Button variant="pink" size="xl" className="w-full tracking-[0.2em]" onClick={onBuy}>
            Buy now
          </Button>
        </CardFooter>
      </Card>

      <p className="mt-4 text-center text-[15px] font-semibold text-white/95">
        Your vignettes will appear here once you buy one.
      </p>
    </div>
  )
}
