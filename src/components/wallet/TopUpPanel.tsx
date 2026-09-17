import { useEffect, useState } from "react"
import { Check, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage } from "@/lib/api"
import { formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"
import { useCancelTopUp, useCreateTopUp, useTopUp } from "@/queries/wallet"
import type { Wallet } from "@/types/api"

/**
 * Topping the wallet up, inline inside the Account page's Wallet section.
 *
 * Deliberately NOT in a drawer. The checkout is an iframe, and an iframe
 * inside a modal Radix dialog is inert — body `pointer-events: none` is
 * enforced onto cross-origin subframes, FocusScope pulls focus back out and
 * react-remove-scroll's touchmove handler kills scrolling. Plain page flow
 * has none of those problems, and it is the same shape the Home screen uses
 * for finishing an unpaid order.
 *
 * The checkout itself is the server's hosted page (`payment_link`), which
 * mounts Stripe, PayPal and Monobank on its own. That is why this app needs
 * no payment SDK at all: it embeds a URL, exactly as it does for an order.
 *
 * Nothing here decides that money arrived. `useTopUp` polls, the server
 * reconciles with the provider, and the success state follows that.
 */
export function TopUpPanel({
  wallet,
  onClose,
  onCredited,
}: {
  wallet: Wallet
  onClose: () => void
  /** the top-up completed — refresh balances above */
  onCredited: () => void
}) {
  const { t } = useT()
  const [amount, setAmount] = useState<number>(wallet.top_up.presets[1]?.amount ?? 1900)
  const [custom, setCustom] = useState("")
  const [topUpId, setTopUpId] = useState<number | null>(null)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)

  const createTopUp = useCreateTopUp()
  const cancelTopUp = useCancelTopUp()
  const poll = useTopUp(topUpId, { enabled: topUpId !== null })

  const status = poll.data?.status
  const paid = status === "completed"

  useEffect(() => {
    if (paid) onCredited()
  }, [paid, onCredited])

  const { min_amount: min, max_amount: max } = wallet.top_up
  const valid = Number.isInteger(amount) && amount >= min && amount <= max

  // The bonus the chosen amount earns, from the server's own tiers — never
  // recomputed here, so the page and the ledger always agree.
  const bonus =
    [...wallet.top_up.bonus_tiers]
      .filter((tier) => amount >= tier.from)
      .map((tier) => tier.bonus)
      .pop() ?? 0

  const start = async () => {
    try {
      const result = await createTopUp.mutateAsync(amount)
      setTopUpId(result.id)
      setPaymentLink(result.payment_link)
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  const abandon = async () => {
    // Closing while still pending is the abandon signal; the server cancels
    // the provider checkout so no stale intent is left behind. A failure is
    // not worth surfacing — the hourly sweep closes it either way.
    if (topUpId !== null && !paid) {
      await cancelTopUp.mutateAsync(topUpId).catch(() => {})
    }
    onClose()
  }

  if (paid) {
    const credited = poll.data
    return (
      <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl bg-mint/10 p-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-mint">
          <Check className="size-8 text-white" strokeWidth={3} />
        </span>
        <p className="text-[17px] font-extrabold text-navy">
          {t("wallet.topUp.doneTitle")}
        </p>
        <p className="text-sm font-semibold text-navy-soft">
          {credited && credited.bonus > 0
            ? t("wallet.topUp.doneWithBonus", {
                amount: formatCents(credited.amount),
                bonus: formatCents(credited.bonus),
              })
            : t("wallet.topUp.done", {
                amount: formatCents(credited?.amount ?? amount),
              })}
        </p>
        <Button variant="brand" size="pill" className="w-full" onClick={onClose}>
          {t("common.done")}
        </Button>
      </div>
    )
  }

  // Step 2 — the hosted checkout, inline.
  if (paymentLink) {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl bg-[#f1f4f8]">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-extrabold text-navy">
            {t("wallet.topUp.paying", { amount: formatCents(amount) })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={abandon}
            aria-label={t("common.cancel")}
            className="size-8 text-navy-soft"
          >
            <X className="size-4" />
          </Button>
        </div>
        <iframe
          src={paymentLink}
          title={t("wallet.topUp.frameTitle")}
          allow="payment *"
          className="h-[520px] w-full border-0 bg-white"
        />
        <p className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-navy-soft">
          <Spinner className="size-3" />
          {t("wallet.topUp.waiting")}
        </p>
      </div>
    )
  }

  // Step 1 — how much.
  return (
    <div className="mt-3 rounded-2xl bg-[#f1f4f8] p-3">
      <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
        {t("wallet.topUp.chooseAmount")}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {wallet.top_up.presets.map((preset) => (
          <button
            key={preset.amount}
            type="button"
            onClick={() => {
              setAmount(preset.amount)
              setCustom("")
            }}
            className={cn(
              "rounded-xl border-2 px-3 py-2.5 text-left transition",
              amount === preset.amount && !custom
                ? "border-brand bg-white"
                : "border-transparent bg-white/70"
            )}
          >
            <span className="block text-[17px] font-extrabold text-navy">
              {formatCents(preset.amount)}
            </span>
            {preset.bonus > 0 && (
              <span className="block text-[11px] font-bold text-mint">
                {t("wallet.topUp.plusBonus", { bonus: formatCents(preset.bonus) })}
              </span>
            )}
          </button>
        ))}
      </div>

      <Input
        value={custom}
        onChange={(event) => {
          const next = event.target.value.replace(/[^0-9.,]/g, "")
          setCustom(next)
          // typed in euros, sent in cents
          const euros = parseFloat(next.replace(",", "."))
          setAmount(Number.isFinite(euros) ? Math.round(euros * 100) : 0)
        }}
        inputMode="decimal"
        placeholder={t("wallet.topUp.customAmount", {
          min: formatCents(min),
          max: formatCents(max),
        })}
        aria-label={t("wallet.topUp.customAmount", {
          min: formatCents(min),
          max: formatCents(max),
        })}
        className="mt-2 h-auto rounded-xl border-0 bg-white px-3.5 py-3 text-[15px] font-bold text-navy shadow-none"
      />

      {custom && !valid && (
        <p className="mt-1.5 text-[13px] font-semibold text-pink">
          {t("wallet.topUp.outOfRange", {
            min: formatCents(min),
            max: formatCents(max),
          })}
        </p>
      )}

      {valid && bonus > 0 && (
        <p className="mt-1.5 text-[13px] font-semibold text-mint">
          {t("wallet.topUp.willGetBonus", { bonus: formatCents(bonus) })}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="pill" className="flex-1" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="brand"
          size="pill"
          className="flex-1"
          disabled={!valid || createTopUp.isPending}
          onClick={start}
        >
          {createTopUp.isPending ? (
            <Spinner className="size-4" />
          ) : (
            t("wallet.topUp.continue")
          )}
        </Button>
      </div>
    </div>
  )
}
