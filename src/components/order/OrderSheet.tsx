import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Check,
  ChevronDown,
  CircleQuestionMark,
  Pencil,
  CalendarDays,
} from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { track } from "@/lib/insights"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DoneScreen, PaymentModal } from "@/components/order/PaymentDrawer"
import { PromoCodeInput } from "@/components/order/PromoCodeInput"
import { VehicleLookupRow } from "@/components/order/VehicleLookup"
import { notePurchaseCompleted } from "@/stores/rating"
import { productBadge, tileColor } from "@/components/vignettes/ProductCard"
import {
  countryLabel,
  countryOptions,
  Flag,
  FlagCircle,
  FlagRect,
  PLATE_COUNTRIES,
} from "@/lib/countries"
import {
  addDays,
  dayStart,
  formatDate,
  formatDayMonth,
  formatPrice,
  periodLabel,
} from "@/lib/format"
import { useT, type MessageKey } from "@/i18n"
import { ApiRequestError, apiErrorMessage } from "@/lib/api"
import { plateErrorText, plateHintText } from "@/lib/plate-rules"
import { isValidVin } from "@/lib/vehicle"
import { getInstallationId } from "@/lib/webpush"
import { useAuthStore } from "@/stores/auth"
import { useSettingsStore } from "@/stores/settings"
import {
  catalogKeys,
  defaultFlexType,
  EMPTY_CATALOG,
  useCatalog,
  type Catalog,
} from "@/queries/catalog"
import { useMe } from "@/queries/me"
import { useVehicles } from "@/queries/account"
import {
  useCreateOrder,
  useInvalidateOrders,
  usePaymentStatus,
} from "@/queries/orders"
import {
  isPromoError,
  useAutoPromo,
  validatePromo,
  type PromoValidateInput,
} from "@/queries/promos"
import {
  firstInvalid,
  usePlateRules,
  usePlateValidator,
  useValidateVehicles,
} from "@/queries/vehicles"
import { cn } from "@/lib/utils"
import type { CatalogProduct, PromoValidateResult } from "@/types/api"

/** The API sends restriction keys, not labels — same set as the product card. */
const RESTRICTION_KEYS: Record<string, MessageKey> = {
  height: "product.restriction.height",
  weight: "product.restriction.weight",
  seats: "product.restriction.seats",
  width: "product.restriction.width",
  direction: "product.restriction.direction",
}

// "paying" covers the success screen too: it shows once the polled order
// leaves CREATED (see `paid` below), no extra state transition needed
type Step = "order" | "confirm" | "creating" | "paying"

interface OrderSheetProps {
  product: CatalogProduct | null
  open: boolean
  onClose: () => void
  /** confirm-step "add other e-vignettes" chip tapped */
  onSwitchCountry?: (country: string) => void
}

const toDate = (unixSeconds: number) => new Date(unixSeconds * 1000)
const dayStartOf = (date: Date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

/** the light form field look used across the sheet's white cards */
const FIELD =
  "h-auto w-full rounded-xl border-0 bg-[#f1f4f8] px-3.5 py-3 text-[15px] font-semibold text-navy shadow-none placeholder:text-navy-soft md:text-[15px]"

export function OrderSheet({ product, open, onClose, onSwitchCountry }: OrderSheetProps) {
  const navigate = useNavigate()
  const { t } = useT()
  const queryClient = useQueryClient()
  const isGuest = useAuthStore((s) => s.user?.guest ?? true)
  const { data: me } = useMe()
  // saved plates for one-tap fill — guest ok: a guest gets the plates from
  // the orders this session placed earlier (GET /me/vehicles)
  const savedVehicles = useVehicles().data ?? []
  const currency = useSettingsStore((s) => s.currency)
  const { flexOptions, countries } = useCatalog().data ?? EMPTY_CATALOG
  // The EUR twin of the catalog (the same query while EUR is selected): the
  // charge is always settled in EUR, so a non-EUR display also states what
  // the card will really be charged.
  const eurCatalog = useCatalog("EUR").data ?? EMPTY_CATALOG
  const createOrder = useCreateOrder()
  const invalidateOrders = useInvalidateOrders()
  // the plate rules as data (GET /public/vehicles/plate-rules) — the form
  // validates locally and only asks the server at the step boundary
  const plateRules = usePlateRules().data
  const checkPlateLocally = usePlateValidator()
  const validateVehicles = useValidateVehicles()

  const [step, setStep] = useState<Step>("order")
  const [plate, setPlate] = useState("")
  const [plateCountry, setPlateCountry] = useState("ua")
  const [vin, setVin] = useState("")
  const [vinOpen, setVinOpen] = useState(false)
  const [period, setPeriod] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<number>(dayStart(0))
  const [dateOpen, setDateOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [flexEnabled, setFlexEnabled] = useState(true)
  const [flexType, setFlexType] = useState<"default" | "expanded">("default")
  const [terms, setTerms] = useState(true)
  // field names per services/partner-order.js#validatePartnerDriverInfo
  const [driver, setDriver] = useState({
    user_name: "",
    passport_number: "",
    passport_country: "ua",
  })
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  // the server's own verdict on the plate (POST /public/vehicles/validate),
  // asked once when leaving step 1 — distinct from the local rules check
  const [plateError, setPlateError] = useState<string | null>(null)
  // the "why" the server sent with that verdict (row.hint) — the local
  // manifest builds the same text, but the server's copy is the authority
  // when the two disagree
  const [plateErrorHint, setPlateErrorHint] = useState<string | null>(null)
  // promo: `promoCode` is what is typed, `appliedCode` what is being priced
  // (an effect below re-prices it whenever the order changes underneath it)
  const [promoCode, setPromoCode] = useState("")
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [promo, setPromo] = useState<PromoValidateResult | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoChecking, setPromoChecking] = useState(false)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  // Per opened sheet, not per render: how many plates this buyer tried
  // before one was accepted.
  const plateAttempts = useRef(0)
  // just the id — POST returns a slim stub; the poll fetches the full order
  const [createdOrder, setCreatedOrder] = useState<{ id: string } | null>(null)

  // popularity order (matches the app), skipping periods flagged "disabled"
  const periods = useMemo(() => {
    if (!product) return []
    const PREFERRED = ["30", "10", "1", "7", "15", "60", "90", "365"]
    return Object.keys(product.price)
      .filter((p) => !product.price[p].restrictions?.includes("disabled"))
      .sort((a, b) => {
        const ia = PREFERRED.indexOf(a)
        const ib = PREFERRED.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return Number(a) - Number(b)
      })
  }, [product])

  // reset per product/open
  useEffect(() => {
    if (open && product) {
      track(
        "product.viewed",
        { product: product.name, country: product.country ?? null },
        { product: product.name },
      )
      track(
        "checkout.started",
        { product: product.name, vehicles: 1 },
        { product: product.name },
      )
      setStep("order")
      setPeriod(periods[0] ?? null)
      setStartDate(dayStart(0))
      setPaymentLink(null)
      setCreatedOrder(null)
      setDuplicateWarning(null)
      setPlateError(null)
      setPromoCode("")
      setAppliedCode(null)
      setPromo(null)
      setPromoError(null)
      setFlexEnabled(true)
      // read, not subscribed: a catalog refetch mid-order must not reset the form
      setFlexType(
        defaultFlexType(
          queryClient.getQueryData<Catalog>(
            catalogKeys.currency(useSettingsStore.getState().currency)
          ) ?? EMPTY_CATALOG
        )
      )
      setTerms(true)
    }
  }, [open, product, periods, queryClient])

  // a "from-tomorrow" period can't start today — bump the date forward
  useEffect(() => {
    const restrictions =
      product && period ? product.price[period]?.restrictions : undefined
    if (restrictions?.includes("from-tomorrow") && startDate < dayStart(1)) {
      setStartDate(dayStart(1))
    }
  }, [product, period, startDate])

  useEffect(() => {
    if (me?.email) setEmail(me.email)
  }, [me?.email])

  // watch the created order while the user pays in the in-sheet iframe —
  // polled every 4s until it leaves CREATED, which swaps in the success screen
  const { paid } = usePaymentStatus(createdOrder?.id ?? null, step === "paying")

  /**
   * The order a promo is priced against — the same `cars` / `products` shapes
   * the purchase sends (a TODAY order included: midnight is already in the
   * past by then and the pipeline answers `invalid_start_date`), so what
   * validate quotes is what the payment link will charge. Memoised, so the
   * identity — and with it the cached preview and the re-pricing below —
   * only changes when the order does; the email joins in only once it's
   * plausible, so typing it can't re-price per keystroke.
   */
  const promoInput: PromoValidateInput | null = useMemo(() => {
    if (!product || !period) return null
    const typedPlate = plate.trim()
    const typedEmail = email.trim()
    return {
      code: null,
      cars:
        typedPlate.length >= 3 ? [{ plate: typedPlate, country: plateCountry }] : [],
      products: [
        {
          name: product.name,
          period,
          start_date:
            startDate === dayStart(0) ? Math.floor(Date.now() / 1000) : startDate,
          flex: { type: flexType, enabled: flexEnabled },
        },
      ],
      ...(/.+@.+\..+/.test(typedEmail) ? { email: typedEmail } : {}),
    }
  }, [product, period, plate, plateCountry, startDate, flexType, flexEnabled, email])

  // What the server would apply on its own (no code). Only asked on the
  // confirm step, and cached per order shape — the endpoint is rate-limited.
  const autoPromoQuery = useAutoPromo(promoInput, {
    enabled: step === "confirm" && !appliedCode,
  })
  const autoPromo = autoPromoQuery.data?.valid ? autoPromoQuery.data : null

  /**
   * Prices the applied code against the order as it stands. Runs on apply and
   * again whenever the order changes underneath it (period, date, flex,
   * plate): a code that no longer applies is dropped here rather than
   * failing at checkout, with the server's own message.
   */
  useEffect(() => {
    if (!appliedCode || !promoInput) {
      setPromo(null)
      return
    }
    let cancelled = false
    setPromoChecking(true)
    validatePromo({ ...promoInput, code: appliedCode })
      .then((result) => {
        if (cancelled) return
        if (result.valid) {
          setPromo(result)
          setPromoError(null)
        } else {
          setPromo(null)
          setAppliedCode(null)
          setPromoError(t("promo.notApplicable"))
        }
      })
      .catch((error) => {
        if (cancelled) return
        setPromo(null)
        setAppliedCode(null)
        setPromoError(apiErrorMessage(error, t("promo.checkFailed")))
      })
      .finally(() => {
        if (!cancelled) setPromoChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [appliedCode, promoInput])

  const selectedPrice = product && period ? product.price[period] : null
  const vinRequired =
    selectedPrice?.restrictions?.includes("vin_code_required") ?? false

  // The field is hidden entirely when the selected period doesn't need a
  // VIN — clear any leftover value from a previously-selected period so it
  // can't silently ride along in the submit body.
  useEffect(() => {
    if (!vinRequired) {
      setVin("")
      setVinOpen(false)
    }
  }, [vinRequired])

  if (!product) return null

  const driverInfoRequired =
    selectedPrice?.restrictions?.includes("driver_info_required") ?? false
  // period only sellable starting tomorrow (services/product.js#checkProducts)
  const fromTomorrowOnly =
    selectedPrice?.restrictions?.includes("from-tomorrow") ?? false
  const flexOption =
    flexOptions.find((f) => f.type === flexType) ??
    flexOptions.find((f) => f.is_default)
  // products and flex arrive in the same display currency (queries/catalog.ts)
  const flexPrice = flexOption?.price ?? (flexType === "expanded" ? 5.98 : 2.99)
  const fmt = (amount: number) => formatPrice(amount, currency)
  const servicePrice = selectedPrice
    ? Math.round((selectedPrice.total_price - selectedPrice.government_price) * 100) / 100
    : 0
  const total = selectedPrice
    ? Math.round((selectedPrice.total_price + (flexEnabled ? flexPrice : 0)) * 100) / 100
    : 0
  // what the payment provider actually takes — orders are always settled in
  // EUR; null while EUR is the display currency or the EUR catalog is missing
  const eurPrice = period
    ? eurCatalog.products.find((p) => p.name === product.name)?.price[period]
    : undefined
  const eurFlexPrice =
    eurCatalog.flexOptions.find((f) => f.type === flexOption?.type)?.price ?? 0
  const eurTotal =
    currency !== "EUR" && eurPrice
      ? Math.round((eurPrice.total_price + (flexEnabled ? eurFlexPrice : 0)) * 100) / 100
      : null
  const endDate = period ? addDays(startDate, Number(period)) - 60 : startDate
  const isToday = startDate === dayStart(0)
  const isTomorrow = startDate === dayStart(1)
  const emailValid = /.+@.+\..+/.test(email)

  // The plate under this country's own format rules, run locally from the
  // manifest — same verdict, type and message as the server (lib/plate-rules
  // .ts). Null while the manifest hasn't loaded: then there is no local
  // opinion and the server has the only say.
  const plateVerdict = checkPlateLocally(plate, plateCountry)
  const localPlateError =
    plateRules &&
    plateVerdict &&
    !plateVerdict.valid &&
    plate.trim().length >= plateRules.normalize.min_length
      ? plateErrorText(plateRules, plateVerdict, countryLabel(plateCountry))
      : null
  // what right looks like for this country — shown under either error
  const plateHint = plateRules ? plateHintText(plateRules, plateCountry, plateVerdict) : null
  // the typed code once it priced, else the campaign the server would apply
  const activePromo = promo ?? autoPromo

  // plates must be ≥3 chars with a country (helpers/vehicle.js#checkCars) and
  // pass that country's format rules; the server re-validates either way
  const canProceed =
    plate.trim().length >= 3 &&
    plateVerdict?.valid !== false &&
    period !== null &&
    emailValid &&
    (!vinRequired || isValidVin(vin)) &&
    (!driverInfoRequired ||
      Boolean(
        driver.user_name.trim() &&
          driver.passport_number.trim() &&
          driver.passport_country
      ))

  // "Moldovan vignette is not required for a Moldovan vehicle plate"
  const mdOnMd = product.country === "md" && plateCountry === "md"

  const applyPromo = () => {
    const code = promoCode.trim().toUpperCase()
    if (!code) return
    setPromoError(null)
    // the effect above prices it and reports back
    setAppliedCode(code)
  }

  const removePromo = () => {
    setAppliedCode(null)
    setPromo(null)
    setPromoError(null)
    setPromoCode("")
  }

  /**
   * Leaving step 1: let the server have the final say on the plate
   * (POST /public/vehicles/validate) and adopt the normalized plate it echoes
   * — that is the form the order will store. The check failing (offline, 5xx)
   * must not trap the user: the local rules already passed and order creation
   * validates again anyway.
   */
  const goToConfirm = async () => {
    setPlateError(null)
    try {
      const result = await validateVehicles.mutateAsync([
        { plate: plate.trim(), country: plateCountry },
      ])
      const invalid = firstInvalid(result)
      if (invalid) {
        setPlateError(invalid.error?.message ?? t("plate.rejected"))
        setPlateErrorHint(invalid.hint ?? null)
        // The count is what makes this readable: one rejection is a typo,
        // four in a row is a country whose rules we have wrong.
        plateAttempts.current += 1
        track("checkout.plate_rejected", {
          country: plateCountry,
          reason: invalid.error?.type ?? "invalid_plate",
          attempts: plateAttempts.current,
        })
        return
      }
      const normalized = result.vehicles[0]?.plate
      if (normalized && normalized !== plate) setPlate(normalized)
    } catch {
      /* the plate check itself is unavailable — don't block the purchase */
    }
    setStep("confirm")
  }

  const submit = async (options: { allowDuplication?: boolean } = {}) => {
    if (!terms) {
      toast.error(t("order.acceptTerms"))
      return
    }
    setDuplicateWarning(null)
    setStep("creating")
    try {
      const installationId = getInstallationId()
      const result = await createOrder.mutateAsync({
        allowDuplication: options.allowDuplication,
        body: {
          terms_and_privacy_accepted: true,
          // ties this browser's web push registration (if any — see
          // AccountPage's Push notifications section) to the order's status
          // alerts, even when it registered signed-out
          ...(installationId ? { installation_id: installationId } : {}),
          cars: [
            {
              plate: plate.trim().toUpperCase().replace(/\s+/g, ""),
              country: plateCountry,
              ...(vin.trim() ? { vin_code: vin.trim().toUpperCase() } : {}),
            },
          ],
          products: [
            {
              name: product.name,
              period: period!,
              start_date: isToday ? Math.floor(Date.now() / 1000) : startDate,
              flex: { type: flexType, enabled: flexEnabled },
              // mandatory for unpaid orders (/me pins order_has_been_paid:
              // false) and must be globally unique per partner — fresh UUID
              // per attempt (services/partner-order.js#validatePartnerCustomIds)
              custom_id: crypto.randomUUID(),
            },
          ],
          // the code the user applied; without one the server still picks the
          // best auto campaign for this order by itself
          ...(appliedCode ? { promo_code: appliedCode } : {}),
          ...(isGuest ? { email: email.trim() } : {}),
          ...(driverInfoRequired
            ? {
                user: {
                  user_name: driver.user_name.trim(),
                  passport_number: driver.passport_number.trim(),
                  passport_country: driver.passport_country,
                  ...(isGuest ? { email: email.trim() } : {}),
                },
              }
            : {}),
        },
      })
      setCreatedOrder(result.orders[0] ?? null)
      const created = result.orders[0] ?? null
      track(
        "order.created",
        { product: product.name, amount_eur: eurTotal ?? total },
        { product: product.name, ...(created?.id ? { order_id: created.id } : {}) },
      )
      track(
        "checkout.payment_opened",
        { amount_eur: eurTotal ?? total },
        { product: product.name, ...(created?.id ? { order_id: created.id } : {}) },
      )
      // shown in an in-sheet iframe (the pay page ships
      // `frame-ancestors *` exactly for this embedded-webview use)
      setPaymentLink(result.payment_link)
      setStep("paying")
    } catch (e) {
      if (
        e instanceof ApiRequestError &&
        ["pending_orders", "active_orders", "approved_orders"].includes(e.type) &&
        !options.allowDuplication
      ) {
        // the plate already has an overlapping order — let the user decide
        setDuplicateWarning(e.message)
      } else if (isPromoError(e)) {
        // the code stopped applying between validate and checkout (limit
        // reached, expired, budget gone) — drop it and let them pay without
        setAppliedCode(null)
        setPromo(null)
        setPromoError(e.message)
        toast.error(e.message)
      } else {
        const message =
          e instanceof ApiRequestError ? e.message : t("order.createFailed")
        toast.error(message)
      }
      setStep("confirm")
    }
  }

  // called both after a successful payment and when the checkout is
  // abandoned — only the former is a purchase the rating sheet may follow
  const finish = () => {
    void invalidateOrders()
    onClose()
    navigate("/")
    if (paid) notePurchaseCompleted()
  }

  const closeGuard = (next: boolean) => {
    if (!next) {
      if (step === "creating") return // don't dismiss mid-request
      if (step === "paying") {
        finish()
        return
      }
      onClose()
    }
  }

  return (
    <Drawer open={open} onOpenChange={closeGuard}>
      <DrawerContent className="border-0 !bg-brand data-[vaul-drawer-direction=bottom]:max-h-[94dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        <DrawerTitle className="sr-only">
          {t("order.title", {
            product: product.title,
            country: countryLabel(product.country),
          })}
        </DrawerTitle>

        {step === "creating" && <CreatingScreen />}
        {step === "paying" && !paid && (
          <PaymentModal paymentLink={paymentLink} onClose={finish} />
        )}
        {step === "paying" && paid && <DoneScreen onFinish={finish} />}

        {(step === "order" || step === "confirm") && (
          // plain block scroller — a flex column would give overflow-x rows an
          // automatic min-height of 0 and collapse them when content overflows
          // the sheet (period chips / flag row vanish)
          <div className="mx-auto w-full max-w-md min-h-0 overflow-y-auto px-4 pt-2 pb-4">
            <StepIndicator step={step} />

            {step === "order" ? (
              <>
                <ProductSummary product={product} />

                {/* plate + vin */}
                <Card className="mt-3 rounded-[24px] ring-0">
                  <CardContent className="flex items-center gap-2.5">
                    <Select
                      value={plateCountry}
                      onValueChange={(next) => {
                        setPlateCountry(next)
                        setPlateError(null)
                      }}
                    >
                      <SelectTrigger
                        aria-label={t("order.plateCountry")}
                        // the trigger base pins un-sized inner svgs to 16px — let the flag fill its box
                        className="h-auto shrink-0 gap-1.5 rounded-xl border-0 bg-[#f1f4f8] px-2.5 py-3 shadow-none [&>svg]:size-5 [&>svg]:text-navy-soft [&_span_svg]:size-full"
                      >
                        <Flag code={plateCountry} className="h-6 w-9 rounded-md" />
                      </SelectTrigger>
                      {/* popper, not item-aligned: Radix's item-aligned mode positions
                          off the <SelectValue> node, and this trigger renders a bare flag
                          instead — without it the list is never placed and lands below
                          the fold. */}
                      <SelectContent position="popper" align="start">
                        {PLATE_COUNTRIES.map((c) => (
                          <SelectItem key={c} value={c} className="[&_span_svg]:size-full">
                            <Flag code={c} className="h-3.5 w-5 rounded-[2px]" />
                            {countryLabel(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex-1 overflow-hidden rounded-xl">
                      <div className="flex items-stretch bg-[#ECEFF3]">
                        <span className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 bg-[#173A7A] py-3">
                          <Flag code={plateCountry} className="h-4 w-6 rounded-[2px]" />
                          <span className="text-[10px] leading-none font-bold text-white">
                            {plateCountry.toUpperCase()}
                          </span>
                        </span>
                        <Input
                          value={plate}
                          onChange={(e) => {
                            setPlate(e.target.value.toUpperCase())
                            // the server's verdict was about the old plate
                            setPlateError(null)
                          }}
                          placeholder={t("order.platePlaceholder").toLocaleUpperCase()}
                          aria-label={t("order.plateLabel")}
                          className="h-auto min-h-14 min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 text-center text-[26px] font-extrabold tracking-[0.2em] text-navy uppercase shadow-none placeholder:text-[13px] placeholder:font-semibold placeholder:tracking-widest placeholder:text-navy-soft focus-visible:ring-0 md:text-[26px]"
                        />
                      </div>
                      {vinRequired &&
                        (vinOpen ? (
                          <Input
                            autoFocus
                            value={vin}
                            onChange={(e) => setVin(e.target.value.toUpperCase())}
                            onBlur={() => !vin && setVinOpen(false)}
                            placeholder={t("order.vinPlaceholder").toLocaleUpperCase()}
                            aria-label={t("order.vinLabel")}
                            className="h-auto w-full rounded-none border-0 bg-brand px-3 py-2 text-center text-sm font-bold tracking-[0.15em] text-white uppercase shadow-none placeholder:text-white/70 focus-visible:ring-0 md:text-sm"
                          />
                        ) : (
                          <Button
                            variant="brand"
                            onClick={() => setVinOpen(true)}
                            className="h-auto w-full rounded-none py-2 text-sm font-semibold active:scale-100"
                          >
                            {vin || t("order.vinPrompt")}
                          </Button>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                {/* what this country's format rules say, or what the server
                    said when leaving this step */}
                {(plateError || localPlateError) && (
                  <div className="mt-2 px-1 leading-snug">
                    <p className="text-[13px] font-semibold text-sun">
                      {plateError || localPlateError}
                    </p>
                    {(plateError ? plateErrorHint ?? plateHint : plateHint) && (
                      <p className="mt-0.5 text-xs font-semibold text-white/80">
                        {plateError ? plateErrorHint ?? plateHint : plateHint}
                      </p>
                    )}
                  </div>
                )}

                {/* plate → vehicle (VIN, make, model) where a registry answers */}
                <VehicleLookupRow
                  plate={plate}
                  country={plateCountry}
                  ready={plateVerdict?.valid !== false}
                  tone="dark"
                  className="mt-2"
                  onVehicle={(vehicle) => {
                    if (vehicle.vin_code) {
                      setVin(vehicle.vin_code)
                      setVinOpen(true)
                    }
                  }}
                />

                {/* saved plates — the account's cars, or a guest's own earlier orders */}
                {savedVehicles.length > 0 && (
                  <ScrollArea className="-mx-4 mt-2">
                    <div className="flex w-max gap-2 px-4 pb-1">
                      {savedVehicles.slice(0, 8).map((v) => {
                        const selected =
                          v.plate === plate.replace(/\s+/g, "") && v.country === plateCountry
                        return (
                          <Button
                            key={String(v.id)}
                            type="button"
                            variant="chip"
                            size="chip"
                            aria-pressed={selected}
                            onClick={() => {
                              setPlate(v.plate)
                              setPlateCountry(v.country)
                              setPlateError(null)
                            }}
                            className={cn(selected && "ring-2 ring-white/80")}
                          >
                            <Flag code={v.country} className="h-3 w-4.5 rounded-[2px]" />
                            {v.plate}
                          </Button>
                        )
                      })}
                    </div>
                    <ScrollBar orientation="horizontal" className="hidden" />
                  </ScrollArea>
                )}

                {/* period picker */}
                <ScrollArea className="-mx-4 mt-3">
                  <ToggleGroup
                    type="single"
                    value={period ?? ""}
                    onValueChange={(p) => p && setPeriod(p)}
                    spacing={3}
                    aria-label={t("order.periodLabel")}
                    className="w-max px-4 pb-2"
                  >
                    {periods.map((p) => {
                      const selected = p === period
                      return (
                        <ToggleGroupItem
                          key={p}
                          value={p}
                          className="h-auto min-w-0 shrink-0 gap-3 rounded-[22px] bg-[#cbe7ff] px-4 py-3.5 hover:bg-[#cbe7ff] data-[state=on]:bg-white data-[state=on]:shadow-lg"
                        >
                          <span className="relative">
                            <CalendarChip days={p} />
                            {selected && (
                              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-mint ring-2 ring-white">
                                <Check className="size-3 text-white" strokeWidth={3.5} />
                              </span>
                            )}
                          </span>
                          <span className="text-lg font-extrabold text-navy">
                            {fmt(product.price[p].total_price)}
                          </span>
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                  <ScrollBar orientation="horizontal" className="invisible" />
                </ScrollArea>

                {/* valid period from */}
                <Card className="mt-3 rounded-[24px] ring-0">
                  <CardContent>
                    <p className="text-lg font-extrabold tracking-wide text-navy uppercase">
                      {t("order.validFrom")}
                    </p>
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="secondary"
                          className="mt-3 h-auto w-full justify-between rounded-xl bg-[#f1f4f8] px-3.5 py-3.5 text-[17px] font-semibold text-navy hover:bg-[#e8edf3]"
                        >
                          <span className="flex items-center gap-2.5">
                            <CalendarDays className="size-5" />
                            {formatDate(startDate)} — {formatDate(endDate)}
                          </span>
                          <ChevronDown className="size-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={toDate(startDate)}
                          defaultMonth={toDate(startDate)}
                          disabled={{ before: toDate(dayStart(fromTomorrowOnly ? 1 : 0)) }}
                          onSelect={(picked) => {
                            if (!picked) return
                            setStartDate(dayStartOf(picked))
                            setDateOpen(false)
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <ToggleGroup
                      type="single"
                      value={isToday ? "today" : isTomorrow ? "tomorrow" : ""}
                      onValueChange={(v) => {
                        if (v === "today") setStartDate(dayStart(0))
                        if (v === "tomorrow") setStartDate(dayStart(1))
                      }}
                      spacing={3}
                      aria-label={t("order.quickStartLabel")}
                      className="mt-3 w-full"
                    >
                      <ToggleGroupItem
                        value="today"
                        disabled={fromTomorrowOnly}
                        className={QUICK_DATE}
                      >
                        {t("order.today")}
                      </ToggleGroupItem>
                      <ToggleGroupItem value="tomorrow" className={QUICK_DATE}>
                        {t("order.tomorrow")}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </CardContent>
                </Card>

                {/* driver info — required by some products (e.g. Moldova) */}
                {driverInfoRequired && (
                  <Card className="mt-3 rounded-[24px] ring-0">
                    <CardContent className="space-y-2.5">
                      <p className="text-lg font-extrabold tracking-wide text-navy uppercase">
                      {t("order.driverDetails")}
                      </p>
                      <Input
                        value={driver.user_name}
                        onChange={(e) =>
                          setDriver((d) => ({ ...d, user_name: e.target.value }))
                        }
                        placeholder={t("order.driverName")}
                        aria-label={t("order.driverName")}
                        className={FIELD}
                      />
                      <Input
                        value={driver.passport_number}
                        onChange={(e) =>
                          setDriver((d) => ({ ...d, passport_number: e.target.value }))
                        }
                        placeholder={t("order.passportNumber")}
                        aria-label={t("order.passportNumber")}
                        className={FIELD}
                      />
                      <Select
                        value={driver.passport_country}
                        onValueChange={(v) =>
                          setDriver((d) => ({ ...d, passport_country: v }))
                        }
                      >
                        <SelectTrigger
                          aria-label={t("order.passportCountry")}
                          className={cn(FIELD, "justify-between")}
                        >
                          <span className="text-navy-soft">{t("order.passportCountry")}</span>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {countryOptions().map((code) => (
                            <SelectItem key={code} value={code}>
                              {countryLabel(code)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                )}

                {/* email + price breakdown + flex */}
                <Card className="mt-3 rounded-[24px] bg-brand-deep/60 text-white ring-0">
                  <CardContent>
                    <Input
                      type="email"
                      value={email}
                      readOnly={!isGuest}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("common.email")}
                      aria-label={t("common.email")}
                      className={cn(
                        "h-auto w-full rounded-2xl border-0 bg-brand-tint/70 px-4 py-3.5 text-center text-lg font-semibold text-white shadow-none placeholder:text-white/70 focus-visible:ring-white/40 md:text-lg",
                        !isGuest && "cursor-default"
                      )}
                    />
                    {selectedPrice && (
                      <div className="mt-4 space-y-2.5 px-1">
                        <PriceRow
                          label={t("order.officialVignette")}
                          value={fmt(selectedPrice.government_price)}
                        />
                        <PriceRow
                          label={t("order.serviceFee")}
                          value={fmt(servicePrice)}
                        />
                      </div>
                    )}
                    <FlexPanel
                      enabled={flexEnabled}
                      onEnabled={setFlexEnabled}
                      type={flexType}
                      onType={setFlexType}
                      defaultPrice={flexOptions.find((f) => f.type === "default")?.price ?? 2.99}
                      expandedPrice={flexOptions.find((f) => f.type === "expanded")?.price ?? 5.98}
                      currency={currency}
                      showBadges
                    />
                  </CardContent>
                </Card>

                {fromTomorrowOnly && (
                  <p className="mt-3 px-1 text-center text-sm font-semibold text-white/90">
                    {t("order.fromTomorrowOnly")}
                  </p>
                )}
                {mdOnMd && (
                  <Alert className="mt-3 rounded-2xl border-0 bg-pink/90 text-white">
                    <AlertDescription className="font-bold text-white">
                      {t("order.mdOnMd")}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  variant="mint"
                  size="xl"
                  className="mt-4 w-full"
                  disabled={!canProceed || mdOnMd || validateVehicles.isPending}
                  onClick={goToConfirm}
                >
                  {validateVehicles.isPending ? (
                    <>
                      <Spinner className="size-5" /> {t("order.checkingPlate")}
                    </>
                  ) : (
                    t("order.next")
                  )}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-4 px-1 text-[17px] leading-snug font-semibold text-white">
                  {t("order.confirmIntro")}
                </p>

                {/* Important! plate recap */}
                <Card className="mt-4 rounded-[24px] ring-0">
                  <CardContent>
                    <p className="text-lg font-extrabold text-pink">{t("order.important")}</p>
                    <div className="relative mt-2">
                      <div className="overflow-hidden rounded-xl">
                        <div className="flex items-stretch overflow-hidden bg-[#ECEFF3]">
                          <span className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 bg-[#173A7A] py-3">
                            <Flag code={plateCountry} className="h-4 w-6 rounded-[2px]" />
                            <span className="text-[10px] leading-none font-bold text-white">
                              {plateCountry.toUpperCase()}
                            </span>
                          </span>
                          <span className="flex min-h-14 flex-1 items-center justify-center px-3 text-[26px] font-extrabold tracking-[0.2em] text-navy uppercase">
                            {plate}
                          </span>
                        </div>
                        {vin && (
                          <div className="bg-brand px-3 py-2 text-center text-sm font-bold tracking-[0.12em] text-white uppercase">
                            {vin}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="brand"
                        size="icon-lg"
                        onClick={() => setStep("order")}
                        aria-label={t("order.editPlate")}
                        className="absolute -top-2 -right-2 rounded-full shadow-md"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                    <p className="mt-3 text-[15px] font-semibold text-navy">
                      {t("order.plateNote")}
                    </p>
                  </CardContent>
                </Card>

                {/* order summary */}
                <Card className="mt-3 rounded-[24px] ring-0">
                  <CardContent className="flex items-center gap-2.5">
                    <FlagRect
                      code={product.country}
                      className="h-8 w-11 shrink-0 rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-extrabold text-navy">
                        {countryLabel(product.country)}
                      </span>
                      <span className="block truncate text-[13px] font-semibold whitespace-nowrap text-navy-soft">
                        {periodLabel(period!)} · {formatDayMonth(startDate)} —{" "}
                        {formatDayMonth(endDate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[17px] font-extrabold whitespace-nowrap text-navy">
                      {selectedPrice ? fmt(selectedPrice.total_price) : "—"}
                    </span>
                    <ChevronDown className="size-5 shrink-0 text-navy-soft" />
                  </CardContent>
                </Card>

                {/* add other e-vignettes */}
                {onSwitchCountry && (
                  <>
                    <p className="mt-5 text-center text-[15px] font-extrabold tracking-wide text-white uppercase">
                      {t("order.addOthers")}
                    </p>
                    <ScrollArea className="-mx-4 mt-3">
                      <div className="flex w-max gap-4 px-6 pb-2">
                        {countries
                          .filter((c) => c !== product.country)
                          .map((c) => (
                            <Button
                              key={c}
                              variant="ghost"
                              onClick={() => onSwitchCountry(c)}
                              className="h-auto shrink-0 flex-col gap-1.5 p-0 hover:bg-transparent [&_svg:not([class*='size-'])]:size-full"
                            >
                              <span className="relative">
                                <FlagCircle code={c} className="size-16" />
                                <Badge className="absolute -right-0.5 bottom-0 size-5 justify-center rounded-full bg-pink p-0 text-sm font-bold text-white ring-2 ring-white">
                                  +
                                </Badge>
                              </span>
                              <span className="max-w-16 truncate text-[13px] font-bold text-white">
                                {countryLabel(c)}
                              </span>
                            </Button>
                          ))}
                      </div>
                      <ScrollBar orientation="horizontal" className="invisible" />
                    </ScrollArea>
                  </>
                )}

                <Card className="mt-4 rounded-[24px] bg-brand-deep/60 text-white ring-0">
                  <CardContent>
                    <FlexPanel
                      enabled={flexEnabled}
                      onEnabled={setFlexEnabled}
                      type={flexType}
                      onType={setFlexType}
                      defaultPrice={flexOptions.find((f) => f.type === "default")?.price ?? 2.99}
                      expandedPrice={flexOptions.find((f) => f.type === "expanded")?.price ?? 5.98}
                      currency={currency}
                      showBadges
                    />
                    <PromoCodeInput
                      code={promoCode}
                      onCode={setPromoCode}
                      applied={promo}
                      auto={autoPromo}
                      error={promoError}
                      pending={promoChecking}
                      onApply={applyPromo}
                      onRemove={removePromo}
                    />
                    <label className="mt-4 flex cursor-pointer items-start gap-3 px-1">
                      <Checkbox
                        checked={terms}
                        onCheckedChange={(v) => setTerms(v === true)}
                        className="mt-0.5 size-6 shrink-0 rounded-md border-2 border-white/80 bg-white/15 data-checked:border-white data-checked:bg-white data-checked:text-brand"
                      />
                      <span className="text-[15px] leading-snug font-semibold text-white">
                        {t("order.termsPrefix")}{" "}
                        <a
                          href="https://vignette.id/legal/terms"
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {t("order.termsLink")}
                        </a>{" "}
                        {t("order.termsMiddle")}{" "}
                        <a
                          href="https://vignette.id/legal/privacy"
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {t("order.privacyLink")}
                        </a>
                      </span>
                    </label>
                  </CardContent>
                </Card>

                <Alert className="mt-4 rounded-[24px] border-0 bg-pink text-white">
                  <AlertDescription className="text-[17px] leading-snug font-extrabold text-white">
                    {t("order.responsibility")}
                  </AlertDescription>
                </Alert>

                {duplicateWarning && (
                  <Alert className="mt-4 rounded-[24px] border-0 bg-white text-navy">
                    <AlertTitle className="line-clamp-none text-[15px] font-bold whitespace-normal">
                      {duplicateWarning}
                    </AlertTitle>
                    <AlertDescription className="text-navy-soft">
                      <p>{t("order.duplicateNote")}</p>
                      <Button
                        variant="outline"
                        size="pill"
                        onClick={() => submit({ allowDuplication: true })}
                        className="mt-3 w-full border-2 border-pink bg-transparent text-pink uppercase tracking-wider hover:bg-pink/5 hover:text-pink"
                      >
                        {t("order.buyAnyway")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="mt-5 flex items-end justify-between gap-3 px-1">
                  <span className="text-lg font-semibold text-white">
                    {t("order.total", { count: 1 })}
                  </span>
                  <span className="flex items-baseline gap-2">
                    {/* the promo prices in EUR, so it can only restate the
                        headline number while EUR is what's on screen */}
                    {activePromo && currency === "EUR" && (
                      <span className="text-lg font-semibold text-white/60 line-through">
                        {formatPrice(activePromo.price_preview.subtotal_eur, "EUR")}
                      </span>
                    )}
                    <span className="text-3xl font-extrabold text-white">
                      {activePromo && currency === "EUR"
                        ? formatPrice(activePromo.price_preview.pay_price_eur, "EUR")
                        : fmt(total)}
                    </span>
                  </span>
                </div>
                <TotalNote promo={activePromo} currency={currency} eurTotal={eurTotal} />

                <Button
                  variant="mint"
                  size="xl"
                  className="mt-3 w-full disabled:opacity-60"
                  disabled={!terms}
                  onClick={() => submit()}
                >
                  {t("order.pay")}
                </Button>
              </>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/* --------------------------------------------------------- subcomponents */

/** TODAY / TOMORROW quick picks — outlined pill, filled dark when active */
const QUICK_DATE =
  "h-12 min-w-0 flex-1 rounded-full border-2 border-[#3a3f47] bg-transparent text-[15px] font-extrabold tracking-wider text-navy uppercase hover:bg-transparent data-[state=on]:border-[#3a3f47] data-[state=on]:bg-[#3a3f47] data-[state=on]:text-white disabled:opacity-40"

function StepIndicator({ step }: { step: "order" | "confirm" }) {
  const { t } = useT()
  return (
    <div className="mt-2 flex rounded-full bg-white/25 p-1">
      <span
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-lg font-bold",
          step === "order" ? "bg-white text-navy" : "text-white/90"
        )}
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-[15px] font-bold",
            step === "order" ? "bg-brand text-white" : "bg-white text-brand"
          )}
        >
          {step === "confirm" ? <Check className="size-4" strokeWidth={3.5} /> : "1"}
        </span>
        {t("order.stepOrder")}
      </span>
      <span
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-lg font-bold",
          step === "confirm" ? "bg-white text-navy" : "text-white/60"
        )}
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-[15px] font-bold",
            step === "confirm" ? "bg-brand text-white" : "bg-white/40 text-white"
          )}
        >
          2
        </span>
        {t("order.stepConfirm")}
      </span>
    </div>
  )
}

/**
 * The line under the total. Two things can need saying and they overlap: a
 * promo always quotes EUR (that is what the payment link charges), and a
 * non-EUR display currency is only ever an estimate — so when both apply the
 * euro figure quoted is the one the promo left, not the gross.
 */
function TotalNote({
  promo,
  currency,
  eurTotal,
}: {
  promo: PromoValidateResult | null
  currency: string
  /** the pre-promo EUR total, or null while EUR is the display currency */
  eurTotal: number | null
}) {
  const { t } = useT()
  const label = promo?.promo?.code ?? promo?.promo?.name ?? ""
  const discount = promo ? formatPrice(promo.discount_eur, "EUR") : ""

  if (promo && eurTotal !== null) {
    return (
      <p className="mt-1 px-1 text-right text-xs font-semibold text-white/75">
        {t("order.chargedInEuroPromo", {
          amount: formatPrice(promo.price_preview.pay_price_eur, "EUR"),
          code: label,
          discount,
          currency,
        })}
      </p>
    )
  }
  if (promo) {
    return (
      <p className="mt-1 px-1 text-right text-xs font-semibold text-white/75">
        {t("order.promoOff", {
          code: label,
          discount,
          subtotal: formatPrice(promo.price_preview.subtotal_eur, "EUR"),
        })}
      </p>
    )
  }
  if (eurTotal !== null) {
    return (
      <p className="mt-1 px-1 text-right text-xs font-semibold text-white/75">
        {t("order.chargedInEuro", {
          amount: formatPrice(eurTotal, "EUR"),
          currency,
        })}
      </p>
    )
  }
  return null
}

function ProductSummary({ product }: { product: CatalogProduct }) {
  const { t } = useT()
  const badge = productBadge(product)
  return (
    <Card className="mt-3 rounded-[24px] ring-0">
      <CardContent className="flex gap-3">
        <div
          className="relative flex size-22 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: tileColor(product.color) }}
        >
          <img src={product.icon} alt="" className="size-16 object-contain" />
          {badge && (
            <Badge className="absolute -right-1 -bottom-1 rounded-lg bg-brand-tint px-1.5 py-0.5 text-xs font-extrabold text-white shadow-sm">
              {badge}
            </Badge>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="flex items-center gap-2">
            <FlagRect code={product.country} />
            <span className="truncate text-xs font-extrabold tracking-wider text-orange-400 uppercase">
              {countryLabel(product.country)}
            </span>
          </p>
          <h3 className="mt-0.5 truncate text-[22px] font-extrabold text-navy">
            {product.title}
          </h3>
          {product.restrictions && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {Object.entries(product.restrictions)
                .slice(0, 2)
                .map(([key, value]) => (
                  <Badge
                    key={key}
                    variant="outline"
                    className="h-auto flex-col items-start gap-0 rounded-lg border-[#e3ebf3] px-2 py-1 leading-tight"
                  >
                    <span className="text-[10px] font-extrabold tracking-wider whitespace-nowrap text-navy uppercase">
                      {RESTRICTION_KEYS[key] ? t(RESTRICTION_KEYS[key]) : key}
                    </span>
                    <span className="text-xs font-extrabold whitespace-nowrap text-pink">
                      {value}
                    </span>
                  </Badge>
                ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CalendarChip({ days }: { days: string }) {
  const { t } = useT()
  return (
    <span className="flex w-14 flex-col overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
      <span className="relative h-2.5 bg-[#f2717c]">
        <span className="absolute top-0.5 left-2.5 h-2 w-1 rounded-full bg-[#3a5ba9]" />
        <span className="absolute top-0.5 right-2.5 h-2 w-1 rounded-full bg-[#3a5ba9]" />
      </span>
      <span className="py-0.5 text-center leading-tight">
        <span className="block text-lg font-extrabold text-[#3b4a6b]">{days}</span>
        <span className="block pb-0.5 text-[9px] font-extrabold tracking-wider text-[#f2717c] uppercase">
          {t("unit.days", { count: Number(days) })}
        </span>
      </span>
    </span>
  )
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline gap-2 text-[15px] font-semibold text-white">
      <span className="shrink-0">{label}</span>
      <span className="flex-1 border-b-2 border-dotted border-white/40" />
      <span className="shrink-0 font-bold">{value}</span>
    </p>
  )
}

function FlexPanel({
  enabled,
  onEnabled,
  type,
  onType,
  defaultPrice,
  expandedPrice,
  currency,
  showBadges,
}: {
  enabled: boolean
  onEnabled: (v: boolean) => void
  type: "default" | "expanded"
  onType: (v: "default" | "expanded") => void
  /** in `currency`, as the flex catalogue quotes them */
  defaultPrice: number
  expandedPrice: number
  currency: string
  showBadges?: boolean
}) {
  const { t } = useT()
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <label className="flex min-w-0 cursor-pointer items-center gap-2">
          <Checkbox
            checked={enabled}
            onCheckedChange={(v) => onEnabled(v === true)}
            className="size-6 shrink-0 rounded-md border-2 border-white/80 bg-white/15 data-checked:border-white data-checked:bg-white data-checked:text-brand"
          />
          <span className="min-w-0 leading-tight">
            <span className="flex items-center gap-1 text-[15px] font-bold whitespace-nowrap text-white">
              {t("order.flexTitle")}{" "}
              <CircleQuestionMark className="size-3.5 shrink-0 opacity-80" />
            </span>
            <span className="text-xs font-semibold whitespace-nowrap text-white/75">
              {t("order.flexRecommended")}
            </span>
          </span>
        </label>
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => (v === "default" || v === "expanded") && onType(v)}
          spacing={0}
          aria-label={t("order.flexTierLabel")}
          className="shrink-0 gap-0 rounded-xl bg-white/90 p-1"
        >
          {(
            [
              ["default", "order.flexDefault", defaultPrice],
              ["expanded", "order.flexExpanded", expandedPrice],
            ] as const
          ).map(([value, label, price]) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-auto min-w-0 flex-col items-center gap-0 rounded-lg px-2 py-1 leading-tight opacity-50 hover:bg-transparent hover:opacity-50 data-[state=on]:bg-white data-[state=on]:opacity-100 data-[state=on]:shadow first:rounded-lg last:rounded-lg"
            >
              <span className="text-[9px] font-extrabold tracking-wider text-navy-soft uppercase">
                {t(label)}
              </span>
              <span className="text-sm font-extrabold whitespace-nowrap text-navy">
                {formatPrice(price, currency)}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {showBadges && enabled && (
        <div className="mt-3 flex flex-col items-start gap-2">
          {(
            [
              "order.flexBenefitRefund",
              "order.flexBenefitPlate",
              "order.flexBenefitDate",
            ] as const
          ).map((key) => (
            <Badge
              key={key}
              variant="secondary"
              className="rounded-lg bg-white/25 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-white/25"
            >
              {t(key)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function CreatingScreen() {
  const { t } = useT()
  return (
    <div className="flex min-h-[86dvh] flex-col items-center justify-center gap-8">
      <span className="relative flex size-28 items-center justify-center rounded-full bg-mint shadow-[0_0_60px_rgba(69,217,161,0.5)]">
        <Spinner className="size-12 text-white" />
      </span>
      <p className="text-xl font-semibold text-white">{t("order.creating")}</p>
    </div>
  )
}
