import { useEffect, useState } from "react"
import {
  Car,
  TriangleAlert,
  ShieldCheck,
  Info,
  ExternalLink,
  Pencil,
  FileText,
  Undo2,
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { PlateBadge } from "@/components/order/PlateBadge"
import { FlagRect } from "@/lib/countries"
import { COUNTRY_NAMES, PLATE_COUNTRIES, Flag } from "@/lib/countries"
import { formatDotDateTime, formatEndDate, periodLabel } from "@/lib/format"
import { apiBlob, ApiRequestError } from "@/lib/api"
import { isValidVin } from "@/lib/vehicle"
import { useOrdersStore } from "@/stores/orders"
import { useAuthStore } from "@/stores/auth"
import { useCatalogStore } from "@/stores/catalog"
import { cn } from "@/lib/utils"
import type { Order } from "@/types/api"

interface StatusTheme {
  wrapper: string
  banner: string | null
  bannerClass: string
  dot: string
}

function statusTheme(order: Order): StatusTheme {
  switch (order.status) {
    // CREATED = unpaid, awaiting the payment webhook — a failed/abandoned
    // payment never changes it, so don't dress it up as "processing"
    case "CREATED":
      return {
        wrapper: "bg-[#d7dee6]",
        banner: "Awaiting payment!\nThe payment was not completed for this order",
        bannerClass: "text-navy",
        dot: "bg-slate-400",
      }
    case "PENDING":
      return {
        wrapper: "bg-sun",
        banner: "Processing (~15m)!\nDon't drive without active vignette to avoid fines",
        bannerClass: "text-[#4a3200]",
        dot: "bg-amber-400",
      }
    case "ACTIVE":
      return {
        wrapper: "bg-mint",
        banner: null,
        bannerClass: "",
        dot: "bg-emerald-400",
      }
    case "WILL BE ACTIVE":
    case "DEFERRED":
      return {
        wrapper: "bg-brand-soft",
        banner: "Scheduled — activates on the start date",
        bannerClass: "text-navy",
        dot: "bg-brand",
      }
    case "REFUNDED":
      return {
        wrapper: "bg-[#d7dee6]",
        banner: "Refunded",
        bannerClass: "text-navy",
        dot: "bg-slate-400",
      }
    default:
      return {
        wrapper: "bg-[#d7dee6]",
        banner: order.status === "EXPIRED" ? "Expired" : null,
        bannerClass: "text-navy",
        dot: "bg-slate-400",
      }
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message
  return e instanceof Error ? e.message : "Something went wrong"
}

// Mirrors api/controllers/public-me.js#MODIFY_ERROR_MESSAGES — the `modify`
// block only carries a reason_code on read, so the copy has to live here too.
const MODIFY_REASON_MESSAGES: Record<string, string> = {
  order_status: "Only pending, active, deferred or approved orders can be modified.",
  already_modified:
    "Vignette data can only be changed once. This order has already been modified.",
  no_flex: "This order doesn't have the flexible option, so its data can't be changed.",
  window_passed: "The window for changing this vignette has closed.",
}

export function OrderCard({
  order,
  onPay,
}: {
  order: Order
  /** open the payment modal for this unpaid order (Home provides the drawer) */
  onPay?: (order: Order) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [dialog, setDialog] = useState<"modify" | "transfer" | "refund" | null>(null)
  const guest = useAuthStore((s) => s.user?.guest ?? true)

  // unpaid — expanding the card offers just the Complete payment button
  // instead of the transfer/modify/pdf section
  const awaitingPayment = order.status === "CREATED"
  const canPay = awaitingPayment && Boolean(order.payment_link) && onPay

  const theme = statusTheme(order)
  const car = order.cars[0]
  const countryName =
    COUNTRY_NAMES[order.country?.toLowerCase()] || order.country?.toUpperCase()

  const refundAction = order.full_refund?.eligible
    ? order.full_refund
    : order.partial_refund?.eligible
      ? order.partial_refund
      : null

  const downloadPass = async () => {
    try {
      const blob = await apiBlob("/public/me/apple-pass")
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "vignette-id.pkpass"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-[24px]", theme.wrapper)}>
      {theme.banner &&
        <p
          className={cn(
            "px-3 py-1 text-[12px] leading-3 font-bold whitespace-pre-line",
            theme.bannerClass
          )}
        >
          <TriangleAlert className="mr-1 -mt-0.5 inline size-3" />
          {theme.banner.split("\n")[0]}
          <TriangleAlert className="ml-1 -mt-0.5 inline size-3" />
          {theme.banner.includes("\n") && (
            <>
              <br />
              {theme.banner.split("\n")[1]}
            </>
          )}
        </p>}

      {/* white inner card — tap to expand actions (payment button lives there too) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="block w-full rounded-[22px] bg-white p-4 text-left"
      >
        <OrderSummary order={order} theme={theme} />
      </button>

      {/* expandable actions */}
      {expanded && (
        <div className="px-3 pt-3 pb-1">
          {awaitingPayment ? (
            canPay && (
              <button
                type="button"
                onClick={() => onPay?.(order)}
                className="block w-full rounded-2xl bg-mint py-3 text-center text-[15px] font-extrabold tracking-[0.2em] text-white uppercase transition active:scale-[0.98]"
              >
                Complete payment
              </button>
            )
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <ActionChip
                  label="Transfer Vignette"
                  icon={<ExternalLink className="size-3.5" />}
                  onClick={() => setDialog("transfer")}
                  disabled={guest}
                />
                <ActionChip
                  label="Modify Vignette Data"
                  icon={<Pencil className="size-3.5" />}
                  onClick={() => setDialog("modify")}
                  disabled={guest}
                />
                {refundAction && !guest && (
                  <ActionChip
                    label={`Refund${refundAction.percent ? ` ${refundAction.percent}%` : ""}`}
                    icon={<Undo2 className="size-3.5" />}
                    onClick={() => setDialog("refund")}
                  />
                )}
              </div>

              <p className="mt-3 mb-2 text-[15px] font-semibold text-navy/90">
                E-vignette Unique Identificator
              </p>
              <div className="flex flex-wrap gap-2">
                {order.receipt && (
                  <ActionChip
                    label="RECEIPT"
                    icon={<FileText className="size-4 rounded bg-white p-0.5 text-navy" />}
                    href={order.receipt}
                  />
                )}
                {car?.pdf && (
                  <ActionChip
                    label="E-VIGNETTE"
                    icon={<FileText className="size-4 rounded bg-white p-0.5 text-navy" />}
                    href={car.pdf}
                  />
                )}
                {!guest && (
                  <ActionChip
                    label="ADD TO"
                    trailing={
                      <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-extrabold text-navy">
                        WALLET
                      </span>
                    }
                    onClick={downloadPass}
                  />
                )}
              </div>
              {guest && (
                <p className="mt-2 text-xs font-semibold text-navy/70">
                  Sign in on the Account tab to transfer, modify or add to Wallet.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* footer strip */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <FlagRect code={order.country} className="h-5 w-7 shrink-0 rounded" />
          <span className="truncate text-xs font-extrabold whitespace-nowrap text-navy uppercase">
            Vignette of {countryName}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-white" fill="#2fc78d" />
          <span className="flex flex-col items-center rounded-md bg-white px-1.5 py-0.5 leading-none">
            <span className="text-[13px] font-extrabold text-pink">
              {String(periodLabel(order.period)).split(" ")[0]}
            </span>
            <span className="text-[8px] font-bold tracking-wider text-pink uppercase">
              {String(periodLabel(order.period)).split(" ")[1] ?? "days"}
            </span>
          </span>
          <button
            type="button"
            aria-label="Details"
            onClick={() => setExpanded((v) => !v)}
            className="text-navy/70"
          >
            <Info className="size-6" />
          </button>
        </span>
      </div>

      <ModifyDialog order={order} open={dialog === "modify"} onClose={() => setDialog(null)} />
      <TransferDialog order={order} open={dialog === "transfer"} onClose={() => setDialog(null)} />
      <RefundDialog
        order={order}
        open={dialog === "refund"}
        onClose={() => setDialog(null)}
        amount={refundAction?.amount_eur}
        percent={refundAction?.percent}
      />
    </div>
  )
}

/** plate + vehicle icon + validity dates — the body of the white card */
function OrderSummary({ order, theme }: { order: Order; theme: StatusTheme }) {
  const car = order.cars[0]
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <PlateBadge plate={car?.plate || "—"} country={car?.country || null} size="lg" />
        </div>
        <div className="relative shrink-0">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft/60">
            <Car className="size-8 text-[#5c7fd6]" strokeWidth={1.6} />
          </span>
          <span
            className={cn(
              "absolute top-0 right-0 size-4 rounded-full ring-2 ring-white",
              theme.dot
            )}
          />
          {order.vehicle_type && (
            <span className="absolute -right-1 -bottom-1 rounded-md bg-brand-tint px-1.5 py-0.5 text-[10px] font-bold text-white">
              {order.vehicle_type}
            </span>
          )}
        </div>
      </div>
      <p className="mt-3 text-[15px] font-semibold tracking-wide">
        <span className="text-navy-soft">FROM </span>
        <span className="font-bold text-navy">{formatDotDateTime(order.start_date)}</span>
        <span className="text-navy-soft"> until </span>
        <span className="font-bold text-mint-deep">{formatEndDate(order.end_date)}</span>
      </p>
    </>
  )
}

function ActionChip({
  label,
  icon,
  trailing,
  onClick,
  href,
  disabled,
}: {
  label: string
  icon?: React.ReactNode
  trailing?: React.ReactNode
  onClick?: () => void
  href?: string
  disabled?: boolean
}) {
  const className = cn(
    "flex items-center gap-2 rounded-full bg-[#3a3f47] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95",
    disabled && "opacity-45"
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label} {icon} {trailing}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {label} {icon} {trailing}
    </button>
  )
}

/* ------------------------------------------------------------- dialogs */

function ModifyDialog({
  order,
  open,
  onClose,
}: {
  order: Order
  open: boolean
  onClose: () => void
}) {
  const modify = useOrdersStore((s) => s.modify)
  const catalogProducts = useCatalogStore((s) => s.products)
  const loadCatalog = useCatalogStore((s) => s.load)
  const car = order.cars[0]
  const [plate, setPlate] = useState(car?.plate ?? "")
  const [country, setCountry] = useState(car?.country ?? "ua")
  const [vin, setVin] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  // the order card doesn't otherwise touch the catalog — load it here so the
  // per-period vin_code_required restriction below has something to read
  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const periodPrice = catalogProducts.find((p) => p.name === order.product)?.price[
    String(order.period)
  ]
  const vinRequired = periodPrice?.restrictions?.includes("vin_code_required") ?? false
  const vinOk = !vinRequired || isValidVin(vin)

  const ineligible = order.modify?.eligible === false
  const reasonMessage = ineligible
    ? (order.modify?.reason_code && MODIFY_REASON_MESSAGES[order.modify.reason_code]) ||
      "This vignette can no longer be modified."
    : null

  const submit = async () => {
    setBusy(true)
    try {
      await modify(order.id, {
        vehicle: {
          plate: plate.trim().toUpperCase(),
          country,
          ...(vin.trim() ? { vin_code: vin.trim().toUpperCase() } : {}),
        },
      })
      toast.success("Order successfully modified")
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose()
          setConfirmed(false)
        }
      }}
    >
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Change vignette data</DialogTitle>
          <DialogDescription>
            The car plate can be changed before the vignette activates.
          </DialogDescription>
        </DialogHeader>
        {reasonMessage && (
          <p className="rounded-xl border border-pink px-3 py-2.5 text-sm font-semibold text-pink">
            {reasonMessage}
          </p>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`plate-${order.id}`}>Registration plate</Label>
            <Input
              id={`plate-${order.id}`}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              className="uppercase"
              disabled={ineligible}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`country-${order.id}`}>Plate country</Label>
            <div className="flex items-center gap-2">
              <Flag code={country} className="h-5 w-7 rounded" />
              <select
                id={`country-${order.id}`}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={ineligible}
                className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
              >
                {PLATE_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {COUNTRY_NAMES[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {vinRequired && (
            <div className="space-y-1.5">
              <Label htmlFor={`vin-${order.id}`}>VIN code</Label>
              <Input
                id={`vin-${order.id}`}
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder="9 or 17-character VIN"
                className="uppercase"
                disabled={ineligible}
                aria-invalid={!vinOk}
              />
              {!vinOk && (
                <p className="text-xs font-semibold text-pink">
                  This product requires a VIN code (9 or 17 characters).
                </p>
              )}
            </div>
          )}
          {!ineligible && (
            <label className="flex items-start gap-2 text-xs font-medium text-navy-soft">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                className="mt-0.5"
              />
              I confirm that the changes were made correctly and I am
              responsible for their accuracy.
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || ineligible || !confirmed || !plate.trim() || !vinOk}
          >
            {busy && <Spinner />} Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferDialog({
  order,
  open,
  onClose,
}: {
  order: Order
  open: boolean
  onClose: () => void
}) {
  const transfer = useOrdersStore((s) => s.transfer)
  const [email, setEmail] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await transfer(order.id, email.trim())
      toast.success("Order successfully transferred")
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose()
          setConfirmed(false)
        }
      }}
    >
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Transfer vignette</DialogTitle>
          <DialogDescription>
            You can transfer your vignette to another account only once. The
            recipient must already be registered with this email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`transfer-${order.id}`}>Recipient email</Label>
            <Input
              id={`transfer-${order.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <label className="flex items-start gap-2 text-xs font-medium text-navy-soft">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            I confirm that the changes were made correctly and I am
            responsible for their accuracy.
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !confirmed || !email.includes("@")}>
            {busy && <Spinner />} Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RefundDialog({
  order,
  open,
  onClose,
  amount,
  percent,
}: {
  order: Order
  open: boolean
  onClose: () => void
  amount?: number
  percent?: number
}) {
  const refund = useOrdersStore((s) => s.refund)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const result = await refund(order.id)
      toast.success(`Refunded ${result.amount_eur} € (${result.percent}%)`)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Refund this vignette?</DialogTitle>
          <DialogDescription>
            {percent === 100
              ? `You'll get a full refund${amount ? ` of ${amount} €` : ""}.`
              : `A partial refund of ${percent ?? 50}%${amount ? ` (${amount} €)` : ""} is available.`}{" "}
            The vignette stops being valid immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep vignette
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy && <Spinner />} Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
