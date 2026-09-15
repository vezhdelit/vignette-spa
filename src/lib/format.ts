/**
 * Display formatting. Anything a human reads goes through here, and anything
 * that reads differently per language asks `Intl` in the active UI language
 * (`src/i18n`) — month names, decimal separators, plural forms.
 *
 * The dotted numeric formats (`02.09`, `02.09 18:24`) are deliberately NOT
 * localised: they are the app's compact day-and-month style, used where space
 * is tight and beside data (plates, order ids) that is never reordered. Only
 * the spelled-out formats and the numbers follow the language.
 */
import { formattingLocale, t } from "@/i18n"

const formatters = new Map<string, Intl.DateTimeFormat>()

function dateFormat(options: Intl.DateTimeFormatOptions, id: string): Intl.DateTimeFormat {
  const language = formattingLocale()
  const key = `${language}:${id}`
  let formatter = formatters.get(key)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(language, options)
    } catch {
      formatter = new Intl.DateTimeFormat("en", options)
    }
    formatters.set(key, formatter)
  }
  return formatter
}

/** unix seconds → "2 Sep 2026", "2 вер. 2026 р." */
export function formatDate(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—"
  return dateFormat({ day: "numeric", month: "short", year: "numeric" }, "date").format(
    new Date(unixSeconds * 1000)
  )
}

/** unix seconds → "2 Sep", "2 вер." */
export function formatDayMonth(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—"
  return dateFormat({ day: "numeric", month: "short" }, "dayMonth").format(
    new Date(unixSeconds * 1000)
  )
}

const pad = (n: number) => String(n).padStart(2, "0")

/** unix seconds → "02.09 18:24" (the compact style, every language) */
export function formatDotDateTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—"
  const d = new Date(unixSeconds * 1000)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** unix seconds → "02.09" */
export function formatDotDate(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—"
  const d = new Date(unixSeconds * 1000)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}

/**
 * Order end_date is either unix seconds or the literal string
 * "YYYY-MM-DD 23:59" (products without a unix validity window).
 * Returns "02.10 23:59"-style text either way.
 */
export function formatEndDate(endDate: number | string | null | undefined): string {
  if (endDate === null || endDate === undefined) return "—"
  if (typeof endDate === "number") return `${formatDotDate(endDate)} 23:59`
  const match = String(endDate).match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(.*))?$/)
  if (match) return `${match[3]}.${match[2]} ${match[4] ?? ""}`.trim()
  return String(endDate)
}

/** Symbols for the currencies the UI offers (stores/settings.ts); unknown codes print as-is. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  UAH: "₴",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
  CZK: "Kč",
  PLN: "zł",
  HUF: "Ft",
  RON: "lei",
  BGN: "лв",
}

const currencySymbol = (currency: string) => CURRENCY_SYMBOLS[currency] ?? currency

const numberFormatters = new Map<string, Intl.NumberFormat>()

/**
 * The amount in the active language's number format ("14.95" / "14,95"), with
 * the currency symbol after it — the app's own layout, so `Intl`'s currency
 * style (which moves the symbol and picks its own code) is not used.
 */
function formatAmount(amount: number, digits: number): string {
  const language = formattingLocale()
  const key = `${language}:${digits}`
  let formatter = numberFormatters.get(key)
  if (!formatter) {
    const options = { maximumFractionDigits: digits, minimumFractionDigits: 0 }
    try {
      formatter = new Intl.NumberFormat(language, options)
    } catch {
      formatter = new Intl.NumberFormat("en", options)
    }
    numberFormatters.set(key, formatter)
  }
  return formatter.format(amount)
}

/** Wallet balance/bonuses and referral income arrive as integer cents. */
export function formatCents(cents: number, currency = "EUR"): string {
  return `${formatAmount(cents / 100, 2)} ${currencySymbol(currency)}`
}

/**
 * Catalog prices are decimal amounts already in the requested currency.
 * Trims trailing zeros but keeps up to 2 decimals: "14.95 €", "9.7 €", "3 €".
 */
export function formatPrice(amount: number, currency = "EUR"): string {
  return `${formatAmount(Math.round(amount * 100) / 100, 2)} ${currencySymbol(currency)}`
}

/** start of today / tomorrow in unix seconds (local time) */
export function dayStart(offsetDays = 0): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return Math.floor(d.getTime() / 1000)
}

export function addDays(unixSeconds: number, days: number): number {
  return unixSeconds + days * 86400
}

/**
 * A product period as a count and its unit, so a layout that stacks the two
 * (the period chip, the order card's badge) doesn't have to split a sentence
 * — which only works in English.
 */
export function periodParts(period: string | number): { count: string; unit: string } {
  const days = Number(period)
  if (!Number.isFinite(days)) return { count: String(period), unit: t("unit.days", { count: 2 }) }
  if (days === 365 || days === 366) return { count: "1", unit: t("unit.years", { count: 1 }) }
  return { count: String(days), unit: t("unit.days", { count: days }) }
}

/** "30" → "30 days", "365" → "1 year" — plural-correct in every language. */
export function periodLabel(period: string | number): string {
  const days = Number(period)
  if (!Number.isFinite(days)) return String(period)
  if (days === 365 || days === 366) return t("period.years", { count: 1 })
  return t("period.days", { count: days })
}
