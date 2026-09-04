import { useNavigate } from "react-router-dom"
import { Check, ExternalLink, TriangleAlert, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Spinner } from "@/components/ui/spinner"
import { useInvalidateOrders, usePaymentStatus } from "@/queries/orders"

/**
 * In-sheet checkout: the payment page rendered in an iframe (it ships
 * `Content-Security-Policy: frame-ancestors *` for exactly this embedded
 * use). The caller runs the order-status poll and swaps this for the success
 * screen; closing while the order is still CREATED is the abandon signal.
 */
export function PaymentModal({
  paymentLink,
  onClose,
}: {
  paymentLink: string | null
  onClose: () => void
}) {
  return (
    <div className="flex h-[90dvh] flex-col">
      <div className="flex items-center justify-between px-4 pt-1 pb-3">
        <Button
          variant="white"
          size="icon-lg"
          onClick={onClose}
          aria-label="Close payment"
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
              aria-label="Open payment page in browser"
            >
              <ExternalLink className="size-4.5" />
            </a>
          </Button>
        ) : (
          <span className="size-10" />
        )}
      </div>

      {paymentLink ? (
        <iframe
          src={paymentLink}
          title="Payment"
          allow="payment *; clipboard-write"
          className="w-full flex-1 rounded-t-[20px] border-0 bg-white"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-12 text-white" />
        </div>
      )}

      <p className="flex items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-semibold text-white/85">
        <Spinner className="size-3" />
        Waiting for the payment — you'll be redirected automatically
      </p>
    </div>
  )
}

export function DoneScreen({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex min-h-[86dvh] flex-col px-5 pb-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <span className="flex size-28 items-center justify-center rounded-full bg-mint shadow-[0_0_60px_rgba(69,217,161,0.45)]">
          <Check className="size-14 text-white" strokeWidth={3} />
        </span>
        <div>
          <p className="text-[26px] font-extrabold text-white">Payment received</p>
          <p className="mt-2 text-[17px] font-medium text-white/90">
            Payment has been successfully accepted and will be processed within
            the next 3–5 minutes.
          </p>
        </div>
        <Alert className="rounded-2xl border-0 bg-pink text-left text-white [&>svg]:text-white">
          <TriangleAlert className="size-6" />
          <AlertDescription className="text-[15px] font-bold text-white">
            Driving without an active vignette will result in a FINE TICKET
          </AlertDescription>
        </Alert>
      </div>
      <Button variant="mint" size="xl" className="w-full text-lg tracking-[0.2em]" onClick={onFinish}>
        Go to my vignettes
      </Button>
    </div>
  )
}

/**
 * Standalone re-checkout drawer for an existing unpaid (CREATED) order —
 * Home's "Awaiting payment" cards open this with the order's own
 * `payment_link` (returned on reads for CREATED orders). Polls the order
 * every 4s and flips to the success screen the moment payment lands.
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
  const invalidateOrders = useInvalidateOrders()
  const { paid } = usePaymentStatus(orderId, open)

  const finish = () => {
    void invalidateOrders()
    onClose()
    navigate("/")
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && (paid ? finish() : onClose())}
    >
      <DrawerContent className="border-0 !bg-brand data-[vaul-drawer-direction=bottom]:max-h-[94dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        <DrawerTitle className="sr-only">Complete payment</DrawerTitle>
        {paid ? (
          <DoneScreen onFinish={finish} />
        ) : (
          <PaymentModal paymentLink={paymentLink} onClose={onClose} />
        )}
      </DrawerContent>
    </Drawer>
  )
}
