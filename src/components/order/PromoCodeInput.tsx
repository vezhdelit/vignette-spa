import { Ticket, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { formatPrice } from "@/lib/format"
import { useT } from "@/i18n"
import type { PromoValidateResult } from "@/types/api"

/**
 * The promo code field on the order sheet's dark card.
 *
 * Two things can be showing at once: the code the user applied (checked
 * against this exact order by POST /public/me/promos/validate) and, when
 * they typed none, the auto-apply campaign the server would use anyway. Both
 * quote EUR — an order settles in EUR whatever the display currency is — so
 * every amount here is printed in euro on purpose.
 */
export function PromoCodeInput({
  code,
  onCode,
  applied,
  auto,
  error,
  pending,
  onApply,
  onRemove,
}: {
  /** the text in the field */
  code: string
  onCode: (value: string) => void
  /** the validated typed code, once it applied */
  applied: PromoValidateResult | null
  /** the auto campaign for this order, when no code is applied */
  auto: PromoValidateResult | null
  error: string | null
  pending: boolean
  onApply: () => void
  onRemove: () => void
}) {
  const { t } = useT()
  const active = applied ?? auto

  return (
    <div className="mt-4 px-1">
      <p className="text-xs font-extrabold tracking-wider text-white/70 uppercase">
        {t("promo.label")}
      </p>

      {applied?.promo ? (
        <div className="mt-2 flex items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2.5">
          <Ticket className="size-5 shrink-0 text-mint" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[15px] font-extrabold text-white">
              {applied.promo.code ?? applied.promo.name}
            </span>
            <span className="block truncate text-xs font-semibold text-white/75">
              {applied.promo.effect_summary || applied.promo.name}
            </span>
          </span>
          <span className="shrink-0 text-[15px] font-extrabold whitespace-nowrap text-mint">
            −{formatPrice(applied.discount_eur, "EUR")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={t("promo.remove")}
            className="size-8 shrink-0 text-white/80 hover:bg-white/15 hover:text-white"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex items-stretch gap-2">
          <Input
            value={code}
            onChange={(event) => onCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                onApply()
              }
            }}
            placeholder={t("promo.placeholder").toLocaleUpperCase()}
            aria-label={t("promo.label")}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-auto min-w-0 flex-1 rounded-xl border-0 bg-brand-tint/70 px-3.5 py-3 text-[15px] font-bold tracking-[0.1em] text-white uppercase shadow-none placeholder:font-semibold placeholder:tracking-wider placeholder:text-white/60 focus-visible:ring-white/40 md:text-[15px]"
          />
          <Button
            variant="secondary"
            onClick={onApply}
            disabled={pending || code.trim().length === 0}
            className="h-auto shrink-0 rounded-xl bg-white px-5 text-sm font-extrabold tracking-wider text-brand uppercase hover:bg-white/90"
          >
            {pending ? <Spinner className="size-4" /> : t("promo.apply")}
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[13px] leading-snug font-semibold text-sun">{error}</p>
      )}

      {/* the server applies this one with or without a code — say so rather
          than letting the total change unexplained at checkout */}
      {!applied && auto?.promo && (
        <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug font-semibold text-mint">
          <Ticket className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {auto.promo.effect_summary
              ? t("promo.autoAppliedWithSummary", {
                  name: auto.promo.name,
                  discount: formatPrice(auto.discount_eur, "EUR"),
                  summary: auto.promo.effect_summary,
                })
              : t("promo.autoApplied", {
                  name: auto.promo.name,
                  discount: formatPrice(auto.discount_eur, "EUR"),
                })}
          </span>
        </p>
      )}

      {active && (active.cashback_eur ?? 0) > 0 && (
        <p className="mt-1.5 text-[13px] leading-snug font-semibold text-white/80">
          {t("promo.cashbackNote", {
            amount: formatPrice(active.cashback_eur ?? 0, "EUR"),
          })}
        </p>
      )}
    </div>
  )
}
