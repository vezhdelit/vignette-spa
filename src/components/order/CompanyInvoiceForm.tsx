import { Building2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { countryLabel, countryOptions, Flag } from "@/lib/countries"
import { useT } from "@/i18n"
import { cn } from "@/lib/utils"
import type { BillingCompany, CreateOrderCompany } from "@/types/api"

/** The six fields of POST /public/me/orders `company`, as typed. */
export type CompanyDraft = CreateOrderCompany

export const EMPTY_COMPANY: CompanyDraft = {
  name: "",
  tax_id: "",
  address: "",
  city: "",
  zip: "",
  country: "",
}

/** Every field filled — what the server requires once `company` is sent. */
export const companyComplete = (draft: CompanyDraft) =>
  Object.values(draft).every((value) => value.trim().length > 0)

/** The body to send: trimmed, country lower-cased, or null when off. */
export const companyPayload = (
  enabled: boolean,
  draft: CompanyDraft,
): CreateOrderCompany | null =>
  enabled && companyComplete(draft)
    ? {
        name: draft.name.trim(),
        tax_id: draft.tax_id.trim(),
        address: draft.address.trim(),
        city: draft.city.trim(),
        zip: draft.zip.trim(),
        country: draft.country.trim().toLowerCase(),
      }
    : null

const FIELD =
  "h-auto w-full rounded-xl border-0 bg-white/15 px-3.5 py-3 text-[15px] font-semibold text-white shadow-none placeholder:text-white/60 focus-visible:ring-white/40 md:text-[15px]"

/**
 * "Invoice for a company" on the confirm step: a checkbox that opens the six
 * billing fields the invoice PDF prints (name, VAT id, address, city, postal
 * code, country), with the account's previously used companies offered as
 * one-tap chips (GET /public/me/companies — guest ok, its own orders only).
 *
 * The server stores the fields exactly as sent and the invoice cannot be
 * changed once issued, hence the warning. A server-side rejection
 * (`invalid_company`, with `field`) comes back through `error`.
 */
export function CompanyInvoiceForm({
  enabled,
  onEnabled,
  draft,
  onDraft,
  saved,
  error,
  disabled,
}: {
  enabled: boolean
  onEnabled: (next: boolean) => void
  draft: CompanyDraft
  onDraft: (next: CompanyDraft) => void
  saved: BillingCompany[]
  /** the server's message for a refused company, shown under the form */
  error?: string | null
  disabled?: boolean
}) {
  const { t } = useT()

  const set = (field: keyof CompanyDraft) => (value: string) =>
    onDraft({ ...draft, [field]: value })

  const isSelected = (company: BillingCompany) =>
    draft.tax_id.trim() === company.tax_id &&
    draft.country === company.country &&
    draft.name.trim() === (company.name ?? "")

  const pick = (company: BillingCompany) =>
    onDraft({
      name: company.name ?? "",
      tax_id: company.tax_id,
      address: company.address ?? "",
      city: company.city ?? "",
      zip: company.zip ?? "",
      country: company.country,
    })

  return (
    <div className="mt-4">
      <label className="flex cursor-pointer items-start gap-3 px-1">
        <Checkbox
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(v) => onEnabled(v === true)}
          className="mt-0.5 size-6 shrink-0 rounded-md border-2 border-white/80 bg-white/15 data-checked:border-white data-checked:bg-white data-checked:text-brand"
        />
        <span className="min-w-0 flex-1 leading-snug">
          <span className="flex items-center gap-2 text-[15px] font-extrabold text-white">
            <Building2 className="size-4 shrink-0" />
            {t("order.company.toggle")}
          </span>
          <span className="block text-[13px] font-semibold text-white/75">
            {t("order.company.note")}
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2.5">
          {/* previously used companies — one tap fills the six fields */}
          {saved.length > 0 && (
            <ScrollArea className="-mx-4">
              <div className="flex w-max gap-2 px-4 pb-1">
                {saved.slice(0, 8).map((company) => {
                  const selected = isSelected(company)
                  return (
                    <Button
                      key={String(company.id)}
                      type="button"
                      variant="chip"
                      size="chip"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => pick(company)}
                      className={cn("max-w-56", selected && "ring-2 ring-white/80")}
                      title={company.tax_id}
                    >
                      <Flag code={company.country} className="h-3 w-4.5 shrink-0 rounded-[2px]" />
                      <span className="truncate">{company.name || company.tax_id}</span>
                    </Button>
                  )
                })}
              </div>
              <ScrollBar orientation="horizontal" className="hidden" />
            </ScrollArea>
          )}

          <Input
            value={draft.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder={t("order.company.name")}
            aria-label={t("order.company.name")}
            autoComplete="organization"
            maxLength={200}
            disabled={disabled}
            className={FIELD}
          />
          <Input
            value={draft.tax_id}
            onChange={(e) => set("tax_id")(e.target.value.toUpperCase())}
            placeholder={t("order.company.taxId")}
            aria-label={t("order.company.taxId")}
            maxLength={200}
            disabled={disabled}
            className={cn(FIELD, "uppercase")}
          />
          <Input
            value={draft.address}
            onChange={(e) => set("address")(e.target.value)}
            placeholder={t("order.company.address")}
            aria-label={t("order.company.address")}
            autoComplete="street-address"
            maxLength={200}
            disabled={disabled}
            className={FIELD}
          />
          <div className="flex gap-2.5">
            <Input
              value={draft.zip}
              onChange={(e) => set("zip")(e.target.value)}
              placeholder={t("order.company.zip")}
              aria-label={t("order.company.zip")}
              autoComplete="postal-code"
              maxLength={200}
              disabled={disabled}
              className={cn(FIELD, "w-2/5")}
            />
            <Input
              value={draft.city}
              onChange={(e) => set("city")(e.target.value)}
              placeholder={t("order.company.city")}
              aria-label={t("order.company.city")}
              autoComplete="address-level2"
              maxLength={200}
              disabled={disabled}
              className={cn(FIELD, "flex-1")}
            />
          </div>
          <Select value={draft.country} onValueChange={set("country")} disabled={disabled}>
            <SelectTrigger
              aria-label={t("order.company.country")}
              className={cn(FIELD, "justify-between [&_span_svg]:size-full")}
            >
              {draft.country ? (
                <span className="flex min-w-0 items-center gap-2">
                  <Flag code={draft.country} className="h-3.5 w-5 shrink-0 rounded-[2px]" />
                  <SelectValue />
                </span>
              ) : (
                <>
                  <span className="text-white/60">{t("order.company.country")}</span>
                  <SelectValue />
                </>
              )}
            </SelectTrigger>
            {/* popper: the trigger shows a flag, not a bare <SelectValue>,
                and Radix's item-aligned mode cannot place the list then */}
            <SelectContent position="popper" align="start">
              {countryOptions().map((code) => (
                <SelectItem key={code} value={code}>
                  {countryLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Alert className="rounded-2xl border-0 bg-pink/90 text-white">
            <AlertDescription className="text-[13px] leading-snug font-bold text-white">
              {t("order.company.warning")}
            </AlertDescription>
          </Alert>

          {error && (
            <p className="px-1 text-[13px] font-semibold text-sun">{error}</p>
          )}
          {!error && !companyComplete(draft) && (
            <p className="px-1 text-[13px] font-semibold text-white/80">
              {t("order.company.incomplete")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
