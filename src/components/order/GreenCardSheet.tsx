import { useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, Check, ChevronDown, Info, Plus, ShieldCheck, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import {
  DrawerContent,
  DrawerDescription,
  DrawerNested,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Flag } from "@/lib/countries"
import { dayStart, formatDate, formatPrice } from "@/lib/format"
import { ApiRequestError, apiErrorMessage } from "@/lib/api"
import { useT, type MessageKey } from "@/i18n"
import { calculateGreenCard } from "@/queries/green-card"
import { cn } from "@/lib/utils"
import type {
  CatalogProduct,
  GreenCardCalculateBody,
  GreenCardCalculation,
  GreenCardCatalog,
  GreenCardOrderEntry,
  VehicleLookup,
} from "@/types/api"

/**
 * What the order sheet keeps once the Green Card is added: the server's
 * signed calculation, the body that produced it (to refresh it when it
 * expires) and the order entry minus the car index.
 */
export interface GreenCardDraft {
  calculation: GreenCardCalculation
  calculateBody: GreenCardCalculateBody
  entry: Omit<GreenCardOrderEntry, "car">
}

/** Whether this plate on this product may carry a Green Card at all. */
export function greenCardEligible(
  catalog: GreenCardCatalog | undefined,
  product: CatalogProduct | null,
  plateCountry: string,
): boolean {
  if (!catalog?.enabled || !product) return false
  if (!catalog.plate_countries.includes(plateCountry)) return false
  return categoryForProduct(catalog, product) !== null
}

/**
 * Our vehicle class code for a catalog product (2a car, 2b van, 1m moto, u
 * trailer): the server's `vehicle_class` (GET /public/catalog/products),
 * which is what the Green Card catalogue's vehicle_classes are. The
 * derivation from `vehicle_type` (the products table's word) and the
 * product name's suffix (vignette-si-2a) only covers an API that predates
 * the field.
 */
const CLASS_BY_VEHICLE_TYPE: Record<string, string> = { car: "2a", van: "2b", moto: "1m", trailer: "u" }

export function vehicleClassOf(product: CatalogProduct): string | null {
  if (product.vehicle_class !== undefined) return product.vehicle_class
  const byType = CLASS_BY_VEHICLE_TYPE[(product.vehicle_type || "").toLowerCase()]
  if (byType) return byType
  const bySuffix = /-(2a|2b|1m|u)$/i.exec(product.name)
  return bySuffix ? bySuffix[1].toLowerCase() : null
}

/** The insurer's vehicle category for the product's class (2a/2b → car, 1m → moto). */
export function categoryForProduct(catalog: GreenCardCatalog, product: CatalogProduct) {
  const vehicleClass = vehicleClassOf(product)
  if (!vehicleClass) return null
  return (
    catalog.vehicle_categories.find((c) => c.vehicle_classes.includes(vehicleClass)) ?? null
  )
}

const FIELD =
  "h-auto w-full rounded-xl border-0 bg-[#f1f4f8] px-3.5 py-3 text-[15px] font-semibold text-navy shadow-none placeholder:text-navy-soft placeholder:font-semibold focus-visible:ring-brand/40 md:text-[15px]"

const TAX_ID = /^\d{10}$/
const PHONE = /^\+?[0-9]{10,15}$/
const PASSPORT_SERIES = /^[A-Za-z]{2}$/
const PASSPORT_NUMBER = /^\d{6}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CALCULATE_DEBOUNCE_MS = 600

const toDate = (unix: number) => new Date(unix * 1000)
const dayStartOf = (date: Date) => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return Math.floor(copy.getTime() / 1000)
}
const todayIso = () => new Date().toISOString().slice(0, 10)

const ageOf = (birth: string) => {
  const b = new Date(birth)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1
  return age
}

/** The duration code's label: "15 days", "1 month", "6 months". */
export function durationLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  code: string | null,
) {
  if (!code) return ""
  if (code.endsWith("d")) return t("greenCard.durationDays", { count: Number(code.slice(0, -1)) })
  return t("greenCard.durationMonths", { count: Number(code.slice(0, -1)) })
}

interface Form {
  make: string
  model: string
  year: string
  vin: string
  engine_capacity: string
  own_weight: string
  total_weight: string
  seats_count: string
  duration: string
  policyStart: number
  first_name: string
  last_name: string
  first_name_latin: string
  last_name_latin: string
  tax_id: string
  birth: string
  phone: string
  city: string
  passport_series: string
  passport_number: string
  passport_issued_at: string
  passport_issued_by: string
}

const num = (value: string) => {
  const n = Number(value)
  return value.trim() !== "" && Number.isInteger(n) ? n : null
}

/**
 * The Green Card add-on row on step 1 (the website's "Green Card · New ·
 * From 20.99 €*" checkbox) — tap to open the sheet; shows the chosen price
 * once a policy is on the order.
 */
export function GreenCardRow({
  catalog,
  draft,
  onOpen,
  onRemove,
  disabled,
}: {
  catalog: GreenCardCatalog
  draft: GreenCardDraft | null
  onOpen: () => void
  onRemove: () => void
  disabled?: boolean
}) {
  const { t } = useT()
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl bg-white/15 px-3 py-3">
      <button
        type="button"
        onClick={draft ? onRemove : onOpen}
        disabled={disabled}
        aria-pressed={Boolean(draft)}
        aria-label={t("greenCard.title")}
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-white/80",
          draft ? "bg-white text-brand" : "bg-white/15",
        )}
      >
        {draft && <Check className="size-4" strokeWidth={3.5} />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="min-w-0 flex-1 text-left leading-snug"
      >
        <span className="flex items-center gap-2 text-[15px] font-extrabold text-white">
          <ShieldCheck className="size-4 shrink-0" />
          {t("greenCard.title")}
          <Badge className="rounded-md bg-mint px-1.5 py-0 text-[11px] font-extrabold text-white">
            {t("greenCard.new")}
          </Badge>
        </span>
        <span className="block text-[13px] font-semibold text-white/75">
          {draft
            ? t("greenCard.rowApplied", {
                duration: durationLabel(t, draft.entry.vehicle ? draftDuration(draft) : null),
                insurer: draft.calculation.insurer,
              })
            : t("greenCard.rowSubtitle")}
        </span>
      </button>
      <span className="shrink-0 text-right text-[15px] font-extrabold whitespace-nowrap text-white">
        {draft
          ? formatPrice(draft.calculation.price, "EUR")
          : t("greenCard.fromPrice", {
              price: formatPrice(catalog.from_price.amount, catalog.from_price.currency),
            })}
      </span>
    </div>
  )
}

const draftDuration = (draft: GreenCardDraft) => draft.calculateBody.trip.duration

/** The confirm-step recap of the policy on the order, with a remove control. */
export function GreenCardSummary({
  draft,
  plate,
  plateCountry,
  onEdit,
  onRemove,
  error,
}: {
  draft: GreenCardDraft
  plate: string
  plateCountry: string
  onEdit: () => void
  onRemove: () => void
  error?: string | null
}) {
  const { t } = useT()
  return (
    <Card className="mt-3 rounded-[24px] ring-0">
      <CardContent>
        <div className="flex items-center gap-2.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-mint/20 text-mint-deep">
            <ShieldCheck className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-extrabold text-navy">
              {t("greenCard.title")}
            </span>
            <span className="block truncate text-[13px] font-semibold text-navy-soft">
              <Flag code={plateCountry} className="mr-1 inline-block h-3 w-4.5 rounded-[2px] align-[-1px]" />
              {plate} · {durationLabel(t, draftDuration(draft))} ·{" "}
              {formatDate(draft.calculation.policy_start)} — {formatDate(draft.calculation.policy_end)}
            </span>
            <span className="block truncate text-xs font-semibold text-navy-soft">
              {t("greenCard.insurerLine", { insurer: draft.calculation.insurer })}
            </span>
          </span>
          <span className="shrink-0 text-[17px] font-extrabold whitespace-nowrap text-navy">
            {formatPrice(draft.calculation.price, "EUR")}
          </span>
        </div>
        {error && <p className="mt-2 text-[13px] font-semibold text-pink">{error}</p>}
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="pill" onClick={onEdit} className="flex-1 border-2 border-navy/20 text-navy">
            {t("greenCard.edit")}
          </Button>
          <Button variant="outline" size="pill" onClick={onRemove} className="flex-1 border-2 border-pink/60 text-pink hover:text-pink">
            {t("greenCard.remove")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The Green Card sheet: the vehicle as the registry knows it, the trip, the
 * server's price, and the policyholder. Nested over the order sheet like the
 * emission picker. Mounted per opening so the draft starts from what is on
 * the order (or the registry prefill) every time.
 */
export function GreenCardSheet({
  open,
  onOpenChange,
  catalog,
  product,
  plate,
  plateCountry,
  lookup,
  vignetteStart,
  value,
  onChange,
  serverError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: GreenCardCatalog
  product: CatalogProduct
  plate: string
  plateCountry: string
  /** GET /public/vehicles/lookup result for this plate, if the registry answered */
  lookup: VehicleLookup | null
  /** the vignette's start, so the policy defaults to the same day */
  vignetteStart: number
  value: GreenCardDraft | null
  onChange: (draft: GreenCardDraft | null) => void
  /** the server's refusal from order create, shown at the top */
  serverError?: string | null
}) {
  return (
    <DrawerNested open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="border-0 !bg-white data-[vaul-drawer-direction=bottom]:max-h-[94dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        {open && (
          <GreenCardBody
            catalog={catalog}
            product={product}
            plate={plate}
            plateCountry={plateCountry}
            lookup={lookup}
            vignetteStart={vignetteStart}
            value={value}
            serverError={serverError}
            onClose={() => onOpenChange(false)}
            onSave={(draft) => {
              onChange(draft)
              onOpenChange(false)
            }}
            onRemove={() => {
              onChange(null)
              onOpenChange(false)
            }}
          />
        )}
      </DrawerContent>
    </DrawerNested>
  )
}

function GreenCardBody({
  catalog,
  product,
  plate,
  plateCountry,
  lookup,
  vignetteStart,
  value,
  serverError,
  onClose,
  onSave,
  onRemove,
}: {
  catalog: GreenCardCatalog
  product: CatalogProduct
  plate: string
  plateCountry: string
  lookup: VehicleLookup | null
  vignetteStart: number
  value: GreenCardDraft | null
  serverError?: string | null
  onClose: () => void
  onSave: (draft: GreenCardDraft) => void
  onRemove: () => void
}) {
  const { t } = useT()
  const category = useMemo(() => categoryForProduct(catalog, product), [catalog, product])
  const minStart = dayStart(catalog.start.min_days_ahead)
  const maxStart = dayStart(catalog.start.max_days_ahead)

  const [form, setForm] = useState<Form>(() => {
    const v = value?.entry.vehicle
    const i = value?.entry.insurant
    return {
      make: v?.make ?? lookup?.brand ?? "",
      model: v?.model ?? lookup?.model ?? "",
      year: String(v?.year ?? lookup?.year ?? ""),
      vin: v?.vin ?? lookup?.vin_code ?? "",
      engine_capacity: String(v?.engine_capacity ?? lookup?.engine_capacity ?? ""),
      own_weight: String(v?.own_weight ?? lookup?.own_weight ?? ""),
      total_weight: String(v?.total_weight ?? lookup?.total_weight ?? ""),
      seats_count: String(v?.seats_count ?? ""),
      duration: value?.calculateBody.trip.duration ?? "15d",
      policyStart: value?.entry.policy_start ?? Math.max(vignetteStart, minStart),
      first_name: i?.first_name ?? "",
      last_name: i?.last_name ?? "",
      first_name_latin: i?.first_name_latin ?? "",
      last_name_latin: i?.last_name_latin ?? "",
      tax_id: i?.tax_id ?? "",
      birth: i?.birth ?? "",
      phone: i?.phone ?? "",
      city: i?.city ?? "",
      passport_series: i?.passport?.series ?? "",
      passport_number: i?.passport?.number ?? "",
      passport_issued_at: i?.passport?.issued_at ?? "",
      passport_issued_by: i?.passport?.issued_by ?? "",
    }
  })
  const set = (field: keyof Form) => (next: string | number) =>
    setForm((f) => ({ ...f, [field]: next }))
  const [dateOpen, setDateOpen] = useState(false)
  const [touched, setTouched] = useState(false)

  // ——— the price: calculated on the server whenever its inputs change ———
  const totalWeight = num(form.total_weight)
  const seats = num(form.seats_count)
  const birthValid = DATE.test(form.birth) && ageOf(form.birth) >= catalog.insurant.min_age
  const priceInputsValid =
    category !== null &&
    totalWeight !== null &&
    totalWeight >= catalog.vehicle.total_weight.min &&
    totalWeight <= catalog.vehicle.total_weight.max &&
    seats !== null &&
    seats >= catalog.vehicle.seats_count.min &&
    seats <= catalog.vehicle.seats_count.max &&
    form.policyStart >= minStart &&
    form.policyStart <= maxStart

  const calculateBody: GreenCardCalculateBody | null = useMemo(
    () =>
      priceInputsValid && category
        ? {
            vehicle: {
              plate: plate.toUpperCase().replace(/\s+/g, ""),
              country: plateCountry,
              category_id: category.id,
              total_weight: totalWeight!,
              seats_count: seats!,
            },
            trip: { zone: catalog.zones[0] ?? "eu", duration: form.duration },
            policy_start: form.policyStart,
            ...(birthValid ? { insurant: { birth: form.birth } } : {}),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [priceInputsValid, category?.id, plate, plateCountry, totalWeight, seats, form.duration, form.policyStart, birthValid ? form.birth : ""],
  )

  const [calc, setCalc] = useState<{
    status: "idle" | "loading" | "ok" | "error"
    body: GreenCardCalculateBody | null
    result: GreenCardCalculation | null
    error: string | null
  }>(() =>
    value
      ? { status: "ok", body: value.calculateBody, result: value.calculation, error: null }
      : { status: "idle", body: null, result: null, error: null },
  )
  const latest = useRef(0)
  useEffect(() => {
    if (!calculateBody) {
      setCalc((c) => (c.status === "idle" ? c : { status: "idle", body: null, result: null, error: null }))
      return
    }
    // the same inputs the current result was made from: nothing to do
    if (calc.status === "ok" && calc.body && JSON.stringify(calc.body) === JSON.stringify(calculateBody)) {
      return
    }
    const token = ++latest.current
    const timer = window.setTimeout(async () => {
      setCalc({ status: "loading", body: calculateBody, result: null, error: null })
      try {
        const result = await calculateGreenCard(calculateBody)
        if (token !== latest.current) return
        setCalc({ status: "ok", body: calculateBody, result, error: null })
      } catch (e) {
        if (token !== latest.current) return
        const message =
          e instanceof ApiRequestError && e.type === "insurance_calculation_unavailable"
            ? t("greenCard.insurerDown")
            : apiErrorMessage(e, t("greenCard.calculateFailed"))
        setCalc({ status: "error", body: calculateBody, result: null, error: message })
      }
    }, CALCULATE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculateBody])

  const calculation = calc.status === "ok" ? calc.result : null
  const requiresPassport = calculation?.requires_passport ?? false
  const passportStarted = Boolean(
    form.passport_series || form.passport_number || form.passport_issued_at || form.passport_issued_by,
  )
  const passportNeeded = requiresPassport || passportStarted

  // ——— the policyholder and vehicle rules, mirrored from the server ———
  const problems = useMemo(() => {
    const p: Partial<Record<keyof Form, MessageKey>> = {}
    const year = num(form.year)
    if (!form.make.trim()) p.make = "greenCard.err.required"
    if (!form.model.trim()) p.model = "greenCard.err.required"
    if (year === null || year < catalog.vehicle.year.min || year > catalog.vehicle.year.max)
      p.year = "greenCard.err.year"
    if (totalWeight === null || totalWeight < catalog.vehicle.total_weight.min || totalWeight > catalog.vehicle.total_weight.max)
      p.total_weight = "greenCard.err.totalWeight"
    if (seats === null || seats < catalog.vehicle.seats_count.min || seats > catalog.vehicle.seats_count.max)
      p.seats_count = "greenCard.err.seats"
    for (const field of ["first_name", "last_name", "first_name_latin", "last_name_latin", "city"] as const) {
      if (!form[field].trim()) p[field] = "greenCard.err.required"
    }
    if (!TAX_ID.test(form.tax_id)) p.tax_id = "greenCard.err.taxId"
    if (!PHONE.test(form.phone.replace(/[\s()-]/g, ""))) p.phone = "greenCard.err.phone"
    if (!DATE.test(form.birth)) p.birth = "greenCard.err.required"
    else if (ageOf(form.birth) < catalog.insurant.min_age) p.birth = "greenCard.err.age"
    if (passportNeeded) {
      if (!PASSPORT_SERIES.test(form.passport_series)) p.passport_series = "greenCard.err.passportSeries"
      if (!PASSPORT_NUMBER.test(form.passport_number)) p.passport_number = "greenCard.err.passportNumber"
      if (!DATE.test(form.passport_issued_at)) p.passport_issued_at = "greenCard.err.required"
      else if (form.passport_issued_at > todayIso() || (DATE.test(form.birth) && form.passport_issued_at < form.birth))
        p.passport_issued_at = "greenCard.err.issuedAt"
      if (!form.passport_issued_by.trim()) p.passport_issued_by = "greenCard.err.required"
    }
    return p
  }, [form, catalog, totalWeight, seats, passportNeeded])

  const canSave = calculation !== null && Object.keys(problems).length === 0 && category !== null

  const save = () => {
    setTouched(true)
    if (!canSave || !calculation || !category || !calc.body) return
    const phone = form.phone.replace(/[\s()-]/g, "")
    onSave({
      calculation,
      calculateBody: calc.body,
      entry: {
        calculation_id: calculation.calculation_id,
        policy_start: form.policyStart,
        vehicle: {
          category_id: category.id,
          make: form.make.trim(),
          model: form.model.trim(),
          year: num(form.year)!,
          ...(form.vin.trim() ? { vin: form.vin.trim().toUpperCase() } : {}),
          ...(num(form.engine_capacity) ? { engine_capacity: num(form.engine_capacity)! } : {}),
          ...(num(form.own_weight) ? { own_weight: num(form.own_weight)! } : {}),
          total_weight: totalWeight!,
          seats_count: seats!,
        },
        insurant: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          first_name_latin: form.first_name_latin.trim(),
          last_name_latin: form.last_name_latin.trim(),
          tax_id: form.tax_id,
          birth: form.birth,
          phone: phone.startsWith("+") ? phone : `+${phone}`,
          city: form.city.trim(),
          ...(passportNeeded
            ? {
                passport: {
                  series: form.passport_series.toUpperCase(),
                  number: form.passport_number,
                  issued_at: form.passport_issued_at,
                  issued_by: form.passport_issued_by.trim(),
                },
              }
            : {}),
        },
      },
    })
  }

  const field = (
    name: keyof Form,
    props: React.ComponentProps<typeof Input> & { label: string },
  ) => {
    const { label, className, ...rest } = props
    const problem = touched ? problems[name] : undefined
    return (
      <div>
        <Input
          value={form[name] as string}
          onChange={(e) => set(name)(e.target.value)}
          placeholder={label}
          aria-label={label}
          aria-invalid={Boolean(problem)}
          className={cn(FIELD, problem && "ring-2 ring-pink/60", className)}
          {...rest}
        />
        {problem && <p className="mt-1 px-1 text-xs font-semibold text-pink">{t(problem)}</p>}
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
      <div className="px-5 pt-3">
        <div className="flex items-center justify-between gap-3">
          <DrawerTitle className="flex items-center gap-2 text-[22px] font-extrabold text-navy">
            <ShieldCheck className="size-6 text-mint-deep" />
            {t("greenCard.title")}
          </DrawerTitle>
          <button type="button" onClick={onClose} aria-label={t("common.cancel")} className="-mr-1 p-1 text-navy">
            <X className="size-5" strokeWidth={3} />
          </button>
        </div>
        <DrawerDescription className="mt-0.5 text-[13px] text-navy-soft">
          {t("greenCard.subtitle")}
        </DrawerDescription>
        {serverError && (
          <p className="mt-2 rounded-xl bg-pink/10 px-3 py-2 text-[13px] font-semibold text-pink">
            {serverError}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-3">
        {/* vehicle */}
        <Section title={t("greenCard.vehicleDetails")}>
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-[#ECEFF3] px-3 py-2">
            <Flag code={plateCountry} className="h-4 w-6 rounded-[2px]" />
            <span className="font-mono text-base font-extrabold tracking-[0.15em] text-navy">{plate}</span>
            {category && (
              <Badge variant="secondary" className="ml-auto rounded-md text-[11px] font-bold uppercase">
                {category.label}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field("make", { label: t("greenCard.make"), autoComplete: "off" })}
            {field("model", { label: t("greenCard.model"), autoComplete: "off" })}
            {field("year", { label: t("greenCard.year"), inputMode: "numeric", maxLength: 4 })}
            {field("vin", { label: t("greenCard.vin"), className: "uppercase", maxLength: 17 })}
            {field("total_weight", { label: t("greenCard.totalWeight"), inputMode: "numeric", maxLength: 5 })}
            {field("seats_count", { label: t("greenCard.seats"), inputMode: "numeric", maxLength: 3 })}
          </div>
          <p className="mt-1.5 flex gap-1.5 px-1 text-xs leading-snug text-navy-soft">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t("greenCard.registrationHint")}
          </p>
        </Section>

        {/* trip + price */}
        <Section title={t("greenCard.policyDetails")}>
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.duration} onValueChange={set("duration")}>
              <SelectTrigger aria-label={t("greenCard.period")} className={cn(FIELD, "justify-between")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.durations.map((d) => (
                  <SelectItem key={d.code} value={d.code}>
                    {durationLabel(t, d.code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="secondary" className={cn(FIELD, "justify-between hover:bg-[#e8edf3]")}>
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4" />
                    {formatDate(form.policyStart)}
                  </span>
                  <ChevronDown className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={toDate(form.policyStart)}
                  defaultMonth={toDate(form.policyStart)}
                  disabled={{ before: toDate(minStart), after: toDate(maxStart) }}
                  onSelect={(picked) => {
                    if (!picked) return
                    set("policyStart")(dayStartOf(picked))
                    setDateOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <p className="mt-1.5 px-1 text-xs leading-snug text-navy-soft">{t("greenCard.startHint")}</p>

          <div className="mt-3 rounded-2xl bg-[#173A7A] px-4 py-3 text-white">
            {calc.status === "loading" && (
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Spinner className="size-4" /> {t("greenCard.calculating")}
              </span>
            )}
            {calc.status === "idle" && (
              <span className="text-sm font-semibold text-white/80">{t("greenCard.fillToPrice")}</span>
            )}
            {calc.status === "error" && (
              <span className="text-sm font-semibold text-sun">{calc.error}</span>
            )}
            {calculation && (
              <div className="flex items-end justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-white/75">{t("greenCard.priceLabel")}</span>
                  <span className="block text-[13px] font-semibold text-white/75">
                    {t("greenCard.priceDetail", {
                      insurer: calculation.insurer,
                      uah: calculation.tariff_uah.toLocaleString("en-GB"),
                    })}
                  </span>
                  <span className="block text-xs text-white/60">
                    {formatDate(calculation.policy_start)} — {formatDate(calculation.policy_end)}
                  </span>
                </span>
                <span className="text-3xl font-extrabold whitespace-nowrap">
                  {formatPrice(calculation.price, "EUR")}
                </span>
              </div>
            )}
          </div>
        </Section>

        {/* policyholder */}
        <Section title={t("greenCard.holderDetails")}>
          <div className="grid grid-cols-2 gap-2">
            {field("first_name_latin", { label: t("greenCard.firstNameLatin"), autoComplete: "given-name" })}
            {field("last_name_latin", { label: t("greenCard.lastNameLatin"), autoComplete: "family-name" })}
            {field("first_name", { label: t("greenCard.firstNameLocal") })}
            {field("last_name", { label: t("greenCard.lastNameLocal") })}
            {field("tax_id", { label: t("greenCard.taxId"), inputMode: "numeric", maxLength: 10 })}
            {field("birth", { label: t("greenCard.birth"), type: "date", max: todayIso() })}
            {field("phone", { label: t("greenCard.phone"), type: "tel", autoComplete: "tel", placeholder: "+380 93 123 45 67" })}
            {field("city", { label: t("greenCard.city"), autoComplete: "address-level2" })}
          </div>
          <p className="mt-3 mb-1.5 px-1 text-xs font-bold tracking-wider text-navy-soft uppercase">
            {t("greenCard.passport")}{" "}
            <span className="font-semibold normal-case tracking-normal">
              {requiresPassport ? t("greenCard.passportRequired") : t("greenCard.passportOptional")}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {field("passport_series", { label: t("greenCard.passportSeries"), className: "uppercase", maxLength: 2, placeholder: "AA" })}
            {field("passport_number", { label: t("greenCard.passportNumber"), inputMode: "numeric", maxLength: 6, placeholder: "123456" })}
            {field("passport_issued_at", { label: t("greenCard.passportIssuedAt"), type: "date", max: todayIso() })}
            {field("passport_issued_by", { label: t("greenCard.passportIssuedBy"), placeholder: "2112" })}
          </div>
          <p className="mt-2 flex gap-1.5 px-1 text-xs leading-snug text-navy-soft">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t("greenCard.holderHint")}
          </p>
        </Section>
      </div>

      <div className="px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {touched && !canSave && (
          <p className="mb-2 px-1 text-center text-[13px] font-semibold text-pink">
            {calculation ? t("greenCard.fixFields") : t("greenCard.waitPrice")}
          </p>
        )}
        <div className="flex gap-2">
          {value && (
            <Button variant="outline" size="xl" onClick={onRemove} className="border-2 border-pink/60 text-pink hover:text-pink">
              {t("greenCard.remove")}
            </Button>
          )}
          <Button variant="mint" size="xl" className="flex-1" onClick={save} disabled={touched && !canSave}>
            {calculation ? (
              <>
                <Plus className="size-5" strokeWidth={3} />
                {t("greenCard.add", { price: formatPrice(calculation.price, "EUR") })}
              </>
            ) : (
              t("greenCard.addNoPrice")
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 px-1 text-xs font-extrabold tracking-wider text-navy uppercase">{title}</p>
      {children}
    </div>
  )
}
