import { useState } from "react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { PlateBadge } from "@/components/order/PlateBadge"
import { FlagRect } from "@/lib/countries"
import { COUNTRY_NAMES, PLATE_COUNTRIES, Flag } from "@/lib/countries"
import { formatDotDateTime, formatEndDate, periodLabel } from "@/lib/format"
import { apiBlob, apiErrorMessage } from "@/lib/api"
import { isValidVin } from "@/lib/vehicle"
import { useAuthStore } from "@/stores/auth"
import { EMPTY_CATALOG, useCatalog } from "@/queries/catalog"
import { useModifyOrder, useRefundOrder, useTransferOrder } from "@/queries/orders"
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
  const [periodCount, periodUnit] = String(periodLabel(order.period)).split(" ")

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
      toast.error(apiErrorMessage(e))
    }
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} asChild>
      <Card className={cn("gap-0 rounded-[24px] py-0 ring-0", theme.wrapper)}>
        {theme.banner && (
          <Alert
            className={cn(
              "items-center rounded-none border-0 bg-transparent px-3 py-1 [&>svg]:size-3 [&>svg]:translate-y-0",
              theme.bannerClass
            )}
          >
            <TriangleAlert className="text-current" />
            <AlertDescription
              className={cn(
                "text-[12px] leading-3 font-bold whitespace-pre-line",
                theme.bannerClass
              )}
            >
              {theme.banner}
            </AlertDescription>
          </Alert>
        )}

        {/* white inner card — tap to expand actions (payment button lives there too) */}
        <CollapsibleTrigger className="block w-full rounded-[22px] bg-white p-4 text-left">
          <OrderSummary order={order} theme={theme} />
        </CollapsibleTrigger>

        {/* expandable actions */}
        <CollapsibleContent className="px-3 pt-3 pb-1">
          {awaitingPayment ? (
            canPay && (
              <Button
                variant="mint"
                size="xl"
                className="h-12 w-full text-[15px] tracking-[0.2em]"
                onClick={() => onPay?.(order)}
              >
                Complete payment
              </Button>
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
                      <Badge className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-extrabold text-navy">
                        WALLET
                      </Badge>
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
        </CollapsibleContent>

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
            <Badge className="h-auto flex-col gap-0 rounded-md bg-white px-1.5 py-0.5 leading-none hover:bg-white">
              <span className="text-[13px] font-extrabold text-pink">{periodCount}</span>
              <span className="text-[8px] font-bold tracking-wider text-pink uppercase">
                {periodUnit ?? "days"}
              </span>
            </Badge>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Details"
                className="text-navy/70 hover:bg-white/40 hover:text-navy"
              >
                <Info className="size-6" />
              </Button>
            </CollapsibleTrigger>
          </span>
        </div>

        <ModifyDialog order={order} open={dialog === "modify"} onClose={() => setDialog(null)} />
        <TransferDialog
          order={order}
          open={dialog === "transfer"}
          onClose={() => setDialog(null)}
        />
        <RefundDialog
          order={order}
          open={dialog === "refund"}
          onClose={() => setDialog(null)}
          amount={refundAction?.amount_eur}
          percent={refundAction?.percent}
        />
      </Card>
    </Collapsible>
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
            <Badge className="absolute -right-1 -bottom-1 rounded-md bg-brand-tint px-1.5 py-0.5 text-[10px] font-bold text-white">
              {order.vehicle_type}
            </Badge>
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
  if (href) {
    return (
      <Button asChild variant="chip" size="chip">
        <a href={href} target="_blank" rel="noreferrer">
          {label} {icon} {trailing}
        </a>
      </Button>
    )
  }
  return (
    <Button
      variant="chip"
      size="chip"
      onClick={onClick}
      disabled={disabled}
      className={cn(disabled && "opacity-45")}
    >
      {label} {icon} {trailing}
    </Button>
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
  const modify = useModifyOrder()
  // the order card doesn't otherwise touch the catalog — it's needed here for
  // the per-period vin_code_required restriction
  const catalogProducts = (useCatalog().data ?? EMPTY_CATALOG).products
  const car = order.cars[0]
  const [plate, setPlate] = useState(car?.plate ?? "")
  const [country, setCountry] = useState(car?.country ?? "ua")
  const [vin, setVin] = useState("")
  const [confirmed, setConfirmed] = useState(false)

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
    try {
      await modify.mutateAsync({
        id: order.id,
        body: {
          vehicle: {
            plate: plate.trim().toUpperCase(),
            country,
            ...(vin.trim() ? { vin_code: vin.trim().toUpperCase() } : {}),
          },
        },
      })
      toast.success("Order successfully modified")
      onClose()
    } catch (e) {
      toast.error(apiErrorMessage(e))
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
          <Alert variant="destructive" className="border-pink text-pink">
            <TriangleAlert />
            <AlertDescription className="font-semibold text-pink">
              {reasonMessage}
            </AlertDescription>
          </Alert>
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
            <Select value={country} onValueChange={setCountry} disabled={ineligible}>
              <SelectTrigger id={`country-${order.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATE_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c} className="[&_span_svg]:size-full">
                    <Flag code={c} className="h-3.5 w-5 rounded-[2px]" />
                    {COUNTRY_NAMES[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label className="flex items-start gap-2 text-xs font-medium text-navy-soft">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                className="mt-0.5"
              />
              <span>
                I confirm that the changes were made correctly and I am responsible
                for their accuracy.
              </span>
            </Label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={modify.isPending || ineligible || !confirmed || !plate.trim() || !vinOk}
          >
            {modify.isPending && <Spinner />} Save changes
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
  const transfer = useTransferOrder()
  const [email, setEmail] = useState("")
  const [confirmed, setConfirmed] = useState(false)

  const submit = async () => {
    try {
      await transfer.mutateAsync({ id: order.id, targetEmail: email.trim() })
      toast.success("Order successfully transferred")
      onClose()
    } catch (e) {
      toast.error(apiErrorMessage(e))
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
          <Label className="flex items-start gap-2 text-xs font-medium text-navy-soft">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span>
              I confirm that the changes were made correctly and I am responsible
              for their accuracy.
            </span>
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={transfer.isPending || !confirmed || !email.includes("@")}
          >
            {transfer.isPending && <Spinner />} Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Irreversible → an AlertDialog (no outside-click dismiss) with a destructive action. */
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
  const refund = useRefundOrder()

  const submit = async () => {
    try {
      const result = await refund.mutateAsync(order.id)
      toast.success(`Refunded ${result.amount_eur} € (${result.percent}%)`)
      onClose()
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Refund this vignette?</AlertDialogTitle>
          <AlertDialogDescription>
            {percent === 100
              ? `You'll get a full refund${amount ? ` of ${amount} €` : ""}.`
              : `A partial refund of ${percent ?? 50}%${amount ? ` (${amount} €)` : ""} is available.`}{" "}
            The vignette stops being valid immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={refund.isPending}>Keep vignette</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              disabled={refund.isPending}
              onClick={(e) => {
                // stay open until the request settles (Radix closes on click otherwise)
                e.preventDefault()
                void submit()
              }}
            >
              {refund.isPending && <Spinner />} Refund
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
