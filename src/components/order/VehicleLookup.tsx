import { useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage } from "@/lib/api"
import { useT } from "@/i18n"
import { useLookupSupport, useVehicleLookup } from "@/queries/vehicles"
import { track } from "@/lib/insights"
import { cn } from "@/lib/utils"
import type { VehicleLookup as VehicleLookupResult } from "@/types/api"

/** "BMW 530I · 2017 · blue sedan · petrol · 1998 cm³" from whatever came back. */
export function vehicleSummary(vehicle: VehicleLookupResult): string {
  const words = (value: string | null) => (value ? value.replace(/_/g, " ") : null)
  return [
    [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || null,
    vehicle.year ? String(vehicle.year) : null,
    [words(vehicle.color), words(vehicle.body_type)].filter(Boolean).join(" ") || null,
    words(vehicle.fuel_type),
    vehicle.engine_capacity ? `${vehicle.engine_capacity} cm³` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * "Find my vehicle" — resolves the typed plate through
 * `GET /public/vehicles/lookup` and hands back the VIN a Romanian or Moldovan
 * vignette needs, instead of asking the user to read it off the windscreen.
 *
 * Renders nothing unless the plate's country actually resolves: the supported
 * list comes from the API (`lookup/supported-countries`), so a registry added
 * server-side lights this up without a release here. The registry being down
 * (`lookup_unavailable`) must never block checkout — it only means the VIN
 * has to be typed, so failures are a toast, not a form error.
 */
export function VehicleLookupRow({
  plate,
  country,
  onVehicle,
  ready = true,
  tone = "light",
  className,
}: {
  plate: string
  country: string
  /** the resolved vehicle — the caller decides what to fill in (VIN, usually) */
  onVehicle: (vehicle: VehicleLookupResult) => void
  /**
   * Whether the plate is worth asking about — pass the local rules verdict.
   * A plate that fails its country's format cannot be in the registry, so
   * offering the lookup would only spend a call to say so.
   */
  ready?: boolean
  /** "dark" for the sheet's blue cards, "light" for white ones */
  tone?: "light" | "dark"
  className?: string
}) {
  const { t } = useT()
  const { supported } = useLookupSupport(country)
  const lookup = useVehicleLookup()
  // tagged with the plate it was resolved for, so editing the plate drops the
  // stale vehicle without an effect
  const [found, setFound] = useState<{ key: string; vehicle: VehicleLookupResult } | null>(
    null
  )
  const key = `${country}:${plate.trim().toUpperCase()}`
  const resolved = found?.key === key ? found.vehicle : null

  if (!supported || !ready || plate.trim().length < 3) return null

  const run = async () => {
    try {
      const vehicle = await lookup.mutateAsync({ plate: plate.trim(), country })
      // Both outcomes are the same event with a different `found` — a lookup
      // that resolves nothing is the interesting half, because it is what
      // says which registries are worth having. The plate itself never
      // leaves the browser here: only the country and the verdict.
      track("vehicle.lookup_used", { country, found: true })
      setFound({ key, vehicle })
      onVehicle(vehicle)
      if (!vehicle.vin_code) {
        toast.info(t("lookup.noVin"))
      }
    } catch (error) {
      track("vehicle.lookup_used", { country, found: false })
      setFound(null)
      toast.error(apiErrorMessage(error, t("lookup.failed")))
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Button
        type="button"
        variant={tone === "dark" ? "secondary" : "outline"}
        onClick={run}
        disabled={lookup.isPending}
        className={cn(
          "h-auto w-full gap-2 rounded-xl py-2.5 text-[13px] font-extrabold tracking-wider uppercase",
          tone === "dark"
            ? "bg-white/15 text-white hover:bg-white/25"
            : "border-[#e3ebf3] bg-[#f1f4f8] text-brand hover:bg-[#e8edf3] hover:text-brand"
        )}
      >
        {lookup.isPending ? <Spinner className="size-4" /> : <Search className="size-4" />}
        {lookup.isPending ? t("lookup.pending") : t("lookup.action")}
      </Button>
      {resolved && (
        <p
          className={cn(
            "px-1 text-[13px] leading-snug font-semibold",
            tone === "dark" ? "text-white/85" : "text-navy-soft"
          )}
        >
          {vehicleSummary(resolved) || t("lookup.found")}
          {resolved.vin_code ? ` · ${t("lookup.vin", { vin: resolved.vin_code })}` : ""}
        </p>
      )}
    </div>
  )
}
