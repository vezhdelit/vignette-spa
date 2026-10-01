import type { Ref } from "react"
import { ArrowRight, Info, Leaf, Plus } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { useT } from "@/i18n"
import {
  classQuote,
  EMISSION_NORMS,
  emissionLabels,
  isClassPriced,
  isNormSold,
  normBadge,
  type EmissionNorm,
} from "@/lib/emission"
import { cn } from "@/lib/utils"
import type { ProductPeriodPrice } from "@/types/api"

function NormBadge({ norm, className }: { norm: EmissionNorm; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white",
        norm === "electric" ? "bg-mint-deep" : "bg-[#173A7A]",
        className,
      )}
    >
      {normBadge(norm)}
    </span>
  )
}

/**
 * The emission-class picker of a product priced by class (Romania). Empty,
 * it is drawn as a call to action (dashed amber); picked, as a regular field
 * with the norm's badge. Each option shows what the selected period costs
 * for it; a norm the period doesn't sell is disabled.
 */
export function EmissionClassPicker({
  value,
  onChange,
  price,
  fmt,
  hint,
  open,
  onOpenChange,
  triggerRef,
}: {
  value: EmissionNorm | null
  onChange: (norm: EmissionNorm) => void
  /** the selected period's quote */
  price: ProductPeriodPrice | null
  fmt: (amount: number) => string
  /** under the field, e.g. what an order without a class pays */
  hint?: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerRef?: Ref<HTMLButtonElement>
}) {
  const { t } = useT()
  const { normLabel } = emissionLabels(t)
  const showPrices = isClassPriced(price)

  return (
    <div>
      <Select
        value={value ?? ""}
        onValueChange={(next) => onChange(next as EmissionNorm)}
        open={open}
        onOpenChange={onOpenChange}
      >
        <SelectTrigger
          ref={triggerRef}
          aria-label={t("emission.label")}
          className={cn(
            "h-auto w-full gap-3 rounded-xl px-3 py-2.5 text-[16px] font-bold shadow-none [&>svg]:size-5",
            value
              ? "border-0 bg-[#f1f4f8] text-navy [&>svg]:text-navy-soft"
              : "border-2 border-dashed border-[#f0b648] bg-[#fff8e8] text-[#6e4a00] [&>svg]:text-[#6e4a00]",
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            {value ? (
              <NormBadge norm={value} />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#fde3a6]">
                <Plus className="size-4" strokeWidth={3} />
              </span>
            )}
            <span className="truncate">
              {value ? normLabel(value) : t("emission.select")}
            </span>
          </span>
        </SelectTrigger>
        {/* popper, as for the plate country: item-aligned positions off a
            <SelectValue>, which this custom trigger doesn't render */}
        <SelectContent position="popper" align="start">
          {EMISSION_NORMS.map((norm) => (
            <SelectItem
              key={norm}
              value={norm}
              disabled={!isNormSold(price, norm)}
              className="py-1.5 *:[span]:last:flex-1"
            >
              <NormBadge norm={norm} className="size-7 text-[11px]" />
              <span className="flex-1 font-semibold">{normLabel(norm)}</span>
              {showPrices && price && (
                <span className="font-bold text-navy-soft">
                  {fmt(classQuote(price, norm).total_price)}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && (
        <p className="mt-2 flex gap-1.5 px-1 text-[13px] leading-snug font-semibold text-[#8a5a00]">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * No class picked yet on a product priced by class: how much the cheapest
 * class saves over the default one (the dearest), and a shortcut to the
 * picker.
 */
export function EmissionSavingsBanner({
  percent,
  classLabel,
  onAdd,
}: {
  percent: number
  /** the default class, "Euro 0–3" */
  classLabel: string
  onAdd: () => void
}) {
  const { t } = useT()
  return (
    <div className="mt-3 rounded-[24px] border-2 border-[#f5cf7a] bg-[#fff8e8] px-4 py-3.5 text-navy">
      <p className="flex items-center gap-2 text-[17px] font-extrabold">
        <Leaf className="size-5 shrink-0 text-mint-deep" />
        {t("emission.saveTitle", { percent })}
      </p>
      <p className="mt-1 text-sm leading-snug font-medium">
        {t("emission.saveText", { class: classLabel })}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2.5 flex items-center gap-1.5 text-sm font-bold text-[#173A7A]"
      >
        {t("emission.addClass")}
        <ArrowRight className="size-4" />
      </button>
    </div>
  )
}
