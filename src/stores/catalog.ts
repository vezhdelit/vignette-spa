import { create } from "zustand"
import { apiResult } from "@/lib/api"
import { VIGNETTE_COUNTRIES } from "@/lib/countries"
import type { CatalogProduct, FlexOption } from "@/types/api"

interface CatalogState {
  products: CatalogProduct[]
  flexOptions: FlexOption[]
  countries: string[]
  loading: boolean
  loaded: boolean
  error: string | null

  load: () => Promise<void>
  productsFor: (country: string) => CatalogProduct[]
  /** the tier flagged is_default by GET /public/catalog/products/flex */
  defaultFlexType: () => "default" | "expanded"
}

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  products: [],
  flexOptions: [],
  countries: [...VIGNETTE_COUNTRIES],
  loading: false,
  loaded: false,
  error: null,

  async load() {
    if (get().loading || get().loaded) return
    set({ loading: true, error: null })
    try {
      const [products, flexOptions] = await Promise.all([
        apiResult<CatalogProduct[]>("/public/catalog/products", {
          query: { currency: "EUR", type: "vignette" },
        }),
        apiResult<FlexOption[]>("/public/catalog/products/flex").catch(
          () => [] as FlexOption[]
        ),
      ])

      // carousel = the countries that actually have products, in brand order
      const available = new Set(products.map((p) => p.country))
      const countries = VIGNETTE_COUNTRIES.filter((c) => available.has(c))
      for (const c of available) {
        if (!countries.includes(c as (typeof VIGNETTE_COUNTRIES)[number])) {
          countries.push(c as (typeof VIGNETTE_COUNTRIES)[number])
        }
      }

      set({
        products,
        flexOptions: flexOptions.filter((f) => f.enabled),
        countries: countries.length ? countries : [...VIGNETTE_COUNTRIES],
        loading: false,
        loaded: true,
      })
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load catalog",
      })
    }
  },

  defaultFlexType() {
    const flagged = get().flexOptions.find((f) => f.is_default)?.type
    return flagged === "expanded" ? "expanded" : "default"
  },

  productsFor(country: string) {
    return get()
      .products.filter(
        (p) => p.country === country && Object.keys(p.price).length > 0
      )
      .sort((a, b) => a.priority - b.priority)
  },
}))
