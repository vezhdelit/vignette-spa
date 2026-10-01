import { useState } from "react"
import { ArrowRight, Check, ChevronDown, Info, Leaf, Plus, X } from "lucide-react"
import {
  DrawerContent,
  DrawerDescription,
  DrawerNested,
  DrawerTitle,
} from "@/components/ui/drawer"
import { useT } from "@/i18n"
import {
  EMISSION_NORM_COLORS,
  EMISSION_NORM_YEARS,
  EMISSION_NORMS_BY_EMISSIONS,
  emissionLabels,
  isNormSold,
  normBadge,
  type EmissionNorm,
} from "@/lib/emission"
import { cn } from "@/lib/utils"
import type { ProductPeriodPrice } from "@/types/api"

const GRADIENT = `linear-gradient(90deg, ${EMISSION_NORMS_BY_EMISSIONS.map(
  (norm) => EMISSION_NORM_COLORS[norm],
).join(", ")})`

function NormBadge({ norm, className }: { norm: EmissionNorm; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-extrabold text-black/70",
        className,
      )}
      style={{ backgroundColor: EMISSION_NORM_COLORS[norm] }}
    >
      {normBadge(norm)}
    </span>
  )
}

/**
 * The emission-class field of a product priced by class (Romania). Empty, it
 * is drawn as a call to action (dashed amber); picked, as a regular field
 * with the norm's badge. A tap opens the picker sheet, nested over the order
 * sheet. Open state is the caller's when it passes `open` (the savings
 * banner opens it too), else its own.
 */
export function EmissionClassPicker({
  value,
  onChange,
  price,
  plate,
  hint,
  open,
  onOpenChange,
}: {
  value: EmissionNorm | null
  onChange: (norm: EmissionNorm) => void
  /** the selected period's quote: which norms it sells */
  price: ProductPeriodPrice | null
  /** the plate it is for, in the sheet's subtitle */
  plate?: string
  /** under the field, e.g. what an order without a class pays */
  hint?: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useT()
  const { normLabel } = emissionLabels(t)
  const [ownOpen, setOwnOpen] = useState(false)
  const isOpen = open ?? ownOpen
  const setOpen = onOpenChange ?? setOwnOpen

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("emission.label")}
        className={cn(
          "flex h-[50px] w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[15px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-brand/40",
          value
            ? "bg-[#f1f4f8] text-navy"
            : "border-2 border-dashed border-[#f0b648] bg-[#fff8e8] text-[#6e4a00]",
        )}
      >
        {value ? (
          <NormBadge norm={value} />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#fde3a6]">
            <Plus className="size-3.5" strokeWidth={3} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {value ? normLabel(value) : t("emission.select")}
        </span>
        <ChevronDown className="size-5 shrink-0 opacity-60" />
      </button>
      {hint && (
        <p className="mt-2 flex gap-1.5 px-1 text-[13px] leading-snug font-semibold text-[#8a5a00]">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {hint}
        </p>
      )}

      {/* nested: vaul stacks it over the order sheet and keeps that one
          open when this closes */}
      <DrawerNested open={isOpen} onOpenChange={setOpen}>
        <DrawerContent className="border-0 !bg-white data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
          {/* mounted per opening, so the draft starts from the pick */}
          <EmissionSheetBody
            value={value}
            price={price}
            plate={plate}
            onClose={() => setOpen(false)}
            onConfirm={(norm) => {
              onChange(norm)
              setOpen(false)
            }}
          />
        </DrawerContent>
      </DrawerNested>
    </div>
  )
}

/**
 * The sheet: the scale, the norms from most emissions to cleanest with their
 * typical years, and Confirm. The pick is a draft until Confirm, so browsing
 * changes no price. Header and Confirm stay put; only the list scrolls, so
 * Confirm is reachable on the shortest screen.
 */
function EmissionSheetBody({
  value,
  price,
  plate,
  onClose,
  onConfirm,
}: {
  value: EmissionNorm | null
  price: ProductPeriodPrice | null
  plate?: string
  onClose: () => void
  onConfirm: (norm: EmissionNorm) => void
}) {
  const { t } = useT()
  const { normLabel } = emissionLabels(t)
  const [draft, setDraft] = useState<EmissionNorm | null>(value)
  // "field {field} of the registration certificate", split around the field
  // so it can be bold
  const [before, after = ""] = t("emission.fieldHint", { field: "\u0000" }).split("\u0000")

  const yearsLabel = (norm: EmissionNorm) => {
    if (norm === "electric") return t("emission.electricNote")
    const [from, to] = EMISSION_NORM_YEARS[norm]
    if (from === null) return t("emission.yearsBefore", { year: to! })
    if (to === null) return t("emission.yearsAfter", { year: from })
    return t("emission.yearsRange", { from, to })
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
      <div className="px-6 pt-3">
        <div className="flex items-center justify-between gap-3">
          <DrawerTitle className="text-[22px] font-extrabold text-navy">
            {t("emission.label")}
          </DrawerTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("emission.close")}
            className="-mr-1 p-1 text-navy"
          >
            <X className="size-5" strokeWidth={3} />
          </button>
        </div>
        <DrawerDescription className="mt-0.5 text-[13px] text-navy-soft">
          {plate ? `${plate} · ` : ""}
          {before}
          <b className="text-navy">V.9</b>
          {after}
        </DrawerDescription>
        <div aria-hidden className="mt-2.5">
          <div className="h-1.5 rounded-full" style={{ background: GRADIENT }} />
          <div className="mt-1 flex justify-between text-[11px] font-bold">
            <span className="text-[#b5483a]">{t("emission.more")}</span>
            <span className="text-[#2f8a5b]">{t("emission.cleaner")}</span>
          </div>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={t("emission.label")}
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-1"
      >
        {EMISSION_NORMS_BY_EMISSIONS.map((norm) => {
          const selected = norm === draft
          return (
            <button
              key={norm}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!isNormSold(price, norm)}
              onClick={() => setDraft(norm)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left disabled:opacity-40",
                selected && "bg-[#e8f2fc]",
              )}
            >
              <NormBadge
                norm={norm}
                className={cn(
                  "h-[26px] w-8",
                  selected && "ring-2 ring-navy ring-offset-2 ring-offset-[#e8f2fc]",
                )}
              />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[15px] font-bold text-navy">
                  {normLabel(norm)}
                </span>
                <span className="block text-xs text-navy-soft">{yearsLabel(norm)}</span>
              </span>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-navy bg-navy text-white" : "border-[#c4c4c4]",
                )}
              >
                {selected && <Check className="size-3" strokeWidth={3.5} />}
              </span>
            </button>
          )
        })}
        <p className="mt-2 pb-2 text-xs leading-snug text-navy-soft">
          {t("emission.yearsNote", { field: "V.9" })}
        </p>
      </div>

      <div className="px-6 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={!draft}
          onClick={() => draft && onConfirm(draft)}
          className="h-[50px] w-full rounded-full bg-[#173A7A] text-base font-extrabold tracking-wide text-white uppercase disabled:opacity-50"
        >
          {t("emission.confirm")}
        </button>
      </div>
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
