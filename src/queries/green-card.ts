/**
 * Green Card pricing on the public API (vignette.id docs/insurance/README.md).
 *
 *   GET  /public/catalog/green-card          the rules — client credential, cached per launch
 *   POST /public/me/green-card/calculate     the SERVER's signed price; the app never computes one
 *
 * Pricing is per insurance product; the policies themselves are shared by
 * every product (queries/insurances.ts) and ride on every order object as
 * `insurance[]`, so the Home cards need no list call of their own.
 */
import { useQuery } from "@tanstack/react-query"
import { apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import type { GreenCardCalculateBody, GreenCardCalculation, GreenCardCatalog } from "@/types/api"

export const greenCardKeys = {
  catalog: ["green-card", "catalog"] as const,
}

/** The rules, once per launch — they change with deploys, not with users. */
export function useGreenCardCatalog() {
  const { ready } = useSessionScope()
  return useQuery({
    queryKey: greenCardKeys.catalog,
    queryFn: () => apiResult<GreenCardCatalog>("/public/catalog/green-card"),
    enabled: ready,
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  })
}

/**
 * The price of one policy, signed by the server. Promo-validate rate limits
 * (60/h per IP, 30/h per install), so callers debounce and never calculate
 * per keystroke; the result expires at `expires_at`.
 */
export function calculateGreenCard(body: GreenCardCalculateBody): Promise<GreenCardCalculation> {
  return apiResult<GreenCardCalculation>("/public/me/green-card/calculate", {
    method: "POST",
    body,
  })
}
