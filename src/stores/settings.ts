import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * Device-local preferences — nothing here is sent to the API as state; the
 * catalog query reads `currency` to ask GET /public/catalog/products for
 * prices in that currency. Persisted so the choice survives reloads, and
 * kept apart from the auth store so logging out doesn't reset it.
 *
 * The API accepts any ISO code present in its exchange table; this is the
 * curated subset offered in the UI (the euro countries we sell for, the
 * neighbours' currencies, and the usual travellers' currencies).
 */
export const CURRENCIES = [
  "EUR",
  "UAH",
  "USD",
  "GBP",
  "CHF",
  "CZK",
  "PLN",
  "HUF",
  "RON",
  "BGN",
] as const

export type Currency = (typeof CURRENCIES)[number]

export const DEFAULT_CURRENCY: Currency = "EUR"

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value)
}

interface SettingsState {
  currency: Currency
  setCurrency: (currency: Currency) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      currency: DEFAULT_CURRENCY,
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: "vignette-settings",
      // a stale persisted code that is no longer offered falls back to EUR
      merge: (persisted, current) => {
        const stored = (persisted as Partial<SettingsState> | undefined)?.currency
        return {
          ...current,
          currency: stored && isCurrency(stored) ? stored : DEFAULT_CURRENCY,
        }
      },
    }
  )
)
