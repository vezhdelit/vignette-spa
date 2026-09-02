const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** unix seconds → "2 Sep 2026" */
export function formatDate(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—"
  const d = new Date(unixSeconds * 1000)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** unix seconds → "2 Sep" */
export function formatDayMonth(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—"
  const d = new Date(unixSeconds * 1000)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

const pad = (n: number) => String(n).padStart(2, "0")

/** unix seconds → "02.09 18:24" */
export function formatDotDateTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—"
  const d = new Date(unixSeconds * 1000)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** unix seconds → "01.10 23:59" (no time when it's exactly midnight boundary is fine to keep) */
export function formatDotDate(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return "—"
  const d = new Date(unixSeconds * 1000)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}

export function formatMoney(amount: number, currency = "EUR"): string {
  const symbol = currency === "EUR" ? "€" : currency
  // trim trailing zeros but keep up to 2 decimals: 14.95 €, 9.7 €, 3 €
  const rounded = Math.round(amount * 100) / 100
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return `${text} ${symbol}`
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

/** "30" → "30 days", "365" → "1 year" */
export function periodLabel(period: string | number): string {
  const days = Number(period)
  if (!Number.isFinite(days)) return String(period)
  if (days === 365 || days === 366) return "1 year"
  if (days === 1) return "1 day"
  return `${days} days`
}
