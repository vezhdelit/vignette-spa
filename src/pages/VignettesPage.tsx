import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { TriangleAlert } from "lucide-react"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty"
import { apiErrorMessage } from "@/lib/api"
import { useT } from "@/i18n"
import { EMPTY_CATALOG, productsFor, tunnelsFor, useCatalog } from "@/queries/catalog"
import { CountryCarousel } from "@/components/vignettes/CountryCarousel"
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/vignettes/ProductCard"
import { OrderSheet } from "@/components/order/OrderSheet"
import type { CatalogProduct } from "@/types/api"

export function VignettesPage() {
  const { t } = useT()
  const catalogQuery = useCatalog()
  const catalog = catalogQuery.data ?? EMPTY_CATALOG
  const loaded = catalogQuery.isSuccess
  const { countries } = catalog
  const [country, setCountry] = useState("ro")
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (loaded && !countries.includes(country) && countries.length > 0) {
      setCountry(countries[0])
    }
  }, [loaded, countries, country])

  // deep link: /vignettes?country=ro&product=<name> opens the order sheet
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (!loaded) return
    const wantedCountry = searchParams.get("country")
    const wantedProduct = searchParams.get("product")
    if (wantedCountry && countries.includes(wantedCountry.toLowerCase())) {
      setCountry(wantedCountry.toLowerCase())
    }
    if (wantedProduct) {
      const match = catalog.products.find((p) => p.name === wantedProduct)
      if (match) {
        setCountry(match.country)
        setSelectedProduct(match)
        setSheetOpen(true)
      }
    }
    if (wantedCountry || wantedProduct) setSearchParams({}, { replace: true })
  }, [loaded, searchParams, countries, catalog.products, setSearchParams])

  const products = productsFor(catalog, country)
  // Austria's section tolls, the Swiss Munt La Schera — most countries have
  // none, and then the section simply isn't there.
  const tunnels = tunnelsFor(catalog, country)

  return (
    <div className="-mx-4">
      <CountryCarousel
        countries={countries}
        selected={country}
        onSelect={setCountry}
      />

      <div className="mt-5 space-y-4 px-4">
        {catalogQuery.isPending ? (
          <>
            <ProductCardSkeleton />
            <ProductCardSkeleton />
          </>
        ) : catalogQuery.isError ? (
          <Alert variant="destructive" className="rounded-[28px] border-0 bg-white/90">
            <TriangleAlert />
            <AlertTitle className="font-bold">{t("catalog.loadErrorTitle")}</AlertTitle>
            <AlertDescription className="font-medium text-navy-soft">
              {apiErrorMessage(catalogQuery.error, t("catalog.loadErrorBody"))}
            </AlertDescription>
            <AlertAction>
              <Button variant="brand" size="sm" onClick={() => void catalogQuery.refetch()}>
                {t("common.retry")}
              </Button>
            </AlertAction>
          </Alert>
        ) : products.length === 0 && tunnels.length === 0 ? (
          <Empty className="border-0 pt-8">
            <EmptyHeader>
              <EmptyDescription className="font-semibold text-white/90">
                {t("catalog.empty")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {products.map((product) => (
              <ProductCard
                key={product.name}
                product={product}
                onSelect={() => {
                  setSelectedProduct(product)
                  setSheetOpen(true)
                }}
              />
            ))}
            {tunnels.length > 0 && (
              <>
                <h2 className="pt-3 pl-1 text-xs font-extrabold tracking-[0.2em] text-white/90 uppercase">
                  {t("catalog.tunnels")}
                </h2>
                {tunnels.map((product) => (
                  <ProductCard
                    key={product.name}
                    product={product}
                    onSelect={() => {
                      setSelectedProduct(product)
                      setSheetOpen(true)
                    }}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      <OrderSheet
        product={selectedProduct}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSwitchCountry={(c) => {
          setSheetOpen(false)
          setCountry(c)
          window.scrollTo({ top: 0, behavior: "smooth" })
        }}
      />
    </div>
  )
}
