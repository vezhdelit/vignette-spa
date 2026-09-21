import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { PaymentModal } from "@/components/order/PaymentDrawer"
import { apiErrorMessage } from "@/lib/api"
import { formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"
import { useCancelTopUp, useCreateTopUp, useTopUp } from "@/queries/wallet"
import type { Wallet } from "@/types/api"

/**
 * Topping the wallet up — the same shape as buying a vignette: one drawer
 * with steps, and the checkout itself rendered by the very same
 * `PaymentModal` the order flow uses.
 *
 * What is embedded is the server's own hosted page (`payment_link`), which
 * mounts Stripe, PayPal and Monobank itself. That is why this app needs no
 * payment SDK at all — it opens a URL, exactly as it does for an order.
 *
 * Nothing here decides that money arrived. `useTopUp` polls, the server
 * reconciles with the provider on every poll, and the success step follows
 * that. Closing while still pending is the abandon signal and cancels the
 * provider checkout, mirroring how leaving the order checkout works.
 */

// "paying" covers the success screen too: it shows once the polled top-up
// is credited (see `paid` below), no extra state transition needed — the
// same way the order sheet handles its own payment step.
type Step = "amount" | "paying"

export function TopUpDrawer({
  wallet,
  open,
  onClose,
  onCredited,
}: {
  wallet: Wallet
  open: boolean
  onClose: () => void
  /** the top-up completed — refresh the balances behind the drawer */
  onCredited: () => void
}) {
  const { t } = useT()
  const [step, setStep] = useState<Step>("amount")
  const [amount, setAmount] = useState<number>(wallet.top_up.presets[1] ?? 1900)
  const [custom, setCustom] = useState("")
  const [topUpId, setTopUpId] = useState<number | null>(null)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)

  const createTopUp = useCreateTopUp()
  const cancelTopUp = useCancelTopUp()
  const poll = useTopUp(topUpId, { enabled: step === "paying" })
  const credited = poll.data
  const paid = credited?.status === "completed"

  // The balances behind the drawer are stale the moment the money lands.
  // This is a side effect on external state, not a render decision — which
  // screen shows is derived from `paid` below.
  useEffect(() => {
    if (paid) onCredited()
  }, [paid, onCredited])

  const { min_amount: min, max_amount: max } = wallet.top_up
  const valid = Number.isInteger(amount) && amount >= min && amount <= max

  // The bonus rule, stated once: highest `from` <= amount wins. `presets`
  // are bare cent amounts on the wire — the server deliberately does not
  // carry a resolved bonus on each tile, so every amount (typed or tapped)
  // is resolved against `bonus_tiers` the same way here.
  const bonusFor = (value: number) =>
    [...wallet.top_up.bonus_tiers]
      .filter((tier) => value >= tier.from)
      .map((tier) => tier.bonus)
      .pop() ?? 0

  const bonus = bonusFor(amount)

  const start = async () => {
    try {
      const result = await createTopUp.mutateAsync(amount)
      setTopUpId(result.id)
      setPaymentLink(result.payment_link)
      setStep("paying")
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  /**
   * Closing mid-payment abandons it, so the provider checkout is cancelled.
   * Resetting here rather than in an effect on `open` keeps the next open
   * starting at the amount step without a render round trip.
   */
  const close = () => {
    if (step === "paying" && topUpId !== null && !paid) {
      // best-effort: the hourly sweep closes it either way
      void cancelTopUp.mutateAsync(topUpId).catch(() => {})
    }
    setStep("amount")
    setTopUpId(null)
    setPaymentLink(null)
    setCustom("")
    onClose()
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !next && close()}>
      <DrawerContent className="border-0 !bg-brand data-[vaul-drawer-direction=bottom]:max-h-[94dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        <DrawerTitle className="sr-only">{t("account.wallet.topUp")}</DrawerTitle>

        {step === "paying" && !paid && (
          <PaymentModal paymentLink={paymentLink} onClose={close} />
        )}

        {step === "paying" && paid && (
          <DoneScreen
            amount={credited?.amount ?? amount}
            bonus={credited?.bonus ?? 0}
            onFinish={close}
          />
        )}

        {step === "amount" && (
          <div className="px-5 pt-2 pb-6">
            <p className="text-[22px] font-extrabold text-white">
              {t("wallet.topUp.chooseAmount")}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-white/75">
              {t("wallet.topUp.currentBalance", {
                amount: formatCents(wallet.total, wallet.currency),
              })}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {wallet.top_up.presets.map((preset) => {
                const presetBonus = bonusFor(preset)
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setAmount(preset)
                      setCustom("")
                    }}
                    className={cn(
                      "rounded-2xl border-2 px-3.5 py-3 text-left transition",
                      amount === preset && !custom
                        ? "border-white bg-white/20"
                        : "border-transparent bg-white/10"
                    )}
                  >
                    <span className="block text-[19px] font-extrabold text-white">
                      {formatCents(preset)}
                    </span>
                    {presetBonus > 0 && (
                      <span className="block text-[12px] font-bold text-mint">
                        {t("wallet.topUp.plusBonus", { bonus: formatCents(presetBonus) })}
                      </span>
                    )}
                  </button>
                )
              })}
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
              className="mt-2.5 h-auto rounded-xl border-0 bg-brand-tint/70 px-3.5 py-3 text-[15px] font-bold text-white shadow-none placeholder:font-semibold placeholder:text-white/60 focus-visible:ring-white/40 md:text-[15px]"
            />

            {custom && !valid && (
              <p className="mt-2 text-[13px] leading-snug font-semibold text-sun">
                {t("wallet.topUp.outOfRange", {
                  min: formatCents(min),
                  max: formatCents(max),
                })}
              </p>
            )}

            {valid && bonus > 0 && (
              <p className="mt-2 text-[13px] leading-snug font-semibold text-mint">
                {t("wallet.topUp.willGetBonus", { bonus: formatCents(bonus) })}
              </p>
            )}

            <Button
              variant="mint"
              size="xl"
              className="mt-5 w-full disabled:opacity-60"
              disabled={!valid || createTopUp.isPending}
              onClick={start}
            >
              {createTopUp.isPending ? (
                <Spinner className="size-5" />
              ) : (
                t("wallet.topUp.payAmount", { amount: formatCents(amount) })
              )}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/** The wallet's own success screen — the order one talks about vignettes. */
function DoneScreen({
  amount,
  bonus,
  onFinish,
}: {
  amount: number
  bonus: number
  onFinish: () => void
}) {
  const { t } = useT()
  return (
    <div className="flex min-h-[70dvh] flex-col px-5 pb-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <span className="flex size-28 items-center justify-center rounded-full bg-mint shadow-[0_0_60px_rgba(69,217,161,0.45)]">
          <Check className="size-14 text-white" strokeWidth={3} />
        </span>
        <div>
          <p className="text-[26px] font-extrabold text-white">
            {t("wallet.topUp.doneTitle")}
          </p>
          <p className="mt-2 text-[17px] font-medium text-white/90">
            {bonus > 0
              ? t("wallet.topUp.doneWithBonus", {
                  amount: formatCents(amount),
                  bonus: formatCents(bonus),
                })
              : t("wallet.topUp.done", { amount: formatCents(amount) })}
          </p>
        </div>
      </div>
      <Button
        variant="mint"
        size="xl"
        className="w-full text-lg tracking-[0.2em]"
        onClick={onFinish}
      >
        {t("common.done")}
      </Button>
    </div>
  )
}
