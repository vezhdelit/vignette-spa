import { useNavigate } from "react-router-dom"
import { Check, ExternalLink, TriangleAlert, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Spinner } from "@/components/ui/spinner"
import { NativeCheckout } from "@/components/checkout/NativeCheckout"
import { useT } from "@/i18n"
import { useCheckout, useCheckoutPaid } from "@/queries/checkout"
import { useInvalidateOrders } from "@/queries/orders"
import { apiErrorMessage } from "@/lib/api"
import { notePurchaseCompleted } from "@/stores/rating"
import type { Checkout, CheckoutMethod } from "@/types/api"

/**
 * In-sheet checkout. Given the `checkout` object a create call answered (or
 * the id of one to resume), it polls `GET /public/me/checkouts/:id` — THE
 * read while paying: it asks the provider and completes the payment — and
 * renders the native sheet (the Stripe Payment Element, the PayPal buttons,
 * Monobank) with the checkout's own `hosted.url` as the fallback: when native
 * checkout is switched off or no method could be built. Everything comes off
 * the checkout; no legacy `payment_link` field is read (docs/checkout/
 * README.md, "Legacy fields"). The caller watches the same checkout
 * (useCheckoutPaid) and swaps this for the success screen; closing while it
 * is still open is the abandon signal (the order stays payable from Home).
 */
export function PaymentModal({
  checkout = null,
  checkoutId = null,
  onClose,
  onAttemptFailed,
}: {
  /** the block the create call answered — seeds the poll */
  checkout?: Checkout | null
  /** resume by id (an order's `checkout.id`) when there is no block in hand */
  checkoutId?: string | null
  onClose: () => void
  onAttemptFailed?: (reason: string, provider: CheckoutMethod["provider"]) => void
}) {
  const { t } = useT()
  const id = checkout?.id ?? checkoutId
  const live = useCheckout(id, { initial: checkout })
  const current = live.data ?? checkout
  const hostedUrl = current?.hosted?.url ?? null
  const terminal =
    current && ["expired", "canceled", "paid_late"].includes(current.status)
      ? (current.status as "expired" | "canceled" | "paid_late")
      : null
  const native =
    current !== null &&
    current.native_checkout &&
    current.methods.length > 0 &&
    (current.status === "open" || current.status === "processing")
  // nothing native to offer: the checkout's hosted page it is
  const hosted = !native && !terminal && current !== null && Boolean(hostedUrl)
  // the checkout could not be read at all (and nothing seeded it)
  const failed = !current && live.isError

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
        {hostedUrl ? (
          <Button asChild variant="white" size="icon-lg" className="size-10 rounded-full">
            <a
              href={hostedUrl}
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
            paymentLink={hostedUrl}
            onAttemptFailed={onAttemptFailed}
          />
        ) : hosted && hostedUrl ? (
          // the pay page ships `Content-Security-Policy: frame-ancestors *`
          // for exactly this embedded use
          <iframe
            src={hostedUrl}
            title={t("payment.frameTitle")}
            allow="payment *; clipboard-write"
            className="h-full w-full rounded-t-[20px] border-0 bg-white"
          />
        ) : failed ? (
          <div className="px-4">
            <Alert variant="destructive" className="rounded-2xl border-0 bg-white text-left">
              <TriangleAlert className="size-5" />
              <AlertDescription className="font-semibold">
                {apiErrorMessage(live.error)}
              </AlertDescription>
            </Alert>
          </div>
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
 * Home's banner and "Awaiting payment" cards open this with the order's
 * `checkout.id` (on every read of a CREATED order). The native sheet
 * resumes from `GET /public/me/checkouts/{checkout.id}` with fresh secrets,
 * and the same read — every 2 s, asking the provider — flips the drawer to
 * the success screen the moment the payment lands.
 */
export function PaymentDrawer({
  checkoutId,
  open,
  onClose,
}: {
  /** the order's `checkout.id` — the id the checkout is read by */
  checkoutId: string | null
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { t } = useT()
  const invalidateOrders = useInvalidateOrders()
  const { paid } = useCheckoutPaid(open ? checkoutId : null, open)

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
          open && (
            <PaymentModal checkoutId={checkoutId} onClose={onClose} />
          )
        )}
      </DrawerContent>
    </Drawer>
  )
}
