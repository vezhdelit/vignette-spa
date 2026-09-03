import { useQuery } from "@tanstack/react-query"
import { apiResult } from "@/lib/api"
import { VIGNETTE_COUNTRIES } from "@/lib/countries"
import { useSessionScope } from "@/queries/session"
import type { CatalogProduct, FlexOption } from "@/types/api"

export interface Catalog {
  products: CatalogProduct[]
  /** flex tiers that are actually enabled */
  flexOptions: FlexOption[]
  /** the countries that have products, in brand order (carousel) */
  countries: string[]
}

/** What consumers render before the catalog has arrived. */
export const EMPTY_CATALOG: Catalog = {
  products: [],
  flexOptions: [],
  countries: [...VIGNETTE_COUNTRIES],
}

export const catalogKeys = {
  all: ["catalog"] as const,
}

async function fetchCatalog(): Promise<Catalog> {
  const [products, flexOptions] = await Promise.all([
    apiResult<CatalogProduct[]>("/public/catalog/products", {
      query: { currency: "EUR", type: "vignette" },
    }),
    apiResult<FlexOption[]>("/public/catalog/products/flex").catch(
      () => [] as FlexOption[]
    ),
  ])

  const available = new Set(products.map((p) => p.country))
  const countries: string[] = VIGNETTE_COUNTRIES.filter((c) => available.has(c))
  for (const c of available) {
    if (!countries.includes(c)) countries.push(c)
  }

  return {
    products,
    flexOptions: flexOptions.filter((f) => f.enabled),
    countries: countries.length ? countries : [...VIGNETTE_COUNTRIES],
  }
}

/**
 * The product catalog (+ flex tiers). Not session-scoped — it's the same
 * for every caller of this client — and changes rarely, so it stays fresh
 * for a while.
 */
export function useCatalog() {
  const { ready } = useSessionScope()
  return useQuery({
    queryKey: catalogKeys.all,
    queryFn: fetchCatalog,
    enabled: ready,
    staleTime: 5 * 60_000,
  })
}

/** Sellable products of one country, in display priority. */
export function productsFor(catalog: Catalog, country: string): CatalogProduct[] {
  return catalog.products
    .filter((p) => p.country === country && Object.keys(p.price).length > 0)
    .sort((a, b) => a.priority - b.priority)
}

/** The flex tier flagged is_default by GET /public/catalog/products/flex. */
export function defaultFlexType(catalog: Catalog): "default" | "expanded" {
  const flagged = catalog.flexOptions.find((f) => f.is_default)?.type
  return flagged === "expanded" ? "expanded" : "default"
}
