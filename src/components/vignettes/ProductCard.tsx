import {
  MoveVertical,
  Weight,
  Users,
  MoveHorizontal,
  ArrowLeftRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { COUNTRY_NAMES, FlagRect } from "@/lib/countries"
import type { CatalogProduct, ProductRestrictions } from "@/types/api"

/** Products carry CSS color words ("blue", "yellow") — map to the pastel tile look. */
const TILE_COLORS: Record<string, string> = {
  blue: "#e0edff",
  yellow: "#fdf4c5",
  green: "#e0f7e9",
  red: "#ffe4e4",
  orange: "#ffedd9",
  purple: "#efe4ff",
  gray: "#eef1f5",
  grey: "#eef1f5",
}

export function tileColor(color: string | null): string {
  if (!color) return "#e0edff"
  if (/^#([0-9a-f]{6})$/i.test(color)) return `${color}26`
  return TILE_COLORS[color.toLowerCase()] ?? "#e0edff"
}

const RESTRICTION_META: {
  key: keyof ProductRestrictions
  label: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { key: "height", label: "Height", icon: MoveVertical },
  { key: "weight", label: "Weight", icon: Weight },
  { key: "seats", label: "Seats", icon: Users },
  { key: "width", label: "Width", icon: MoveHorizontal },
  { key: "direction", label: "Direction", icon: ArrowLeftRight },
]

/** "Vignette 2A" → "2A"; falls back to the raw vehicle_type ("car"/"van") */
export function productBadge(product: CatalogProduct): string | null {
  const fromTitle = product.title.match(/(\d[A-Za-z])\b/)?.[1]
  return fromTitle ?? product.vehicle_type ?? null
}

export function ProductCard({
  product,
  onSelect,
}: {
  product: CatalogProduct
  onSelect: () => void
}) {
  const restrictions = RESTRICTION_META.filter(
    (r) => product.restrictions?.[r.key]
  )
  const countryName =
    COUNTRY_NAMES[product.country] || product.country.toUpperCase()
  const badge = productBadge(product)

  return (
    <Card className="rounded-[28px] shadow-[0_10px_30px_rgba(0,60,120,0.12)] ring-0">
      <CardContent className="flex gap-3">
        <div
          className="relative flex size-24 shrink-0 items-center justify-center rounded-2xl sm:size-28"
          style={{ backgroundColor: tileColor(product.color) }}
        >
          <img
            src={product.icon}
            alt={product.title}
            className="size-18 object-contain sm:size-22"
            loading="lazy"
          />
          {badge && (
            <Badge className="absolute -right-1 -bottom-1 rounded-lg bg-brand-tint px-1.5 py-0.5 text-[13px] font-extrabold text-white shadow-sm">
              {badge}
            </Badge>
          )}
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="flex items-center gap-2">
            <FlagRect code={product.country} />
            <span className="truncate text-xs font-extrabold tracking-wider text-orange-400 uppercase">
              {countryName}
            </span>
          </p>
          <h3 className="mt-0.5 truncate text-[24px] leading-tight font-extrabold text-navy">
            {product.title}
          </h3>
          <p className="mt-1 text-xs font-bold tracking-[0.15em] text-navy-soft/80 uppercase">
            Restrictions
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {restrictions.length === 0 ? (
              <span className="text-sm font-semibold text-navy-soft">
                No vehicle restrictions
              </span>
            ) : (
              restrictions.map(({ key, label, icon: Icon }) => (
                <Badge
                  key={key}
                  variant="outline"
                  className="h-auto gap-1.5 rounded-xl border-[#e3ebf3] px-2 py-1"
                >
                  <Icon className="size-3.5 shrink-0 text-navy-soft" />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[10px] font-extrabold tracking-wider whitespace-nowrap text-navy uppercase">
                      {label}
                    </span>
                    <span className="text-xs font-extrabold whitespace-nowrap text-pink">
                      {product.restrictions?.[key]}
                    </span>
                  </span>
                </Badge>
              ))
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="border-t-0 bg-transparent pt-0">
        <Button variant="brand" size="xl" className="h-13 w-full text-lg" onClick={onSelect}>
          Select
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ProductCardSkeleton() {
  return (
    <Card className="rounded-[28px] ring-0">
      <CardContent className="flex gap-4">
        <Skeleton className="size-32 shrink-0 rounded-2xl bg-cloud" />
        <div className="flex-1 space-y-3 pt-1">
          <Skeleton className="h-3.5 w-1/2 rounded-full bg-cloud" />
          <Skeleton className="h-5 w-3/4 rounded-full bg-cloud" />
          <Skeleton className="h-3 w-1/3 rounded-full bg-cloud" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-xl bg-cloud" />
            <Skeleton className="h-10 w-24 rounded-xl bg-cloud" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t-0 bg-transparent pt-0">
        <Skeleton className="h-12 w-full rounded-2xl bg-cloud" />
      </CardFooter>
    </Card>
  )
}
