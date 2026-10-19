import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DoneScreen, PaymentModal } from "@/components/order/PaymentDrawer"
import { PromoCodeInput } from "@/components/order/PromoCodeInput"
import { VehicleLookupRow } from "@/components/order/VehicleLookup"
import {
  GreenCardSheet,
  GreenCardSummary,
  type GreenCardDraft,
  type GreenCardVehicleCategory,
} from "@/components/order/GreenCardSheet"
import { calculateGreenCard } from "@/queries/green-card"
import { notePurchaseCompleted } from "@/stores/rating"
import { countryLabel, Flag } from "@/lib/countries"
import { dayStart, formatPrice } from "@/lib/format"
import { useT } from "@/i18n"
import { ApiRequestError, apiErrorMessage } from "@/lib/api"
import { track, trackCustom } from "@/lib/insights"
import { plateErrorText, plateHintText } from "@/lib/plate-rules"
import { getInstallationId } from "@/lib/webpush"
import { useAuthStore } from "@/stores/auth"
import { clearPendingInviteCode, getPendingInviteCode } from "@/stores/invite"
import { useMe } from "@/queries/me"
import { useVehicles } from "@/queries/account"
import { useCreateOrder, useInvalidateOrders, usePaymentStatus } from "@/queries/orders"
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
import type { GreenCardCatalog, PromoValidateResult, VehicleLookup } from "@/types/api"

/** The product line's name on POST /public/me/orders (services/insurance-products.js). */
const PRODUCT = "green-card"

// "paying" covers the success screen too (the poll flips `paid`); "paid" is
// the wallet-free case where the server answered already paid (a 100% promo)
type Step = "vehicle" | "confirm" | "creating" | "paying" | "paid"

/**
 * A Green Card bought on its own — the Market tab's checkout. The policy is
 * a product line of its own on the order (name "green-card"), so the order
 * has one car and that one line; the server makes it an order row with
 * product "green-card" and issues the policy after payment
 * (docs/insurance/README.md). Two steps like the vignette sheet: the car,
 * then the recap with the price, a promo code and the payment.
 */
export function PolicyOrderSheet({
  catalog,
  open,
  onClose,
}: {
  catalog: GreenCardCatalog
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { t } = useT()
  const isGuest = useAuthStore((s) => s.user?.guest ?? true)
  const { data: me } = useMe()
  const savedVehicles = useVehicles().data ?? []
  const createOrder = useCreateOrder()
  const invalidateOrders = useInvalidateOrders()
  const pendingInvite = getPendingInviteCode()
  const plateRules = usePlateRules().data
  const checkPlateLocally = usePlateValidator()
  const validateVehicles = useValidateVehicles()

  const [step, setStep] = useState<Step>("vehicle")
  const [plate, setPlate] = useState("")
  const [plateCountry, setPlateCountry] = useState(catalog.plate_countries[0] ?? "ua")
  const [category, setCategory] = useState<GreenCardVehicleCategory | null>(
    catalog.vehicle_categories[0] ?? null,
  )
  const [lookedUp, setLookedUp] = useState<VehicleLookup | null>(null)
  const [plateError, setPlateError] = useState<string | null>(null)
  const [plateErrorHint, setPlateErrorHint] = useState<string | null>(null)
  const [draft, setDraft] = useState<GreenCardDraft | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [terms, setTerms] = useState(true)
  const [promoCode, setPromoCode] = useState("")
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [promo, setPromo] = useState<PromoValidateResult | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoChecking, setPromoChecking] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const [createdOrder, setCreatedOrder] = useState<{ id: string } | null>(null)
  const plateAttempts = useRef(0)

  // reset per opening
  useEffect(() => {
    if (!open) return
    track("product.viewed", { product: PRODUCT, country: null }, { product: PRODUCT })
    track("checkout.started", { product: PRODUCT, vehicles: 1 }, { product: PRODUCT })
    setStep("vehicle")
    setPlateError(null)
    setPlateErrorHint(null)
    setDraft(null)
    setSheetOpen(false)
    setDraftError(null)
    setPromoCode("")
    setAppliedCode(null)
    setPromo(null)
    setPromoError(null)
    setDuplicateWarning(null)
    setPaymentLink(null)
    setCreatedOrder(null)
    setTerms(true)
    plateAttempts.current = 0
  }, [open])

  useEffect(() => {
    if (me?.email) setEmail(me.email)
  }, [me?.email])

  const { paid } = usePaymentStatus(createdOrder?.id ?? null, step === "paying")

  const emailValid = /.+@.+\..+/.test(email)
  const plateVerdict = checkPlateLocally(plate, plateCountry)
  const localPlateError =
    plateRules &&
    plateVerdict &&
    !plateVerdict.valid &&
    plate.trim().length >= plateRules.normalize.min_length
      ? plateErrorText(plateRules, plateVerdict, countryLabel(plateCountry))
      : null
  const plateHint = plateRules ? plateHintText(plateRules, plateCountry, plateVerdict) : null
  const canContinue =
    plate.trim().length >= 2 && !localPlateError && category !== null && (!isGuest || emailValid)

  // ——— promo: priced against the one policy line, like the vignette sheet ———
  const promoInput: PromoValidateInput | null = useMemo(() => {
    if (!draft) return null
    const typedEmail = email.trim()
    return {
      code: null,
      cars: [{ plate: plate.trim(), country: plateCountry }],
      products: [{ ...draft.line, car: 0 }],
      ...(/.+@.+\..+/.test(typedEmail) ? { email: typedEmail } : {}),
    }
  }, [draft, plate, plateCountry, email])

  const autoPromoQuery = useAutoPromo(promoInput, {
    enabled: step === "confirm" && !appliedCode,
  })
  const autoPromo = autoPromoQuery.data?.valid ? autoPromoQuery.data : null

  useEffect(() => {
    if (!appliedCode || !promoInput) return
    let cancelled = false
    setPromoChecking(true)
    validatePromo({ ...promoInput, code: appliedCode })
      .then((result) => {
        if (cancelled) return
        setPromo(result)
        setPromoError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setPromo(null)
        setAppliedCode(null)
        setPromoError(apiErrorMessage(e, t("promo.checkFailed")))
      })
      .finally(() => {
        if (!cancelled) setPromoChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [appliedCode, promoInput, t])

  const activePromo = promo ?? autoPromo
  const total = draft?.calculation.price ?? 0
  const payTotal = activePromo?.price_preview.pay_price_eur ?? total

  const applyPromo = () => {
    const code = promoCode.trim().toUpperCase()
    if (!code) return
    setPromoError(null)
    setAppliedCode(code)
  }
  const removePromo = () => {
    setAppliedCode(null)
    setPromo(null)
    setPromoError(null)
    setPromoCode("")
  }

  /**
   * Leaving the car step: the server's verdict on the plate, then the policy
   * sheet. The check failing (offline, 5xx) must not trap the buyer — order
   * creation validates again anyway.
   */
  const continueToPolicy = async () => {
    setPlateError(null)
    try {
      const result = await validateVehicles.mutateAsync([
        { plate: plate.trim(), country: plateCountry },
      ])
      const invalid = firstInvalid(result)
      if (invalid) {
        setPlateError(invalid.error?.message ?? t("plate.rejected"))
        setPlateErrorHint(invalid.hint ?? null)
        plateAttempts.current += 1
        track("checkout.plate_rejected", {
          country: plateCountry,
          reason: invalid.error?.type ?? "invalid_plate",
          attempts: plateAttempts.current,
        })
        return
      }
      track("checkout.vehicle_added", { country: plateCountry }, { product: PRODUCT })
      const normalized = result.vehicles[0]?.plate
      if (normalized && normalized !== plate) setPlate(normalized)
    } catch {
      /* the plate check itself is unavailable — don't block the purchase */
    }
    setSheetOpen(true)
  }

  const submit = async (options: { allowDuplication?: boolean } = {}) => {
    if (!draft) return
    if (!terms) {
      toast.error(t("order.acceptTerms"))
      return
    }
    setDraftError(null)
    setDuplicateWarning(null)
    setStep("creating")

    // the signed calculation is short-lived: refresh it when it is about to
    // expire, and tell the buyer if the insurer's price moved
    let line = draft.line
    if (draft.calculation.expires_at - 60 < Math.floor(Date.now() / 1000)) {
      try {
        const fresh = await calculateGreenCard(draft.calculateBody)
        const refreshed: GreenCardDraft = {
          ...draft,
          calculation: fresh,
          line: {
            ...draft.line,
            insurance: { ...draft.line.insurance, calculation_id: fresh.calculation_id },
          },
        }
        setDraft(refreshed)
        line = refreshed.line
        if (fresh.price !== draft.calculation.price) {
          setDraftError(t("greenCard.priceChanged", { price: formatPrice(fresh.price, "EUR") }))
          setStep("confirm")
          return
        }
      } catch (e) {
        setDraftError(apiErrorMessage(e, t("greenCard.calculateFailed")))
        setStep("confirm")
        return
      }
    }

    try {
      const installationId = getInstallationId()
      const result = await createOrder.mutateAsync({
        allowDuplication: options.allowDuplication,
        body: {
          terms_and_privacy_accepted: true,
          ...(installationId ? { installation_id: installationId } : {}),
          cars: [{ plate: plate.trim().toUpperCase().replace(/\s+/g, ""), country: plateCountry }],
          // the one product line: the policy itself (name "green-card"),
          // with the fresh custom_id every unpaid order needs
          products: [{ ...line, car: 0, custom_id: crypto.randomUUID() }],
          ...(appliedCode ? { promo_code: appliedCode } : {}),
          ...(isGuest ? { email: email.trim() } : {}),
          ...(isGuest && pendingInvite ? { referral_code: pendingInvite } : {}),
        },
      })
      const created = result.orders[0] ?? null
      setCreatedOrder(created)
      if (pendingInvite) clearPendingInviteCode()
      track(
        "order.created",
        { product: PRODUCT, amount_eur: payTotal, vehicles: 1 },
        { product: PRODUCT, ...(created?.id ? { order_id: created.id } : {}) },
      )
      // a 100% promo: nothing to pay, the order is already PENDING
      if (result.payment?.status === "paid") {
        setPaymentLink(null)
        setStep("paid")
        return
      }
      track(
        "checkout.payment_opened",
        { amount_eur: payTotal },
        { product: PRODUCT, ...(created?.id ? { order_id: created.id } : {}) },
      )
      setPaymentLink(result.payment_link ?? null)
      setStep("paying")
    } catch (e) {
      if (
        e instanceof ApiRequestError &&
        ["pending_orders", "active_orders", "approved_orders"].includes(e.type) &&
        !options.allowDuplication
      ) {
        // this plate already has a policy for these dates — let the buyer decide
        setDuplicateWarning(e.message)
      } else if (isPromoError(e)) {
        setAppliedCode(null)
        setPromo(null)
        setPromoError(e.message)
        toast.error(e.message)
      } else if (
        e instanceof ApiRequestError &&
        (e.type === "invalid_insurance" ||
          e.type.startsWith("insurance_") ||
          e.type.startsWith("green_card_"))
      ) {
        // a stale or mismatched calculation is dropped (the sheet re-prices
        // on reopen); a field problem is shown on the recap and in the sheet
        if (e.type.startsWith("insurance_calculation")) setDraft(null)
        setDraftError(e.message)
        toast.error(e.message)
        if (!e.type.startsWith("insurance_calculation")) setSheetOpen(true)
      } else {
        toast.error(e instanceof ApiRequestError ? e.message : t("order.createFailed"))
      }
      setStep(draft ? "confirm" : "vehicle")
    }
  }

  const finish = () => {
    if (!paid && step === "paying") {
      track(
        "checkout.payment_failed",
        { reason: "closed_unpaid" },
        { product: PRODUCT, ...(createdOrder?.id ? { order_id: createdOrder.id } : {}) },
      )
    }
    void invalidateOrders()
    onClose()
    navigate("/")
    if (paid || step === "paid") notePurchaseCompleted()
  }

  const closeGuard = (next: boolean) => {
    if (next) return
    if (step === "creating") return
    if (step === "paying" || step === "paid") {
      finish()
      return
    }
    trackCustom(
      "checkout.abandoned",
      { step, promo: !!activePromo, plate: !!plate.trim() },
      { product: PRODUCT },
    )
    onClose()
  }

  return (
    <Drawer open={open} onOpenChange={closeGuard}>
      <DrawerContent className="border-0 bg-brand! data-[vaul-drawer-direction=bottom]:max-h-[94dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        <DrawerTitle className="sr-only">{t("policyOrder.title")}</DrawerTitle>

        {step === "creating" && (
          <div className="flex min-h-[86dvh] flex-col items-center justify-center gap-8">
            <span className="relative flex size-28 items-center justify-center rounded-full bg-mint shadow-[0_0_60px_rgba(69,217,161,0.5)]">
              <Spinner className="size-12 text-white" />
            </span>
            <p className="text-xl font-semibold text-white">{t("order.creating")}</p>
          </div>
        )}
        {step === "paying" && !paid && <PaymentModal paymentLink={paymentLink} onClose={finish} />}
        {step === "paying" && paid && <DoneScreen kind="policy" onFinish={finish} />}
        {step === "paid" && <DoneScreen kind="policy" onFinish={finish} />}

        {(step === "vehicle" || step === "confirm") && (
          <div className="mx-auto w-full max-w-md min-h-0 overflow-y-auto px-4 pt-2 pb-4">
            <StepIndicator step={step} />

            {/* the policy's own sheet, nested over this one */}
            <GreenCardSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              catalog={catalog}
              product={null}
              category={category}
              plate={plate}
              plateCountry={plateCountry}
              lookup={lookedUp}
              vignetteStart={dayStart(catalog.start.min_days_ahead)}
              value={draft}
              serverError={draftError}
              subtitle={t("policyOrder.subtitle")}
              saveLabel={(price) =>
                price ? t("policyOrder.continueWithPrice", { price }) : t("policyOrder.continue")
              }
              onChange={(next) => {
                setDraft(next)
                setDraftError(null)
                setStep(next ? "confirm" : "vehicle")
              }}
            />

            {step === "vehicle" && (
              <>
                <Card className="mt-3 rounded-[24px] ring-0">
                  <CardContent>
                    <p className="flex items-center gap-2 text-lg font-extrabold tracking-wide text-navy uppercase">
                      <ShieldCheck className="size-5 text-mint-deep" />
                      {t("greenCard.title")}
                    </p>

                    {/* the plate: one of the countries the insurer writes for */}
                    <div className="mt-3 flex gap-2">
                      {catalog.plate_countries.length > 1 && (
                        <Select
                          value={plateCountry}
                          onValueChange={(next) => {
                            setPlateCountry(next)
                            setPlateError(null)
                          }}
                        >
                          <SelectTrigger
                            aria-label={t("order.plateCountry")}
                            className="h-auto shrink-0 gap-1.5 rounded-xl border-0 bg-[#f1f4f8] px-2.5 py-3 shadow-none [&>svg]:size-5 [&>svg]:text-navy-soft [&_span_svg]:size-full"
                          >
                            <Flag code={plateCountry} className="h-6 w-9 rounded-md" />
                          </SelectTrigger>
                          {/* popper: the trigger renders a bare flag, not a SelectValue */}
                          <SelectContent position="popper" align="start">
                            {catalog.plate_countries.map((c) => (
                              <SelectItem key={c} value={c} className="[&_span_svg]:size-full">
                                <Flag code={c} className="h-3.5 w-5 rounded-xs" />
                                {countryLabel(c)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="flex flex-1 items-stretch overflow-hidden rounded-xl bg-[#ECEFF3]">
                        <span className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 bg-[#173A7A] py-3">
                          <Flag code={plateCountry} className="h-4 w-6 rounded-xs" />
                          <span className="text-[10px] leading-none font-bold text-white">
                            {plateCountry.toUpperCase()}
                          </span>
                        </span>
                        <Input
                          value={plate}
                          onChange={(e) => {
                            setPlate(e.target.value.toUpperCase())
                            setPlateError(null)
                          }}
                          placeholder={t("order.platePlaceholder").toLocaleUpperCase()}
                          aria-label={t("order.plateLabel")}
                          className="h-auto min-h-14 min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 text-center text-[26px] font-extrabold tracking-[0.2em] text-navy uppercase shadow-none placeholder:text-[13px] placeholder:font-semibold placeholder:tracking-widest placeholder:text-navy-soft focus-visible:ring-0 md:text-[26px]"
                        />
                      </div>
                    </div>

                    {(plateError || localPlateError) && (
                      <div className="mt-2 px-1 leading-snug">
                        <p className="text-[13px] font-semibold text-pink">
                          {plateError || localPlateError}
                        </p>
                        {(plateError ? (plateErrorHint ?? plateHint) : plateHint) && (
                          <p className="mt-0.5 text-xs font-semibold text-navy-soft">
                            {plateError ? (plateErrorHint ?? plateHint) : plateHint}
                          </p>
                        )}
                      </div>
                    )}

                    {/* saved plates — the account's cars, or a guest's own earlier orders */}
                    {savedVehicles.some((v) => catalog.plate_countries.includes(v.country)) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {savedVehicles
                          .filter((v) => catalog.plate_countries.includes(v.country))
                          .slice(0, 6)
                          .map((v) => {
                            const selected =
                              v.plate === plate.replace(/\s+/g, "") && v.country === plateCountry
                            return (
                              <Button
                                key={String(v.id)}
                                type="button"
                                variant="secondary"
                                size="sm"
                                aria-pressed={selected}
                                onClick={() => {
                                  setPlate(v.plate)
                                  setPlateCountry(v.country)
                                  setPlateError(null)
                                }}
                                className={cn(
                                  "gap-1.5 rounded-full bg-[#f1f4f8] font-bold text-navy",
                                  selected && "ring-2 ring-brand/60",
                                )}
                              >
                                <Flag code={v.country} className="h-3 w-4.5 rounded-xs" />
                                {v.plate}
                              </Button>
                            )
                          })}
                      </div>
                    )}

                    {/* plate → vehicle (make, model, weights) where a registry answers */}
                    <VehicleLookupRow
                      plate={plate}
                      country={plateCountry}
                      ready={plateVerdict?.valid !== false}
                      tone="light"
                      className="mt-2"
                      onVehicle={(vehicle) => setLookedUp(vehicle)}
                    />

                    {/* the insurer's vehicle category — a vignette would say
                        it, a standalone policy asks */}
                    <p className="mt-4 mb-1.5 px-1 text-xs font-extrabold tracking-wider text-navy uppercase">
                      {t("policyOrder.vehicleType")}
                    </p>
                    <ToggleGroup
                      type="single"
                      value={category ? String(category.id) : ""}
                      onValueChange={(id) => {
                        const next = catalog.vehicle_categories.find((c) => String(c.id) === id)
                        if (next) setCategory(next)
                      }}
                      spacing={2}
                      aria-label={t("policyOrder.vehicleType")}
                      className="w-full"
                    >
                      {catalog.vehicle_categories.map((c) => (
                        <ToggleGroupItem
                          key={c.id}
                          value={String(c.id)}
                          className="h-11 min-w-0 flex-1 rounded-full border-2 border-navy/15 bg-transparent text-[14px] font-extrabold text-navy hover:bg-transparent data-[state=on]:border-navy data-[state=on]:bg-navy data-[state=on]:text-white"
                        >
                          {c.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </CardContent>
                </Card>

                {isGuest && (
                  <Card className="mt-3 rounded-[24px] bg-brand-deep/60 text-white ring-0">
                    <CardContent>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t("common.email")}
                        aria-label={t("common.email")}
                        className="h-auto w-full rounded-2xl border-0 bg-brand-tint/70 px-4 py-3.5 text-center text-lg font-semibold text-white shadow-none placeholder:text-white/70 focus-visible:ring-white/40 md:text-lg"
                      />
                    </CardContent>
                  </Card>
                )}

                <Button
                  variant="mint"
                  size="xl"
                  className="mt-4 w-full text-lg tracking-[0.2em]"
                  disabled={!canContinue || validateVehicles.isPending}
                  onClick={continueToPolicy}
                >
                  {validateVehicles.isPending ? (
                    <>
                      <Spinner className="size-5" />
                      {t("order.checkingPlate")}
                    </>
                  ) : (
                    t("order.next")
                  )}
                </Button>
              </>
            )}

            {step === "confirm" && draft && (
              <>
                <p className="mt-3 px-1 text-[15px] font-semibold text-white/90">
                  {t("policyOrder.plateNote")}
                </p>
                <GreenCardSummary
                  draft={draft}
                  plate={plate.trim().toUpperCase()}
                  plateCountry={plateCountry}
                  error={draftError}
                  onEdit={() => setSheetOpen(true)}
                  onRemove={() => {
                    setDraft(null)
                    setDraftError(null)
                    setStep("vehicle")
                  }}
                />

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
                        !isGuest && "cursor-default",
                      )}
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

                {duplicateWarning && (
                  <Alert className="mt-3 rounded-2xl border-0 bg-sun text-[#4a3200]">
                    <AlertTitle className="font-extrabold">{duplicateWarning}</AlertTitle>
                    <AlertDescription className="text-[#4a3200]/90">
                      <p>{t("order.duplicateNote")}</p>
                      <Button
                        variant="outline"
                        size="pill"
                        className="mt-2 border-2 border-[#4a3200]/40 bg-transparent text-[#4a3200]"
                        onClick={() => submit({ allowDuplication: true })}
                      >
                        {t("order.buyAnyway")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="mt-4 flex items-center justify-between px-1">
                  <span className="text-[15px] font-bold text-white/90">
                    {t("policyOrder.total")}
                  </span>
                  <span className="text-[26px] font-extrabold text-white">
                    {formatPrice(payTotal, "EUR")}
                  </span>
                </div>
                {activePromo?.promo && (
                  <p className="px-1 text-[13px] font-semibold text-white/85">
                    {t("order.promoOff", {
                      code: activePromo.promo.code ?? activePromo.promo.name,
                      discount: formatPrice(activePromo.discount_eur, "EUR"),
                      subtotal: formatPrice(total, "EUR"),
                    })}
                  </p>
                )}
                <Button
                  variant="mint"
                  size="xl"
                  className="mt-3 w-full text-lg tracking-[0.2em]"
                  disabled={!terms || (isGuest && !emailValid) || promoChecking}
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

function StepIndicator({ step }: { step: "vehicle" | "confirm" }) {
  const { t } = useT()
  const item = (active: boolean, done: boolean, index: string, label: string) => (
    <span
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-lg font-bold",
        active ? "bg-white text-navy" : done ? "text-white/90" : "text-white/60",
      )}
    >
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-[15px] font-bold",
          active ? "bg-brand text-white" : done ? "bg-white text-brand" : "bg-white/40 text-white",
        )}
      >
        {done ? <Check className="size-4" strokeWidth={3.5} /> : index}
      </span>
      {label}
    </span>
  )
  return (
    <div className="mt-2 flex rounded-full bg-white/25 p-1">
      {item(step === "vehicle", step === "confirm", "1", t("policyOrder.stepVehicle"))}
      {item(step === "confirm", false, "2", t("policyOrder.stepConfirm"))}
    </div>
  )
}
