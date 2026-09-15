/**
 * The public vehicle endpoints — plate validation and plate → vehicle lookup.
 *
 * All four take the client credential only (no user token: a plate is typed
 * before sign-in), so every hook here passes `auth: false` and none of them
 * waits for the session bootstrap — the order form can validate on first
 * paint.
 *
 *   GET  /public/vehicles/plate-rules              the rules as data (matcher in lib/plate-rules.ts)
 *   GET  /public/vehicles/plate-rules/vectors      conformance cases for that matcher
 *   GET  /public/vehicles/lookup/supported-countries
 *   GET  /public/vehicles/lookup                   plate → VIN, make, model, …
 *   POST /public/vehicles/validate                 the server's own verdict, per vehicle
 */
import { useCallback } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { apiResult } from "@/lib/api"
import { apiLanguage, useLanguage } from "@/i18n"
import { checkPlate, type PlateVerdict } from "@/lib/plate-rules"
import type {
  PlateRulesManifest,
  PlateRuleVectors,
  VehicleCheck,
  VehicleLookup,
  VehicleLookupCountry,
  VehiclesValidateResult,
} from "@/types/api"

export const vehicleKeys = {
  all: ["vehicles"] as const,
  /** the served copy is per language — the messages in it differ */
  plateRules: (language: string) => ["vehicles", "plate-rules", language] as const,
  plateRuleVectors: ["vehicles", "plate-rules", "vectors"] as const,
  lookupCountries: ["vehicles", "lookup-countries"] as const,
}

/* ------------------------------------------------------------ plate rules */

// per language: the copy holds that language's messages
const cacheKey = (language: string) => `vignette-plate-rules:${language}`

/**
 * The last manifest this browser saw. The rules only change with a deploy and
 * the endpoint ETags on its version, so re-fetching is a 304 — but a failed
 * fetch (offline, first paint) must not leave the form with no rules at all,
 * hence the copy.
 */
function cachedManifest(language: string): PlateRulesManifest | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(language))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as PlateRulesManifest
    return parsed?.version && parsed?.countries ? parsed : undefined
  } catch {
    return undefined
  }
}

async function fetchPlateRules(language: string): Promise<PlateRulesManifest> {
  const manifest = await apiResult<PlateRulesManifest>("/public/vehicles/plate-rules", {
    auth: false,
    // the UI's language, not the browser's Accept-Language — the copy sits
    // under fields written in that language
    query: { lang: language },
  })
  try {
    localStorage.setItem(cacheKey(language), JSON.stringify(manifest))
  } catch {
    /* private mode / quota — the query cache still has it for this session */
  }
  return manifest
}

/**
 * The plate rules manifest. Seeded from the browser copy so validation works
 * before (and without) a successful fetch, then revalidated in the background
 * — `initialDataUpdatedAt: 0` makes the seeded copy count as stale, and the
 * browser's own HTTP cache turns the refetch into a 304 until the rules
 * actually change.
 */
export function usePlateRules() {
  // switching language is a different document, so a different query
  const language = useLanguage()
  return useQuery({
    queryKey: vehicleKeys.plateRules(language),
    queryFn: () => fetchPlateRules(language),
    initialData: () => cachedManifest(language),
    initialDataUpdatedAt: 0,
    staleTime: 60 * 60_000,
    gcTime: Infinity,
    retry: 1,
  })
}

/**
 * `(plate, country) => verdict`, or null until the manifest is available —
 * callers must treat null as "no local opinion" and let the server decide,
 * never as a rejection.
 */
export function usePlateValidator(): (plate: string, country: string) => PlateVerdict | null {
  const manifest = usePlateRules().data
  return useCallback(
    (plate: string, country: string) =>
      manifest ? checkPlate(manifest, plate, country) : null,
    [manifest]
  )
}

/** The conformance cases for the matcher — the dev self-check reads these. */
export function usePlateRuleVectors({ enabled = true } = {}) {
  return useQuery({
    queryKey: vehicleKeys.plateRuleVectors,
    queryFn: () =>
      apiResult<PlateRuleVectors>("/public/vehicles/plate-rules/vectors", {
        auth: false,
      }),
    enabled,
    staleTime: 60 * 60_000,
    retry: 1,
  })
}

/* ----------------------------------------------------------------- lookup */

/**
 * Which plate countries can be resolved to a vehicle, and which fields each
 * can fill. Gate the "find my vehicle" affordance on this rather than
 * hardcoding `ua`: a new registry is a server-side change.
 */
export function useVehicleLookupCountries() {
  return useQuery({
    queryKey: vehicleKeys.lookupCountries,
    queryFn: () =>
      apiResult<VehicleLookupCountry[]>("/public/vehicles/lookup/supported-countries", {
        auth: false,
      }),
    staleTime: Infinity,
    retry: 1,
  })
}

/** Whether `country` resolves, and what a lookup can fill in for it. */
export function useLookupSupport(country: string) {
  const { data } = useVehicleLookupCountries()
  const entry = data?.find((item) => item.country === country.toLowerCase())
  return {
    supported: Boolean(entry),
    fields: entry?.fields ?? [],
    /** false while the list is still loading — nothing is offered yet */
    known: Boolean(data),
  }
}

/**
 * Resolve one plate. Errors are meaningful and worth surfacing verbatim:
 * `vehicle_not_found` (400) — the registry has no such plate;
 * `unsupported_country` (400); `lookup_unavailable` (502) — the registry is
 * down, so the user should type the VIN instead of being blocked.
 */
export function useVehicleLookup() {
  return useMutation({
    mutationFn: ({ plate, country }: { plate: string; country: string }) =>
      apiResult<VehicleLookup>("/public/vehicles/lookup", {
        auth: false,
        query: { plate, country },
      }),
  })
}

/* --------------------------------------------------------------- validate */

/**
 * The server's own verdict on a set of plates, before an order is built. An
 * invalid plate is a 200 with `valid: false` (a 400 means the request itself
 * was malformed), and every row echoes the NORMALIZED plate — adopt it, that
 * is what the order will store.
 */
export function useValidateVehicles() {
  return useMutation({
    mutationFn: (vehicles: { plate: string; country: string }[]) =>
      apiResult<VehiclesValidateResult>("/public/vehicles/validate", {
        method: "POST",
        auth: false,
        // the `hint` on an invalid row follows this language
        query: { lang: apiLanguage() },
        body: { vehicles },
      }),
  })
}

/** The first failing row of a validate response, if any. */
export function firstInvalid(result: VehiclesValidateResult): VehicleCheck | null {
  return result.vehicles.find((vehicle) => !vehicle.valid) ?? null
}
