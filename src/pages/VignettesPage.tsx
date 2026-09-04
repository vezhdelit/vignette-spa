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
import { EMPTY_CATALOG, productsFor, useCatalog } from "@/queries/catalog"
import { CountryCarousel } from "@/components/vignettes/CountryCarousel"
import {
  ProductCard,
  ProductCardSkeleton,
} from "@/components/vignettes/ProductCard"
import { OrderSheet } from "@/components/order/OrderSheet"
import type { CatalogProduct } from "@/types/api"

export function VignettesPage() {
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
            <AlertTitle className="font-bold">Couldn't load the catalog</AlertTitle>
            <AlertDescription className="font-medium text-navy-soft">
              {apiErrorMessage(catalogQuery.error, "Failed to load catalog")}
            </AlertDescription>
            <AlertAction>
              <Button variant="brand" size="sm" onClick={() => void catalogQuery.refetch()}>
                Retry
              </Button>
            </AlertAction>
          </Alert>
        ) : products.length === 0 ? (
          <Empty className="border-0 pt-8">
            <EmptyHeader>
              <EmptyDescription className="font-semibold text-white/90">
                No vignettes available for this country yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          products.map((product) => (
            <ProductCard
              key={product.name}
              product={product}
              onSelect={() => {
                setSelectedProduct(product)
                setSheetOpen(true)
              }}
            />
          ))
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
