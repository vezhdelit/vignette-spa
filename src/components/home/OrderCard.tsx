import { useState } from "react"
import {
  Car,
  TriangleAlert,
  ShieldCheck,
  Info,
  ExternalLink,
  Pencil,
  FileText,
  Ticket,
  Undo2,
} from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
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
import { VehicleLookupRow } from "@/components/order/VehicleLookup"
import { FlagRect } from "@/lib/countries"
import { countryLabel, PLATE_COUNTRIES, Flag } from "@/lib/countries"
import {
  formatDotDateTime,
  formatEndDate,
  formatPrice,
  periodParts,
} from "@/lib/format"
import { useT, type MessageKey } from "@/i18n"
import { apiBlob, apiErrorMessage } from "@/lib/api"
import { plateErrorText, plateHintText } from "@/lib/plate-rules"
import { isValidVin } from "@/lib/vehicle"
import { useAuthStore } from "@/stores/auth"
import { EMPTY_CATALOG, useCatalog } from "@/queries/catalog"
import { useModifyOrder, useRefundOrder, useTransferOrder } from "@/queries/orders"
import { usePlateRules, usePlateValidator } from "@/queries/vehicles"
import { cn } from "@/lib/utils"
import type { Order } from "@/types/api"

interface StatusTheme {
  wrapper: string
  /** a message key — the card resolves it, so the theme stays data */
  banner: MessageKey | null
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
        banner: "orderCard.banner.created",
        bannerClass: "text-navy",
        dot: "bg-slate-400",
      }
    case "PENDING":
      return {
        wrapper: "bg-sun",
        banner: "orderCard.banner.pending",
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
        banner: "orderCard.banner.scheduled",
        bannerClass: "text-navy",
        dot: "bg-brand",
      }
    case "REFUNDED":
      return {
        wrapper: "bg-[#d7dee6]",
        banner: "orderCard.banner.refunded",
        bannerClass: "text-navy",
        dot: "bg-slate-400",
      }
    default:
      return {
        wrapper: "bg-[#d7dee6]",
        banner: order.status === "EXPIRED" ? "orderCard.banner.expired" : null,
        bannerClass: "text-navy",
        dot: "bg-slate-400",
      }
  }
}

// Mirrors api/controllers/public-me.js#MODIFY_ERROR_MESSAGES — the `modify`
// block only carries a reason_code on read, never a sentence, so the copy
// lives (and is translated) here.
const MODIFY_REASON_KEYS: Record<string, MessageKey> = {
  order_status: "modify.reason.order_status",
  already_modified: "modify.reason.already_modified",
  no_flex: "modify.reason.no_flex",
  window_passed: "modify.reason.window_passed",
}

export function OrderCard({
  order,
  onPay,
}: {
  order: Order
  /** open the payment modal for this unpaid order (Home provides the drawer) */
  onPay?: (order: Order) => void
}) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const [drawer, setDrawer] = useState<"modify" | "transfer" | "refund" | null>(null)
  const guest = useAuthStore((s) => s.user?.guest ?? true)

  // unpaid — expanding the card offers just the Complete payment button
  // instead of the transfer/modify/pdf section
  const awaitingPayment = order.status === "CREATED"
  const canPay = awaitingPayment && Boolean(order.payment_link) && onPay

  const theme = statusTheme(order)
  const car = order.cars[0]
  const countryName = countryLabel(order.country)
  const period = periodParts(order.period)

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
              {t(theme.banner)}
            </AlertDescription>
          </Alert>
        )}

        {/* white inner card — tap to expand actions (payment button lives there too) */}
        <CollapsibleTrigger className="block w-full rounded-[22px] bg-white p-4 text-left">
          <OrderSummary order={order} theme={theme} />
        </CollapsibleTrigger>

        {/* expandable actions */}
        <CollapsibleContent className="px-3 pt-3 pb-1">
          {/* the promo this order carries, if any — reserved while the order
              is unpaid, so it shows on a CREATED order too */}
          {order.promo && <OrderPromoNote promo={order.promo} />}

          {awaitingPayment ? (
            canPay && (
              <Button
                variant="mint"
                size="xl"
                className="h-12 w-full text-[15px] tracking-[0.2em]"
                onClick={() => onPay?.(order)}
              >
                {t("orderCard.completePayment")}
              </Button>
            )
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <ActionChip
                  label={t("orderCard.transfer")}
                  icon={<ExternalLink className="size-3.5" />}
                  onClick={() => setDrawer("transfer")}
                  disabled={guest}
                />
                <ActionChip
                  label={t("orderCard.modify")}
                  icon={<Pencil className="size-3.5" />}
                  onClick={() => setDrawer("modify")}
                  disabled={guest}
                />
                {refundAction && !guest && (
                  <ActionChip
                    label={
                      refundAction.percent
                        ? t("orderCard.refundPercent", { percent: refundAction.percent })
                        : t("orderCard.refund")
                    }
                    icon={<Undo2 className="size-3.5" />}
                    onClick={() => setDrawer("refund")}
                  />
                )}
              </div>

              <p className="mt-3 mb-2 text-[15px] font-semibold text-navy/90">
                {t("orderCard.uniqueId")}
              </p>
              <div className="flex flex-wrap gap-2">
                {order.receipt && (
                  <ActionChip
                    label={t("orderCard.receipt").toLocaleUpperCase()}
                    icon={<FileText className="size-4 rounded bg-white p-0.5 text-navy" />}
                    href={order.receipt}
                  />
                )}
                {car?.pdf && (
                  <ActionChip
                    label={t("orderCard.evignette").toLocaleUpperCase()}
                    icon={<FileText className="size-4 rounded bg-white p-0.5 text-navy" />}
                    href={car.pdf}
                  />
                )}
                {!guest && (
                  <ActionChip
                    label={t("orderCard.addTo").toLocaleUpperCase()}
                    trailing={
                      <Badge className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-extrabold text-navy">
                        {t("orderCard.wallet").toLocaleUpperCase()}
                      </Badge>
                    }
                    onClick={downloadPass}
                  />
                )}
              </div>
              {guest && (
                <p className="mt-2 text-xs font-semibold text-navy/70">
                  {t("orderCard.guestNote")}
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
              {t("orderCard.vignetteOf", { country: countryName })}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-6 text-white" fill="#2fc78d" />
            <Badge className="h-auto flex-col gap-0 rounded-md bg-white px-1.5 py-0.5 leading-none hover:bg-white">
              <span className="text-[13px] font-extrabold text-pink">{period.count}</span>
              <span className="text-[8px] font-bold tracking-wider text-pink uppercase">
                {period.unit}
              </span>
            </Badge>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("orderCard.detailsLabel")}
                className="text-navy/70 hover:bg-white/40 hover:text-navy"
              >
                <Info className="size-6" />
              </Button>
            </CollapsibleTrigger>
          </span>
        </div>

        <ModifyDrawer order={order} open={drawer === "modify"} onClose={() => setDrawer(null)} />
        <TransferDrawer
          order={order}
          open={drawer === "transfer"}
          onClose={() => setDrawer(null)}
        />
        <RefundDrawer
          order={order}
          open={drawer === "refund"}
          onClose={() => setDrawer(null)}
          amount={refundAction?.amount_eur}
          percent={refundAction?.percent}
        />
      </Card>
    </Collapsible>
  )
}

/** plate + vehicle icon + validity dates — the body of the white card */
function OrderSummary({ order, theme }: { order: Order; theme: StatusTheme }) {
  const { t } = useT()
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
        <span className="text-navy-soft uppercase">{t("orderCard.from")} </span>
        <span className="font-bold text-navy">{formatDotDateTime(order.start_date)}</span>
        <span className="text-navy-soft"> {t("orderCard.until")} </span>
        <span className="font-bold text-mint-deep">{formatEndDate(order.end_date)}</span>
      </p>
    </>
  )
}

/**
 * The promo on an order (`promo` on every order read). Amounts are EUR — the
 * order settled in EUR whatever the app is displaying. Cashback is credited
 * to the wallet's bonuses once the order is paid, and clawed back if it is
 * refunded in full, so its status is worth showing rather than just its size.
 */
const CASHBACK_STATUS_KEYS: Record<string, MessageKey> = {
  pending: "orderCard.promo.cashbackPending",
  granted: "orderCard.promo.cashbackGranted",
  reversed: "orderCard.promo.cashbackReversed",
}

function OrderPromoNote({ promo }: { promo: NonNullable<Order["promo"]> }) {
  const { t } = useT()
  const cashbackKey = promo.cashback_status
    ? CASHBACK_STATUS_KEYS[promo.cashback_status]
    : undefined
  return (
    <div className="mb-3 flex items-center gap-2.5 rounded-2xl bg-white/70 px-3 py-2.5">
      <Ticket className="size-5 shrink-0 text-mint-deep" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[14px] font-extrabold text-navy">
          {promo.code ?? promo.name ?? t("orderCard.promoFallback")}
        </span>
        {(promo.effect_summary || promo.name) && (
          <span className="block truncate text-xs font-semibold text-navy-soft">
            {promo.effect_summary || promo.name}
          </span>
        )}
        {promo.cashback_eur > 0 && cashbackKey && (
          <span className="block truncate text-xs font-semibold text-navy-soft">
            {formatPrice(promo.cashback_eur, "EUR")} {t(cashbackKey)}
          </span>
        )}
      </span>
      {promo.discount_eur > 0 && (
        <span className="shrink-0 text-[14px] font-extrabold whitespace-nowrap text-mint-deep">
          −{formatPrice(promo.discount_eur, "EUR")}
        </span>
      )}
    </div>
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

/* ------------------------------------------------------------- drawers */

// Bottom sheet for the per-order actions: light surface, app-wide corner
// radius, capped so the keyboard never pushes the footer off screen.
const ACTION_DRAWER_CLASS =
  "border-0 data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]"

function ModifyDrawer({
  order,
  open,
  onClose,
}: {
  order: Order
  open: boolean
  onClose: () => void
}) {
  const { t } = useT()
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

  // the new plate under that country's format rules, checked locally from the
  // rules manifest — the modify endpoint re-validates it anyway, this just
  // catches it before the round trip
  const plateRules = usePlateRules().data
  const checkPlateLocally = usePlateValidator()
  const plateVerdict = checkPlateLocally(plate, country)
  const plateProblem =
    plateRules &&
    plateVerdict &&
    !plateVerdict.valid &&
    plate.trim().length >= plateRules.normalize.min_length
      ? plateErrorText(plateRules, plateVerdict, countryLabel(country))
      : null
  const plateHint =
    plateProblem && plateRules ? plateHintText(plateRules, country, plateVerdict) : null

  const ineligible = order.modify?.eligible === false
  const reasonKey = ineligible
    ? (order.modify?.reason_code && MODIFY_REASON_KEYS[order.modify.reason_code]) ||
      "modify.ineligible"
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
      toast.success(t("modify.success"))
      onClose()
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose()
          setConfirmed(false)
        }
      }}
    >
      <DrawerContent className={ACTION_DRAWER_CLASS}>
        <DrawerHeader>
          <DrawerTitle>{t("modify.title")}</DrawerTitle>
          <DrawerDescription>{t("modify.description")}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 overflow-y-auto px-4">
          {reasonKey && (
            <Alert variant="destructive" className="border-pink text-pink">
              <TriangleAlert />
              <AlertDescription className="font-semibold text-pink">
                {t(reasonKey)}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`plate-${order.id}`}>{t("modify.plate")}</Label>
            <Input
              id={`plate-${order.id}`}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              className="uppercase"
              disabled={ineligible}
              aria-invalid={Boolean(plateProblem)}
            />
            {plateProblem && (
              <p className="text-xs font-semibold text-pink">{plateProblem}</p>
            )}
            {plateHint && (
              <p className="text-xs font-medium text-navy-soft">{plateHint}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`country-${order.id}`}>{t("modify.plateCountry")}</Label>
            <Select value={country} onValueChange={setCountry} disabled={ineligible}>
              <SelectTrigger id={`country-${order.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATE_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c} className="[&_span_svg]:size-full">
                    <Flag code={c} className="h-3.5 w-5 rounded-[2px]" />
                    {countryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* the registries that answer can fill the VIN in from the plate */}
          {!ineligible && vinRequired && (
            <VehicleLookupRow
              plate={plate}
              country={country}
              ready={!plateProblem}
              onVehicle={(vehicle) => {
                if (vehicle.vin_code) setVin(vehicle.vin_code)
              }}
            />
          )}
          {vinRequired && (
            <div className="space-y-1.5">
              <Label htmlFor={`vin-${order.id}`}>{t("modify.vin")}</Label>
              <Input
                id={`vin-${order.id}`}
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder={t("modify.vinPlaceholder")}
                className="uppercase"
                disabled={ineligible}
                aria-invalid={!vinOk}
              />
              {!vinOk && (
                <p className="text-xs font-semibold text-pink">
                  {t("modify.vinRequired")}
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
              <span>{t("modify.confirm")}</span>
            </Label>
          )}
        </div>
        <DrawerFooter>
          <Button
            size="lg"
            onClick={submit}
            disabled={
              modify.isPending ||
              ineligible ||
              !confirmed ||
              !plate.trim() ||
              !vinOk ||
              Boolean(plateProblem)
            }
          >
            {modify.isPending && <Spinner />} {t("modify.save")}
          </Button>
          <Button variant="outline" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function TransferDrawer({
  order,
  open,
  onClose,
}: {
  order: Order
  open: boolean
  onClose: () => void
}) {
  const { t } = useT()
  const transfer = useTransferOrder()
  const [email, setEmail] = useState("")
  const [confirmed, setConfirmed] = useState(false)

  const submit = async () => {
    try {
      await transfer.mutateAsync({ id: order.id, targetEmail: email.trim() })
      toast.success(t("transfer.success"))
      onClose()
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose()
          setConfirmed(false)
        }
      }}
    >
      <DrawerContent className={ACTION_DRAWER_CLASS}>
        <DrawerHeader>
          <DrawerTitle>{t("transfer.title")}</DrawerTitle>
          <DrawerDescription>{t("transfer.description")}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 overflow-y-auto px-4">
          <div className="space-y-1.5">
            <Label htmlFor={`transfer-${order.id}`}>{t("transfer.recipientEmail")}</Label>
            <Input
              id={`transfer-${order.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("transfer.emailPlaceholder")}
            />
          </div>
          <Label className="flex items-start gap-2 text-xs font-medium text-navy-soft">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <span>{t("modify.confirm")}</span>
          </Label>
        </div>
        <DrawerFooter>
          <Button
            size="lg"
            onClick={submit}
            disabled={transfer.isPending || !confirmed || !email.includes("@")}
          >
            {transfer.isPending && <Spinner />} {t("transfer.action")}
          </Button>
          <Button variant="outline" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * Irreversible → a non-dismissible drawer (no drag/outside-click close, only
 * the two buttons) with a destructive action.
 */
function RefundDrawer({
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
  const { t } = useT()
  const refund = useRefundOrder()

  const submit = async () => {
    try {
      const result = await refund.mutateAsync(order.id)
      toast.success(
        t("refund.success", {
          amount: formatPrice(result.amount_eur, "EUR"),
          percent: result.percent,
        })
      )
      onClose()
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()} dismissible={false}>
      <DrawerContent className={ACTION_DRAWER_CLASS}>
        <DrawerHeader>
          <DrawerTitle>{t("refund.title")}</DrawerTitle>
          <DrawerDescription>
            {percent === 100
              ? amount
                ? t("refund.fullAmount", { amount: formatPrice(amount, "EUR") })
                : t("refund.full")
              : amount
                ? t("refund.partialAmount", {
                    percent: percent ?? 50,
                    amount: formatPrice(amount, "EUR"),
                  })
                : t("refund.partial", { percent: percent ?? 50 })}{" "}
            {t("refund.stopsNote")}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button
            variant="destructive"
            size="lg"
            disabled={refund.isPending}
            onClick={() => void submit()}
          >
            {refund.isPending && <Spinner />} {t("refund.action")}
          </Button>
          <Button variant="outline" size="lg" disabled={refund.isPending} onClick={onClose}>
            {t("refund.keep")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
