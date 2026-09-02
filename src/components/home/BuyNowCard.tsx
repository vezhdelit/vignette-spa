import { Car, Calendar, RectangleHorizontal } from "lucide-react"

/** Empty-state card: ghosted vignette preview + the pink BUY NOW button. */
export function BuyNowCard({ onBuy }: { onBuy: () => void }) {
  return (
    <div>
      <div className="rounded-[28px] bg-white p-5 shadow-[0_10px_30px_rgba(0,60,120,0.12)]">
        <div className="flex gap-3 opacity-60">
          <div className="relative flex aspect-square w-1/3 max-w-32 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cloud to-white">
            <Car className="size-3/5 text-[#c3d3e3]" strokeWidth={1.4} />
            <span className="absolute top-3 right-3 size-5 rounded-full bg-[#dfe9f2]" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col pt-1">
            <div className="flex items-center gap-2">
              <span className="h-5 w-8 shrink-0 rounded bg-cloud" />
              <span className="h-3 flex-1 rounded-full bg-cloud" />
            </div>
            <span className="mt-4 h-6 w-full rounded-full bg-cloud" />
            <p className="mt-4 truncate text-sm font-bold tracking-[0.18em] text-[#b8c7d6]">
              DETAILS
            </p>
            <div className="mt-2 flex min-w-0 gap-2">
              <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border-2 border-dashed border-[#dbe5ee] px-2 py-2">
                <span className="flex min-w-0 items-center gap-1 text-[10px] font-bold text-[#a9bccd]">
                  <RectangleHorizontal className="size-3.5 shrink-0" />
                  <span className="truncate">PLATE</span>
                </span>
                <span className="h-2 w-4/5 rounded-full bg-cloud" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border-2 border-dashed border-[#dbe5ee] px-2 py-2">
                <span className="flex min-w-0 items-center gap-1 text-[10px] font-bold text-[#a9bccd]">
                  <Calendar className="size-3.5 shrink-0" />
                  <span className="truncate">EXPIRES</span>
                </span>
                <span className="h-2 w-4/5 rounded-full bg-cloud" />
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onBuy}
          className="mt-5 w-full rounded-2xl bg-pink py-4 text-xl font-extrabold tracking-[0.2em] text-white shadow-[0_8px_20px_rgba(255,31,110,0.35)] transition active:scale-[0.98]"
        >
          BUY NOW
        </button>
      </div>

      <p className="mt-4 text-center text-[15px] font-semibold text-white/95">
        Your vignettes will appear here once you buy one.
      </p>
    </div>
  )
}
