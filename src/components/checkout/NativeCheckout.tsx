import { useEffect, useMemo, useRef, useState } from "react"
import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadScript, type PayPalNamespace } from "@paypal/paypal-js"
import { Check, Copy, ExternalLink, FlaskConical, Share2, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useT, type MessageKey } from "@/i18n"
import { apiErrorMessage } from "@/lib/api"
import { formatCents, formatDotDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  useCheckoutConfig,
  useCreateMonobankInvoice,
  usePayPalCapture,
  useSimulateCheckout,
  useSyncCheckout,
} from "@/queries/checkout"
import type {
  Checkout,
  CheckoutMethod,
  MonobankCheckoutMethod,
  PayPalCheckoutMethod,
  StripeCheckoutMethod,
} from "@/types/api"

/**
 * The native payment sheet (docs/checkout/README.md): one tab per method
 * the checkout offers — the Stripe Payment Element (Apple Pay, Google Pay
 * and Link ride inside it), the PayPal buttons, and Monobank as a redirect
 * — plus the hosted page as the way out when none of them suits.
 *
 * Nothing here decides that money arrived: a confirmed card or a captured
 * PayPal order asks the server to re-read the checkout (`sync`), and the
 * caller's poll of the checkout / the order status / the top-up is what
 * flips the sheet to its success screen. A decline is reported through
 * `onAttemptFailed` so the caller can log it with its own context.
 *
 * In sandbox the sheet also offers to simulate the active method's outcome
 * (`…/simulate`), so every branch is testable without a card.
 *
 * An order checkout also has a "Link" tab: the hosted page's URL to copy,
 * share or scan (QR on wide screens), for someone else to pay — a company,
 * a friend — or to pay on another device. The checkout poll keeps running
 * while the sheet is up, so a payment made through the link elsewhere flips
 * this screen to its success state like any other.
 */
export function NativeCheckout({
  checkout,
  paymentLink,
  onAttemptFailed,
}: {
  checkout: Checkout
  /** the hosted page — always offered as the fallback */
  paymentLink: string | null
  /** a decline or a provider failure, with a stable reason ("declined", "provider_error") */
  onAttemptFailed?: (reason: string, provider: CheckoutMethod["provider"]) => void
}) {
  const { t } = useT()
  const methods = checkout.methods
  // the link to hand on: an order's hosted page (a top-up is the buyer's own
  // wallet, nobody else's to pay)
  const shareable = checkout.kind === "order_batch" ? (paymentLink ?? checkout.hosted?.url ?? null) : null
  const [picked, setPicked] = useState<Tab | null>(null)
  // the checkout re-reads every 2s; a method that vanished (a provider
  // outage) must not leave the sheet on an empty tab, so the pick is only
  // honoured while it is on offer
  const active: Tab | null =
    picked === LINK_TAB && shareable
      ? LINK_TAB
      : picked !== null && methods.some((m) => m.provider === picked)
        ? picked
        : (methods[0]?.provider ?? null)
  const method = methods.find((m) => m.provider === active) ?? null
  const sandbox = checkout.env === "sandbox"
  const tabs: Tab[] = [...methods.map((m) => m.provider), ...(shareable ? [LINK_TAB] : [])]

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <div className="flex items-baseline justify-between px-1 text-white">
        <span className="text-[15px] font-semibold text-white/80">{t("payment.amountDue")}</span>
        <span className="text-[26px] font-extrabold">
          {formatCents(checkout.amount.due, checkout.amount.currency)}
        </span>
      </div>

      {tabs.length > 1 && (
        <div className="grid auto-cols-fr grid-flow-col gap-2" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tab === active}
              onClick={() => setPicked(tab)}
              className={cn(
                "rounded-2xl border-2 px-2 py-2.5 text-[15px] font-extrabold text-white transition",
                tab === active
                  ? "border-white bg-white/20"
                  : "border-transparent bg-white/10"
              )}
            >
              {t(METHOD_LABEL[tab])}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-[20px] bg-white p-4">
        {method?.provider === "stripe" && (
          <StripePane
            key={method.client_secret}
            checkoutId={checkout.id}
            method={method}
            amount={formatCents(checkout.amount.due, checkout.amount.currency)}
            onFailed={(reason) => onAttemptFailed?.(reason, "stripe")}
          />
        )}
        {method?.provider === "paypal" && (
          <PayPalPane
            key={method.order_id}
            checkoutId={checkout.id}
            method={method}
            onFailed={(reason) => onAttemptFailed?.(reason, "paypal")}
          />
        )}
        {method?.provider === "monobank" && (
          <MonobankPane
            checkoutId={checkout.id}
            method={method}
            onFailed={(reason) => onAttemptFailed?.(reason, "monobank")}
          />
        )}
        {active === LINK_TAB && shareable && (
          <LinkPane
            url={shareable}
            expiresAt={checkout.expires_at}
            amount={formatCents(checkout.amount.due, checkout.amount.currency)}
          />
        )}
        {!method && active !== LINK_TAB && (
          <div className="flex items-center justify-center py-6">
            <Spinner className="size-8 text-brand" />
          </div>
        )}
      </div>

      {sandbox && active && active !== LINK_TAB && (
        <SandboxSimulate checkoutId={checkout.id} provider={active} />
      )}

      {paymentLink && (
        <a
          href={paymentLink}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 py-1 text-[13px] font-semibold text-white/80 underline-offset-2 hover:underline"
        >
          <ExternalLink className="size-3.5" />
          {t("payment.hosted.open")}
        </a>
      )}
    </div>
  )
}

const LINK_TAB = "link" as const
type Tab = CheckoutMethod["provider"] | typeof LINK_TAB

const METHOD_LABEL: Record<Tab, MessageKey> = {
  stripe: "payment.method.card",
  paypal: "payment.method.paypal",
  monobank: "payment.method.monobank",
  link: "payment.method.link",
}

/* ------------------------------------------------------------------ link */

/**
 * The hosted page's URL, to be paid somewhere else: copy, the system share
 * sheet where the browser has one (phones), and a QR code on wide screens —
 * a laptop's sheet scanned by the phone in your hand. Nothing here waits for
 * the payment: the sheet's checkout poll does.
 */
function LinkPane({
  url,
  expiresAt,
  amount,
}: {
  url: string
  expiresAt: number | null
  amount: string
}) {
  const { t } = useT()
  const field = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // no clipboard (an insecure context, a denied permission): the text
      // is selected so a long-press or Ctrl+C copies it
      field.current?.select()
      setCopyFailed(true)
    }
  }

  const share = async () => {
    try {
      await navigator.share({
        title: t("payment.link.shareTitle"),
        text: t("payment.link.shareText", { amount }),
        url,
      })
    } catch {
      // dismissed, or the share target failed: nothing to report
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[15px] font-extrabold text-navy">{t("payment.link.title")}</p>
        <p className="mt-1 text-[13px] font-medium text-navy-soft">{t("payment.link.body")}</p>
      </div>

      <div className="flex gap-2">
        <input
          ref={field}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("payment.link.title")}
          className="min-w-0 flex-1 rounded-xl border border-navy/15 bg-navy/5 px-3 py-2.5 text-[13px] font-semibold text-navy outline-none focus:border-brand"
        />
        <Button variant="outline" size="lg" className="shrink-0 gap-1.5" onClick={() => void copy()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("payment.link.copied") : t("payment.link.copy")}
        </Button>
      </div>
      {copyFailed && (
        <p className="text-[12px] font-semibold text-navy-soft">{t("payment.link.copyFailed")}</p>
      )}

      {canShare && (
        <Button variant="brand" size="xl" className="w-full gap-2" onClick={() => void share()}>
          <Share2 className="size-5" />
          {t("payment.link.share")}
        </Button>
      )}

      <LinkQr url={url} />

      {expiresAt ? (
        <p className="text-center text-[12px] font-medium text-navy-soft">
          {t("payment.link.validUntil", { date: formatDotDateTime(expiresAt) })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The link as a QR code, wide screens only (on a phone the share sheet is
 * the way). The encoder is loaded when the code is first shown, so the
 * checkout pays nothing for it until then.
 */
function LinkQr({ url }: { url: string }) {
  const { t } = useT()
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import("uqr")
      .then(({ renderSVG }) => {
        if (!cancelled) setSvg(renderSVG(url, { ecc: "M", border: 1 }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [url])

  if (!svg) return null
  return (
    <div className="hidden flex-col items-center gap-1.5 pt-1 sm:flex">
      <div
        role="img"
        aria-label={t("payment.link.qr")}
        className="size-40 [&_svg]:size-full"
        // our own encoder's SVG of our own URL
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-[12px] font-medium text-navy-soft">{t("payment.link.qr")}</p>
    </div>
  )
}

/* ---------------------------------------------------------------- stripe */

// One Stripe.js instance per publishable key: the key is the account that
// owns the intent (it may differ between a fresh and a resumed checkout
// after an account switch), so it is part of the cache key, never a global.
const stripeInstances = new Map<string, Promise<Stripe | null>>()
const stripeFor = (publishableKey: string) => {
  let instance = stripeInstances.get(publishableKey)
  if (!instance) {
    instance = loadStripe(publishableKey)
    stripeInstances.set(publishableKey, instance)
  }
  return instance
}

function StripePane({
  checkoutId,
  method,
  amount,
  onFailed,
}: {
  checkoutId: string
  method: StripeCheckoutMethod
  amount: string
  onFailed: (reason: string) => void
}) {
  const { t } = useT()
  const stripePromise = useMemo(
    () => (method.publishable_key ? stripeFor(method.publishable_key) : null),
    [method.publishable_key]
  )
  // The customer session secret is short-lived and the checkout is re-read
  // every 2s with a fresh one; the Elements instance is keyed on the intent
  // (the pane's `key`), so the first session secret it saw is the one it
  // keeps — remounting the element on every poll would wipe what was typed.
  const [customerSession] = useState(method.customer_session_client_secret)

  if (!stripePromise) {
    return (
      <Alert variant="destructive" className="border-0">
        <TriangleAlert className="size-5" />
        <AlertDescription>{t("payment.providerFailed", { provider: "Stripe" })}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: method.client_secret,
        ...(customerSession ? { customerSessionClientSecret: customerSession } : {}),
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#2f6cff",
            colorText: "#0f1c3f",
            borderRadius: "12px",
            fontFamily: "Montserrat Variable, Geist Variable, system-ui, sans-serif",
          },
        },
      }}
    >
      <StripeForm checkoutId={checkoutId} method={method} amount={amount} onFailed={onFailed} />
    </Elements>
  )
}

function StripeForm({
  checkoutId,
  method,
  amount,
  onFailed,
}: {
  checkoutId: string
  method: StripeCheckoutMethod
  amount: string
  onFailed: (reason: string) => void
}) {
  const { t } = useT()
  const stripe = useStripe()
  const elements = useElements()
  const sync = useSyncCheckout()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pay = async () => {
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)
    try {
      const submitted = await elements.submit()
      if (submitted.error) {
        setError(submitted.error.message ?? t("payment.declined"))
        return
      }
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // only reached by a method that must leave the page (none today:
          // order intents are card-only, and 3-D Secure runs in an overlay);
          // the server's own return_url applies when the client sent one
          return_url: method.return_url ?? window.location.href,
        },
        redirect: "if_required",
      })
      if (result.error) {
        // card_error / validation_error carry Stripe's own localized text
        setError(result.error.message ?? t("payment.declined"))
        onFailed(result.error.type === "card_error" ? "declined" : "provider_error")
        return
      }
      // succeeded (or processing): tell the server now rather than waiting
      // for its next poll, so the success screen follows within a second
      await sync.mutateAsync({ id: checkoutId, provider: "stripe" }).catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <PaymentElement
        onReady={() => setReady(true)}
        options={{
          layout: "tabs",
          wallets: { applePay: "auto", googlePay: "auto" },
        }}
      />
      {!ready && (
        <div className="flex items-center justify-center py-4">
          <Spinner className="size-7 text-brand" />
        </div>
      )}
      {error && (
        <Alert variant="destructive" className="border-0">
          <TriangleAlert className="size-5" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        variant="mint"
        size="xl"
        className="w-full disabled:opacity-60"
        disabled={!ready || busy || !stripe}
        onClick={() => void pay()}
      >
        {busy ? <Spinner className="size-5" /> : t("payment.payAmount", { amount })}
      </Button>
      <p className="text-center text-[12px] font-medium text-navy-soft">{t("payment.cardNote")}</p>
    </div>
  )
}

/* ---------------------------------------------------------------- paypal */

function PayPalPane({
  checkoutId,
  method,
  onFailed,
}: {
  checkoutId: string
  method: PayPalCheckoutMethod
  onFailed: (reason: string) => void
}) {
  const { t } = useT()
  const container = useRef<HTMLDivElement>(null)
  const capture = usePayPalCapture()
  // "loading" until the SDK rendered its buttons; the pane is keyed on the
  // PayPal order, so a new order starts over from here
  const [state, setState] = useState<"loading" | "ready" | "capturing" | "failed">("loading")
  const [error, setError] = useState<string | null>(null)
  // the latest callbacks and copy, read by the buttons the SDK rendered once
  const latest = useRef({ capture, onFailed, t })
  useEffect(() => {
    latest.current = { capture, onFailed, t }
  })

  useEffect(() => {
    let cancelled = false
    let buttons: { close: () => Promise<void> } | null = null
    const copy = (key: "payment.providerFailed") => latest.current.t(key, { provider: "PayPal" })

    // a simulated sandbox method has no order and no SDK: the simulate
    // panel below the pane is the whole flow
    if (method.simulated || !method.client_id || !method.order_id) {
      setState("ready")
      return
    }
    const orderId = method.order_id

    loadScript({
      clientId: method.client_id,
      currency: "EUR",
      intent: "capture",
      components: "buttons",
    })
      .then((paypal: PayPalNamespace | null) => {
        if (cancelled || !paypal?.Buttons || !container.current) return
        container.current.replaceChildren()
        const rendered = paypal.Buttons({
          style: { layout: "vertical", shape: "pill", label: "pay" },
          // the server minted the PayPal order with the checkout; the
          // buttons only approve it
          createOrder: () => Promise.resolve(orderId),
          onApprove: async () => {
            setState("capturing")
            try {
              await latest.current.capture.mutateAsync(checkoutId)
            } catch (e) {
              setError(apiErrorMessage(e, copy("payment.providerFailed")))
              setState("failed")
              latest.current.onFailed("declined")
            }
          },
          onError: () => {
            setError(copy("payment.providerFailed"))
            setState("failed")
            latest.current.onFailed("provider_error")
          },
          onCancel: () => setState("ready"),
        })
        buttons = rendered
        return rendered.render(container.current).then(() => {
          if (!cancelled) setState("ready")
        })
      })
      .catch(() => {
        if (cancelled) return
        setError(copy("payment.providerFailed"))
        setState("failed")
      })

    return () => {
      cancelled = true
      void buttons?.close().catch(() => undefined)
    }
    // the buttons are bound to one PayPal order; a new order remounts the pane
  }, [checkoutId, method.client_id, method.order_id, method.simulated])

  return (
    <div className="space-y-3">
      {method.simulated && (
        <p className="text-center text-[12px] font-medium text-navy-soft">
          {t("payment.sandbox.title")}
        </p>
      )}
      {(state === "loading" || state === "capturing") && (
        <div className="flex items-center justify-center gap-2 py-3 text-[14px] font-semibold text-navy-soft">
          <Spinner className="size-5 text-brand" />
          {state === "capturing" ? t("payment.confirming") : t("payment.loading")}
        </div>
      )}
      <div ref={container} className={cn(state === "capturing" && "pointer-events-none opacity-50")} />
      {error && (
        <Alert variant="destructive" className="border-0">
          <TriangleAlert className="size-5" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- monobank */

function MonobankPane({
  checkoutId,
  method,
  onFailed,
}: {
  checkoutId: string
  method: MonobankCheckoutMethod
  onFailed: (reason: string) => void
}) {
  const { t } = useT()
  const create = useCreateMonobankInvoice()
  const sync = useSyncCheckout()
  const config = useCheckoutConfig()
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only a host the client's allowlist names may be a return_url; anything
  // else is refused before the invoice is minted. Without it the buyer
  // returns to the hosted page, and this screen still sees the payment.
  const returnUrl = useMemo(() => {
    const hosts = config.data?.return_url.hosts ?? []
    return hosts.includes(window.location.host)
      ? `${window.location.origin}${window.location.pathname}`
      : undefined
  }, [config.data])

  const open = async () => {
    setError(null)
    // the invoice is opened from the click itself, so the new tab survives
    // popup blockers: reserve the tab first, then point it at the invoice
    const tab = window.open("", "_blank")
    try {
      const invoice = await create.mutateAsync({ id: checkoutId, returnUrl })
      const target = invoice.app_url && isMobile() ? invoice.app_url : invoice.page_url
      if (tab) tab.location.href = target
      else window.open(target, "_blank")
      setOpened(true)
    } catch (e) {
      tab?.close()
      setError(apiErrorMessage(e, t("payment.providerFailed", { provider: "monobank" })))
      onFailed("provider_error")
    }
  }

  return (
    <div className="space-y-3">
      {!opened ? (
        <Button
          variant="brand"
          size="xl"
          className="w-full disabled:opacity-60"
          disabled={create.isPending}
          onClick={() => void open()}
        >
          {create.isPending ? <Spinner className="size-5" /> : t("payment.monobank.open")}
        </Button>
      ) : (
        <>
          <p className="flex items-center gap-2 text-[14px] font-semibold text-navy-soft">
            <Spinner className="size-4 text-brand" />
            {t("payment.monobank.opened")}
          </p>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={sync.isPending}
            onClick={() => void sync.mutateAsync({ id: checkoutId, provider: "monobank" })}
          >
            {t("payment.monobank.check")}
          </Button>
        </>
      )}
      {method.simulated && (
        <p className="text-center text-[12px] font-medium text-navy-soft">
          {t("payment.sandbox.title")}
        </p>
      )}
      {error && (
        <Alert variant="destructive" className="border-0">
          <TriangleAlert className="size-5" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

/* --------------------------------------------------------------- sandbox */

function SandboxSimulate({
  checkoutId,
  provider,
}: {
  checkoutId: string
  provider: CheckoutMethod["provider"]
}) {
  const { t } = useT()
  const simulate = useSimulateCheckout()
  const [error, setError] = useState<string | null>(null)
  const run = async (outcome: "success" | "failure") => {
    setError(null)
    try {
      await simulate.mutateAsync({ id: checkoutId, provider, outcome })
    } catch (e) {
      setError(apiErrorMessage(e))
    }
  }
  return (
    <div className="rounded-2xl border border-dashed border-white/40 p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-white/80 uppercase">
        <FlaskConical className="size-3.5" />
        {t("payment.sandbox.title")}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          variant="glass"
          size="sm"
          disabled={simulate.isPending}
          onClick={() => void run("success")}
        >
          {t("payment.sandbox.success")}
        </Button>
        <Button
          variant="glass"
          size="sm"
          disabled={simulate.isPending}
          onClick={() => void run("failure")}
        >
          {t("payment.sandbox.failure")}
        </Button>
      </div>
      {error && <p className="mt-2 text-[12px] font-semibold text-sun">{error}</p>}
    </div>
  )
}
