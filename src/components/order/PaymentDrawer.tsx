import { useNavigate } from "react-router-dom"
import { Check, ExternalLink, TriangleAlert, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Spinner } from "@/components/ui/spinner"
import { NativeCheckout } from "@/components/checkout/NativeCheckout"
import { useT } from "@/i18n"
import { checkoutIdFromPaymentLink, useCheckout } from "@/queries/checkout"
import { useInvalidateOrders, usePaymentStatus } from "@/queries/orders"
import { notePurchaseCompleted } from "@/stores/rating"
import type { Checkout, CheckoutMethod } from "@/types/api"

/**
 * In-sheet checkout. Given the `checkout` object a create call answered (or
 * the id of one to resume), it polls `GET /public/me/checkouts/:id` and
 * renders the native sheet — the Stripe Payment Element, the PayPal buttons,
 * Monobank — with the hosted page as the fallback: when native checkout is
 * switched off, when no method could be built, or while the checkout is
 * still loading its methods. The caller runs the order-status / top-up poll
 * and swaps this for the success screen; closing while the order is still
 * CREATED is the abandon signal (the order stays payable from Home).
 */
export function PaymentModal({
  checkout = null,
  checkoutId = null,
  paymentLink,
  onClose,
  onAttemptFailed,
}: {
  /** the block the create call answered — seeds the poll */
  checkout?: Checkout | null
  /** resume by id (an "Awaiting payment" card) when there is no block in hand */
  checkoutId?: string | null
  paymentLink: string | null
  onClose: () => void
  onAttemptFailed?: (reason: string, provider: CheckoutMethod["provider"]) => void
}) {
  const { t } = useT()
  const id = checkout?.id ?? checkoutId ?? checkoutIdFromPaymentLink(paymentLink)
  const live = useCheckout(id, { initial: checkout })
  const current = live.data ?? checkout
  const terminal =
    current && ["expired", "canceled", "paid_late"].includes(current.status)
      ? (current.status as "expired" | "canceled" | "paid_late")
      : null
  const native =
    current !== null &&
    current.native_checkout &&
    current.methods.length > 0 &&
    (current.status === "open" || current.status === "processing")
  // nothing native to offer and nothing on the way: the hosted page it is
  const hosted = !native && !terminal && (current !== null || live.isError || !id)

  return (
    <div className="flex h-[90dvh] flex-col">
      <div className="flex items-center justify-between px-4 pt-1 pb-3">
        <Button
          variant="white"
          size="icon-lg"
          onClick={onClose}
          aria-label={t("payment.closeLabel")}
          className="size-10 rounded-full"
        >
          <X className="size-5" />
        </Button>
        <span className="text-[17px] font-extrabold text-white">vignette.id</span>
        {paymentLink ? (
          <Button asChild variant="white" size="icon-lg" className="size-10 rounded-full">
            <a
              href={paymentLink}
              target="_blank"
              rel="noreferrer"
              aria-label={t("payment.openInBrowser")}
            >
              <ExternalLink className="size-4.5" />
            </a>
          </Button>
        ) : (
          <span className="size-10" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {terminal ? (
          <div className="px-4">
            <Alert className="rounded-2xl border-0 bg-white text-left">
              <TriangleAlert className="size-5" />
              <AlertDescription className="font-semibold text-navy">
                {terminal === "expired"
                  ? t("payment.expired")
                  : terminal === "canceled"
                    ? t("payment.canceled")
                    : t("payment.paidLate")}
              </AlertDescription>
            </Alert>
          </div>
        ) : native && current ? (
          <NativeCheckout
            checkout={current}
            paymentLink={paymentLink ?? current.hosted?.url ?? null}
            onAttemptFailed={onAttemptFailed}
          />
        ) : hosted && paymentLink ? (
          // the pay page ships `Content-Security-Policy: frame-ancestors *`
          // for exactly this embedded use
          <iframe
            src={paymentLink}
            title={t("payment.frameTitle")}
            allow="payment *; clipboard-write"
            className="h-full w-full rounded-t-[20px] border-0 bg-white"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white">
            <Spinner className="size-12 text-white" />
            <p className="text-[14px] font-semibold text-white/85">{t("payment.loading")}</p>
          </div>
        )}
      </div>

      {!terminal && (
        <p className="flex items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-semibold text-white/85">
          <Spinner className="size-3" />
          {t("payment.waiting")}
        </p>
      )}
    </div>
  )
}

export function DoneScreen({
  onFinish,
  kind = "vignette",
}: {
  onFinish: () => void
  /** "policy": a standalone Green Card — no vignette, so no fine warning */
  kind?: "vignette" | "policy"
}) {
  const { t } = useT()
  return (
    <div className="flex min-h-[86dvh] flex-col px-5 pb-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <span className="flex size-28 items-center justify-center rounded-full bg-mint shadow-[0_0_60px_rgba(69,217,161,0.45)]">
          <Check className="size-14 text-white" strokeWidth={3} />
        </span>
        <div>
          <p className="text-[26px] font-extrabold text-white">
            {t("payment.receivedTitle")}
          </p>
          <p className="mt-2 text-[17px] font-medium text-white/90">
            {kind === "policy" ? t("payment.receivedPolicyBody") : t("payment.receivedBody")}
          </p>
        </div>
        {kind === "vignette" && (
          <Alert className="rounded-2xl border-0 bg-pink text-left text-white [&>svg]:text-white">
            <TriangleAlert className="size-6" />
            <AlertDescription className="text-[15px] font-bold text-white">
              {t("payment.fineWarning")}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <Button variant="mint" size="xl" className="w-full text-lg tracking-[0.2em]" onClick={onFinish}>
        {kind === "policy" ? t("payment.goToOrders") : t("payment.goToVignettes")}
      </Button>
    </div>
  )
}

/**
 * Standalone re-checkout drawer for an existing unpaid (CREATED) order —
 * Home's "Awaiting payment" cards open this with the order's own
 * `payment_link` (returned on reads for CREATED orders). The checkout id is
 * the link's last segment, so the native sheet resumes with fresh secrets
 * from `GET /public/me/checkouts/:id`; the order is polled every 4s and the
 * drawer flips to the success screen the moment payment lands.
 */
export function PaymentDrawer({
  orderId,
  paymentLink,
  open,
  onClose,
}: {
  orderId: string | null
  paymentLink: string | null
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { t } = useT()
  const invalidateOrders = useInvalidateOrders()
  const { paid } = usePaymentStatus(orderId, open)

  // only reached once payment landed — the "after purchase" moment for the
  // rating sheet (it opens on Home if the server says this account is due)
  const finish = () => {
    void invalidateOrders()
    onClose()
    navigate("/")
    notePurchaseCompleted()
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && (paid ? finish() : onClose())}
    >
      <DrawerContent className="border-0 !bg-brand data-[vaul-drawer-direction=bottom]:max-h-[94dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        <DrawerTitle className="sr-only">{t("orderCard.completePayment")}</DrawerTitle>
        {paid ? (
          <DoneScreen onFinish={finish} />
        ) : (
          open && <PaymentModal paymentLink={paymentLink} onClose={onClose} />
        )}
      </DrawerContent>
    </Drawer>
  )
}
