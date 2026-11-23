import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n"
import { ApiRequestError, apiErrorMessage } from "@/lib/api"
import { useCancelCheckout } from "@/queries/checkout"
import { cn } from "@/lib/utils"

/**
 * "Cancel order" for an unpaid basket — the user won't finish it (wrong
 * plate, wrong dates: an unpaid order can't be edited, so cancel and buy
 * again). `POST /public/me/checkouts/:id/cancel` closes the whole basket
 * (status USER DELETED), releases the promo, the wallet money held and a
 * Green Card record, and stops the unpaid reminders; the order lists
 * refresh on success. Two taps: the first asks, the second cancels.
 *
 * Never shown while a payment is being confirmed — and should one start
 * between the read and the tap, the API refuses with `checkout_not_open` /
 * `processing` and nothing is canceled (2026-11-23).
 */
export function CancelUnpaidOrder({
  checkoutId,
  className,
  tone = "light",
  onCancelled,
}: {
  checkoutId: string
  className?: string
  /** "light": on a white card; "dark": on a tinted one */
  tone?: "light" | "dark"
  /** the cancel went through */
  onCancelled?: () => void
}) {
  const { t } = useT()
  const cancel = useCancelCheckout()
  const [asking, setAsking] = useState(false)

  const confirm = async () => {
    try {
      await cancel.mutateAsync(checkoutId)
      toast.success(t("unpaid.canceled"))
      onCancelled?.()
    } catch (e) {
      const refusal = e instanceof ApiRequestError && e.type === "checkout_not_open"
      toast.error(
        refusal && e.checkoutStatus === "processing"
          ? t("unpaid.cancelProcessing")
          : refusal && (e.checkoutStatus === "paid" || e.checkoutStatus === "paid_late")
            ? t("unpaid.cancelPaid")
            : apiErrorMessage(e, t("unpaid.cancelFailed"))
      )
    } finally {
      setAsking(false)
    }
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setAsking(true)
        }}
        className={cn(
          "py-1 text-[13px] font-bold underline-offset-2 hover:underline",
          tone === "light" ? "text-navy-soft" : "text-white/85",
          className
        )}
      >
        {t("unpaid.cancel")}
      </button>
    )
  }

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-2xl bg-black/[0.04] p-3", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[13px] font-semibold text-navy">{t("unpaid.cancelConfirm")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" disabled={cancel.isPending} onClick={() => setAsking(false)}>
          {t("unpaid.cancelKeep")}
        </Button>
        <Button
          variant="destructive"
          size="lg"
          disabled={cancel.isPending}
          onClick={() => void confirm()}
        >
          {cancel.isPending ? <Spinner className="size-4" /> : t("unpaid.cancelYes")}
        </Button>
      </div>
    </div>
  )
}
