import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Check,
  ChevronDown,
  CircleQuestionMark,
  Pencil,
  CalendarDays,
} from "lucide-react"
import { toast } from "sonner"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { DoneScreen, PaymentModal } from "@/components/order/PaymentDrawer"
import { productBadge, tileColor } from "@/components/vignettes/ProductCard"
import { Checkbox } from "@/components/ui/checkbox"
import {
  COUNTRY_NAMES,
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
  periodLabel,
} from "@/lib/format"
import { ApiRequestError } from "@/lib/api"
import { isValidVin } from "@/lib/vehicle"
import { getInstallationId } from "@/lib/webpush"
import { useAuthStore } from "@/stores/auth"
import { useCatalogStore } from "@/stores/catalog"
import { useOrdersStore } from "@/stores/orders"
import { cn } from "@/lib/utils"
import type { CatalogProduct } from "@/types/api"

type Step = "order" | "confirm" | "creating" | "paying" | "done"

interface OrderSheetProps {
  product: CatalogProduct | null
  open: boolean
  onClose: () => void
  /** confirm-step "add other e-vignettes" chip tapped */
  onSwitchCountry?: (country: string) => void
}

export function OrderSheet({ product, open, onClose, onSwitchCountry }: OrderSheetProps) {
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.me)
  const flexOptions = useCatalogStore((s) => s.flexOptions)
  const countries = useCatalogStore((s) => s.countries)
  const createOrder = useOrdersStore((s) => s.create)
  const getOrder = useOrdersStore((s) => s.getOrder)
  const reloadOrders = useOrdersStore((s) => s.load)

  const [step, setStep] = useState<Step>("order")
  const [plate, setPlate] = useState("")
  const [plateCountry, setPlateCountry] = useState("ua")
  const [vin, setVin] = useState("")
  const [vinOpen, setVinOpen] = useState(false)
  const [period, setPeriod] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<number>(dayStart(0))
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
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  // just the id — POST returns a slim stub; the poll fetches the full order
  const [createdOrder, setCreatedOrder] = useState<{ id: string } | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

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
      setStep("order")
      setPeriod(periods[0] ?? null)
      setStartDate(dayStart(0))
      setPaymentLink(null)
      setCreatedOrder(null)
      setDuplicateWarning(null)
      setFlexEnabled(true)
      setFlexType(useCatalogStore.getState().defaultFlexType())
      setTerms(true)
    }
  }, [open, product, periods])

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

  // poll the created order while the user pays in the other tab
  useEffect(() => {
    if (step !== "paying" || !createdOrder) return
    pollTimer.current = setInterval(async () => {
      try {
        const fresh = await getOrder(createdOrder.id)
        if (fresh.status !== "CREATED") {
          setStep("done")
        }
      } catch {
        /* transient — keep polling */
      }
    }, 4000)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [step, createdOrder, getOrder])

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
  const flexPrice = flexOption?.price ?? (flexType === "expanded" ? 5.98 : 2.99)
  const servicePrice = selectedPrice
    ? Math.round((selectedPrice.total_price - selectedPrice.government_price) * 100) / 100
    : 0
  const total = selectedPrice
    ? Math.round((selectedPrice.total_price + (flexEnabled ? flexPrice : 0)) * 100) / 100
    : 0
  const endDate = period ? addDays(startDate, Number(period)) - 60 : startDate
  const isToday = startDate === dayStart(0)
  const isTomorrow = startDate === dayStart(1)
  const isGuest = me?.guest ?? true
  const emailValid = /.+@.+\..+/.test(email)

  // plates must be ≥3 chars with a country (helpers/vehicle.js#checkCars);
  // per-country patterns stay server-side and surface via the API error
  const canProceed =
    plate.trim().length >= 3 &&
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

  const submit = async (options: { allowDuplication?: boolean } = {}) => {
    if (!terms) {
      toast.error("Please accept the terms and conditions")
      return
    }
    setDuplicateWarning(null)
    setStep("creating")
    try {
      const installationId = getInstallationId()
      const result = await createOrder(
        {
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
        options
      )
      setCreatedOrder(result.orders[0] ?? null)
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
      } else {
        const message =
          e instanceof ApiRequestError ? e.message : "Could not create the order"
        toast.error(message)
      }
      setStep("confirm")
    }
  }

  const finish = () => {
    void reloadOrders({ silent: true })
    onClose()
    navigate("/")
  }

  const closeGuard = (next: boolean) => {
    if (!next) {
      if (step === "creating") return // don't dismiss mid-request
      if (step === "done" || step === "paying") {
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
          Order {product.title} — {COUNTRY_NAMES[product.country]}
        </DrawerTitle>

        {step === "creating" && <CreatingScreen />}
        {step === "paying" && (
          <PaymentModal paymentLink={paymentLink} onClose={finish} />
        )}
        {step === "done" && <DoneScreen onFinish={finish} />}

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
                <div className="mt-3 rounded-[24px] bg-white p-4">
                  <div className="flex items-center gap-2.5">
                    <label className="relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#f1f4f8] px-2.5 py-3">
                      <Flag code={plateCountry} className="h-6 w-9 rounded-md" />
                      <ChevronDown className="size-5 text-navy-soft" />
                      <select
                        aria-label="Plate country"
                        value={plateCountry}
                        onChange={(e) => setPlateCountry(e.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      >
                        {PLATE_COUNTRIES.map((c) => (
                          <option key={c} value={c}>
                            {COUNTRY_NAMES[c]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex-1 overflow-hidden rounded-xl">
                      <div className="flex items-stretch overflow-hidden rounded-t-xl bg-[#ECEFF3]">
                        <span className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 bg-[#173A7A] py-2">
                          <Flag code={plateCountry} className="h-3.5 w-5 rounded-[2px]" />
                          <span className="text-[9px] leading-none font-bold text-white">
                            {plateCountry.toUpperCase()}
                          </span>
                        </span>
                        <input
                          value={plate}
                          onChange={(e) => setPlate(e.target.value.toUpperCase())}
                          placeholder="REGISTRATION PLATE"
                          className="min-w-0 flex-1 bg-transparent px-2 text-center text-xl font-extrabold tracking-[0.15em] text-navy uppercase outline-none placeholder:text-[11px] placeholder:font-semibold placeholder:tracking-[0.12em] placeholder:text-navy-soft"
                        />
                      </div>
                      {vinRequired &&
                        (vinOpen ? (
                          <input
                            autoFocus
                            value={vin}
                            onChange={(e) => setVin(e.target.value.toUpperCase())}
                            onBlur={() => !vin && setVinOpen(false)}
                            placeholder="VIN CODE"
                            className="w-full rounded-b-xl bg-brand px-3 py-2 text-center text-sm font-bold tracking-[0.15em] text-white uppercase outline-none placeholder:text-white/70"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setVinOpen(true)}
                            className="w-full rounded-b-xl bg-brand px-3 py-2 text-center text-sm font-semibold text-white"
                          >
                            {vin || "Type vin-code (required)"}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>

                {/* period picker */}
                <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4">
                  {periods.map((p) => {
                    const selected = p === period
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={cn(
                          "flex shrink-0 items-center gap-3 rounded-[22px] px-4 py-3.5 transition",
                          selected ? "bg-white shadow-lg" : "bg-[#cbe7ff]"
                        )}
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
                          {product.price[p].total_price} €
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* valid period from */}
                <div className="mt-3 rounded-[24px] bg-white p-4">
                  <p className="text-lg font-extrabold tracking-wide text-navy uppercase">
                    Valid period from
                  </p>
                  <label className="relative mt-3 flex cursor-pointer items-center justify-between rounded-xl bg-[#f1f4f8] px-3.5 py-3.5">
                    <span className="flex items-center gap-2.5 text-[17px] font-semibold text-navy">
                      <CalendarDays className="size-5" />
                      {formatDate(startDate)} — {formatDate(endDate)}
                    </span>
                    <ChevronDown className="size-5 text-navy" />
                    <input
                      type="date"
                      aria-label="Start date"
                      min={toDateInput(dayStart(fromTomorrowOnly ? 1 : 0))}
                      value={toDateInput(startDate)}
                      onChange={(e) => {
                        if (!e.target.value) return
                        const [y, m, d] = e.target.value.split("-").map(Number)
                        const picked = new Date(y, m - 1, d)
                        picked.setHours(0, 0, 0, 0)
                        setStartDate(Math.floor(picked.getTime() / 1000))
                      }}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      disabled={fromTomorrowOnly}
                      onClick={() => setStartDate(dayStart(0))}
                      className={cn(
                        "flex-1 rounded-full py-3 text-[15px] font-extrabold tracking-wider uppercase transition disabled:opacity-40",
                        isToday
                          ? "bg-[#3a3f47] text-white"
                          : "border-2 border-[#3a3f47] text-navy"
                      )}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setStartDate(dayStart(1))}
                      className={cn(
                        "flex-1 rounded-full py-3 text-[15px] font-extrabold tracking-wider uppercase transition",
                        isTomorrow
                          ? "bg-[#3a3f47] text-white"
                          : "border-2 border-[#3a3f47] text-navy"
                      )}
                    >
                      Tomorrow
                    </button>
                  </div>
                </div>

                {/* driver info — required by some products (e.g. Moldova) */}
                {driverInfoRequired && (
                  <div className="mt-3 space-y-2.5 rounded-[24px] bg-white p-4">
                    <p className="text-lg font-extrabold tracking-wide text-navy uppercase">
                      Driver details
                    </p>
                    <input
                      value={driver.user_name}
                      onChange={(e) =>
                        setDriver((d) => ({ ...d, user_name: e.target.value }))
                      }
                      placeholder="Full name"
                      className="w-full rounded-xl bg-[#f1f4f8] px-3.5 py-3 text-[15px] font-semibold text-navy outline-none placeholder:text-navy-soft"
                    />
                    <input
                      value={driver.passport_number}
                      onChange={(e) =>
                        setDriver((d) => ({ ...d, passport_number: e.target.value }))
                      }
                      placeholder="Passport number"
                      className="w-full rounded-xl bg-[#f1f4f8] px-3.5 py-3 text-[15px] font-semibold text-navy outline-none placeholder:text-navy-soft"
                    />
                    <label className="flex items-center gap-2.5 rounded-xl bg-[#f1f4f8] px-3.5 py-3">
                      <span className="text-[15px] font-semibold text-navy-soft">
                        Passport country
                      </span>
                      <select
                        value={driver.passport_country}
                        onChange={(e) =>
                          setDriver((d) => ({
                            ...d,
                            passport_country: e.target.value,
                          }))
                        }
                        className="flex-1 bg-transparent text-right text-[15px] font-semibold text-navy outline-none"
                      >
                        {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                          <option key={code} value={code}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {/* email + price breakdown + flex */}
                <div className="mt-3 rounded-[24px] bg-brand-deep/60 p-4">
                  <input
                    type="email"
                    value={email}
                    readOnly={!isGuest}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className={cn(
                      "w-full rounded-2xl bg-brand-tint/70 px-4 py-3.5 text-center text-lg font-semibold text-white outline-none placeholder:text-white/70",
                      !isGuest && "cursor-default"
                    )}
                  />
                  {selectedPrice && (
                    <div className="mt-4 space-y-2.5 px-1">
                      <PriceRow
                        label="Official Vignette"
                        value={`${selectedPrice.government_price} €`}
                      />
                      <PriceRow
                        label="Vignette Online Identification + VAT"
                        value={`${servicePrice} €`}
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
                    showBadges
                  />
                </div>

                {fromTomorrowOnly && (
                  <p className="mt-3 px-1 text-center text-sm font-semibold text-white/90">
                    This vignette can only start from tomorrow.
                  </p>
                )}
                {mdOnMd && (
                  <p className="mt-3 rounded-2xl bg-pink/90 px-4 py-3 text-sm font-bold text-white">
                    A Moldovan vignette is not required for a Moldovan vehicle
                    plate — pick a different plate country.
                  </p>
                )}

                <button
                  type="button"
                  disabled={!canProceed || mdOnMd}
                  onClick={() => setStep("confirm")}
                  className="mt-4 w-full rounded-2xl bg-mint py-4 text-xl font-extrabold tracking-[0.25em] text-white uppercase shadow-[0_10px_24px_rgba(47,199,141,0.4)] transition active:scale-[0.98] disabled:opacity-50"
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <p className="mt-4 px-1 text-[17px] leading-snug font-semibold text-white">
                  Double check the car plate and the countries as you will not
                  be able to change this after placing an order.
                </p>

                {/* Important! plate recap */}
                <div className="mt-4 rounded-[24px] bg-white p-4">
                  <p className="text-lg font-extrabold text-pink">Important!</p>
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
                    <button
                      type="button"
                      onClick={() => setStep("order")}
                      aria-label="Edit plate"
                      className="absolute -top-2 -right-2 flex size-9 items-center justify-center rounded-full bg-brand text-white shadow-md"
                    >
                      <Pencil className="size-4" />
                    </button>
                  </div>
                  <p className="mt-3 text-[15px] font-semibold text-navy">
                    The e-vignette below is for this plate.
                  </p>
                </div>

                {/* order summary */}
                <div className="mt-3 flex items-center gap-2.5 rounded-[24px] bg-white p-4">
                  <FlagRect
                    code={product.country}
                    className="h-8 w-11 shrink-0 rounded-lg"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-extrabold text-navy">
                      {COUNTRY_NAMES[product.country]}
                    </span>
                    <span className="block truncate text-[13px] font-semibold whitespace-nowrap text-navy-soft">
                      {periodLabel(period!)} · {formatDayMonth(startDate)} —{" "}
                      {formatDayMonth(endDate)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[17px] font-extrabold whitespace-nowrap text-navy">
                    {selectedPrice?.total_price} €
                  </span>
                  <ChevronDown className="size-5 shrink-0 text-navy-soft" />
                </div>

                {/* add other e-vignettes */}
                {onSwitchCountry && (
                  <>
                    <p className="mt-5 text-center text-[15px] font-extrabold tracking-wide text-white uppercase">
                      Add other e-vignettes in one click
                    </p>
                    <div className="no-scrollbar -mx-4 mt-3 flex gap-4 overflow-x-auto px-6">
                      {countries
                        .filter((c) => c !== product.country)
                        .map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => onSwitchCountry(c)}
                            className="flex shrink-0 flex-col items-center gap-1.5"
                          >
                            <span className="relative">
                              <FlagCircle code={c} className="size-16" />
                              <span className="absolute -right-0.5 bottom-0 flex size-5 items-center justify-center rounded-full bg-pink text-sm font-bold text-white ring-2 ring-white">
                                +
                              </span>
                            </span>
                            <span className="max-w-16 truncate text-[13px] font-bold text-white">
                              {COUNTRY_NAMES[c]}
                            </span>
                          </button>
                        ))}
                    </div>
                  </>
                )}

                <div className="mt-4 rounded-[24px] bg-brand-deep/60 p-4">
                  <FlexPanel
                    enabled={flexEnabled}
                    onEnabled={setFlexEnabled}
                    type={flexType}
                    onType={setFlexType}
                    defaultPrice={flexOptions.find((f) => f.type === "default")?.price ?? 2.99}
                    expandedPrice={flexOptions.find((f) => f.type === "expanded")?.price ?? 5.98}
                    showBadges
                  />
                  <label className="mt-4 flex cursor-pointer items-start gap-3 px-1">
                    <Checkbox
                      checked={terms}
                      onCheckedChange={(v) => setTerms(v === true)}
                      className="mt-0.5 size-6 shrink-0 rounded-md border-2 border-white/80 bg-white/15 data-checked:border-white data-checked:bg-white data-checked:text-brand"
                    />
                    <span className="text-[15px] leading-snug font-semibold text-white">
                      By clicking on pay I agree with the{" "}
                      <a
                        href="https://vignette.id/legal/terms"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        terms and conditions
                      </a>{" "}
                      and the{" "}
                      <a
                        href="https://vignette.id/legal/privacy"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        privacy policy
                      </a>
                    </span>
                  </label>
                </div>

                <div className="mt-4 rounded-[24px] bg-pink p-4">
                  <p className="text-[17px] leading-snug font-extrabold text-white">
                    You are fully responsible for all data errors. After payment
                    the data cannot be changed and the refund is not provided
                    according to government rules!
                  </p>
                </div>

                {duplicateWarning && (
                  <div className="mt-4 rounded-[24px] bg-white p-4">
                    <p className="text-[15px] font-bold text-navy">
                      {duplicateWarning}
                    </p>
                    <p className="mt-1 text-sm font-medium text-navy-soft">
                      You can still place this order if you're sure it's not a
                      duplicate.
                    </p>
                    <button
                      type="button"
                      onClick={() => submit({ allowDuplication: true })}
                      className="mt-3 w-full rounded-full border-2 border-pink py-2.5 text-[15px] font-extrabold tracking-wider text-pink uppercase"
                    >
                      Buy anyway
                    </button>
                  </div>
                )}

                <div className="mt-5 flex items-end justify-between px-1">
                  <span className="text-lg font-semibold text-white">
                    Total · 1 vignette
                  </span>
                  <span className="text-3xl font-extrabold text-white">{total} €</span>
                </div>

                <button
                  type="button"
                  disabled={!terms}
                  onClick={() => submit()}
                  className="mt-3 w-full rounded-2xl bg-mint py-4 text-xl font-extrabold tracking-[0.25em] text-white uppercase shadow-[0_10px_24px_rgba(47,199,141,0.4)] transition active:scale-[0.98] disabled:opacity-60"
                >
                  Pay
                </button>
              </>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/* --------------------------------------------------------- subcomponents */

function StepIndicator({ step }: { step: "order" | "confirm" }) {
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
        Order
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
        Confirm
      </span>
    </div>
  )
}

function ProductSummary({ product }: { product: CatalogProduct }) {
  const badge = productBadge(product)
  return (
    <div className="mt-3 rounded-[24px] bg-white p-4">
      <div className="flex gap-3">
        <div
          className="relative flex size-22 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: tileColor(product.color) }}
        >
          <img src={product.icon} alt="" className="size-16 object-contain" />
          {badge && (
            <span className="absolute -right-1 -bottom-1 rounded-lg bg-brand-tint px-1.5 py-0.5 text-xs font-extrabold text-white shadow-sm">
              {badge}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="flex items-center gap-2">
            <FlagRect code={product.country} />
            <span className="truncate text-xs font-extrabold tracking-wider text-orange-400 uppercase">
              {COUNTRY_NAMES[product.country]}
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
                  <span
                    key={key}
                    className="flex flex-col rounded-lg border border-[#e3ebf3] px-2 py-1 leading-tight"
                  >
                    <span className="text-[10px] font-extrabold tracking-wider whitespace-nowrap text-navy uppercase">
                      {key}
                    </span>
                    <span className="text-xs font-extrabold whitespace-nowrap text-pink">
                      {value}
                    </span>
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CalendarChip({ days }: { days: string }) {
  return (
    <span className="flex w-14 flex-col overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
      <span className="relative h-2.5 bg-[#f2717c]">
        <span className="absolute top-0.5 left-2.5 h-2 w-1 rounded-full bg-[#3a5ba9]" />
        <span className="absolute top-0.5 right-2.5 h-2 w-1 rounded-full bg-[#3a5ba9]" />
      </span>
      <span className="py-0.5 text-center leading-tight">
        <span className="block text-lg font-extrabold text-[#3b4a6b]">{days}</span>
        <span className="block pb-0.5 text-[9px] font-extrabold tracking-wider text-[#f2717c] uppercase">
          days
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
  showBadges,
}: {
  enabled: boolean
  onEnabled: (v: boolean) => void
  type: "default" | "expanded"
  onType: (v: "default" | "expanded") => void
  defaultPrice: number
  expandedPrice: number
  showBadges?: boolean
}) {
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
              Flex service{" "}
              <CircleQuestionMark className="size-3.5 shrink-0 opacity-80" />
            </span>
            <span className="text-xs font-semibold whitespace-nowrap text-white/75">
              (Recommended)
            </span>
          </span>
        </label>
        <div className="flex shrink-0 rounded-xl bg-white/90 p-1">
          {(
            [
              ["default", "Default", defaultPrice],
              ["expanded", "Expanded", expandedPrice],
            ] as const
          ).map(([value, label, price]) => (
            <button
              key={value}
              type="button"
              onClick={() => onType(value)}
              className={cn(
                "flex flex-col items-center rounded-lg px-2 py-1 leading-tight",
                type === value ? "bg-white shadow" : "opacity-50"
              )}
            >
              <span className="text-[9px] font-extrabold tracking-wider text-navy-soft uppercase">
                {label}
              </span>
              <span className="text-sm font-extrabold whitespace-nowrap text-navy">
                {price} €
              </span>
            </button>
          ))}
        </div>
      </div>
      {showBadges && enabled && (
        <div className="mt-3 flex flex-col items-start gap-2">
          {[
            "Refundable before activation",
            "Car plate can be changed before activation",
            "Travel date can be changed before activation",
          ].map((text) => (
            <span
              key={text}
              className="rounded-lg bg-white/25 px-3 py-1.5 text-[14px] font-semibold text-white"
            >
              {text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CreatingScreen() {
  return (
    <div className="flex min-h-[86dvh] flex-col items-center justify-center gap-8">
      <span className="relative flex size-28 items-center justify-center rounded-full bg-mint shadow-[0_0_60px_rgba(69,217,161,0.5)]">
        <span className="size-12 animate-spin rounded-full border-4 border-transparent border-t-white" />
      </span>
      <p className="text-xl font-semibold text-white">Creating your order…</p>
    </div>
  )
}


function toDateInput(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
