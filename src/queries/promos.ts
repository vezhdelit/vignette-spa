/**
 * Promo codes — `POST /public/me/promos/validate`.
 *
 * An order carries at most one promo: the code the user typed (`promo_code`
 * on `POST /public/me/orders`) or, without one, the best auto-apply campaign
 * the server finds for that order. This endpoint prices either against the
 * exact order the app is about to place — product, period, cars, flex — and
 * returns the discount and the `pay_price_eur` the payment link will charge,
 * so the sheet can show it before the user commits. Nothing is reserved
 * until the order is created.
 *
 * Money here is always EUR (the charge settles in EUR whatever the display
 * currency is), and the endpoint works signed in, as a guest, or with no
 * token at all — per-user limits then key on the email / app install we send.
 *
 * Rate limits: 60/h per IP, 30/h per email and per install. So the auto
 * preview is a cached query (one call per distinct order shape) and the
 * typed code is only ever checked when the user asks.
 */
import { useQuery } from "@tanstack/react-query"
import { ApiRequestError, apiResult } from "@/lib/api"
import { getInstallationId } from "@/lib/webpush"
import { useSessionScope } from "@/queries/session"
import type { PromoValidateBody, PromoValidateResult } from "@/types/api"

export const promoKeys = {
  all: (scope: string) => ["promos", scope] as const,
  validate: (scope: string, signature: string) =>
    ["promos", scope, "validate", signature] as const,
}

/** Everything but the install id, which this module fills in. */
export type PromoValidateInput = Omit<PromoValidateBody, "installation_id">

export function validatePromo(input: PromoValidateInput): Promise<PromoValidateResult> {
  const installationId = getInstallationId()
  return apiResult<PromoValidateResult>("/public/me/promos/validate", {
    method: "POST",
    body: {
      ...input,
      ...(installationId ? { installation_id: installationId } : {}),
    },
  })
}

/**
 * Every reason a code can be unusable (services/promo.js ERROR_MESSAGES).
 * They arrive as 400s from validate (`field: "code"`) and from order creation
 * (`field: "promo_code"`) alike, since a code can stop applying in between —
 * the message is written for the user, so show it as-is.
 */
const PROMO_ERROR_TYPES = new Set([
  "promo_disabled",
  "promo_invalid",
  "promo_exhausted",
  "promo_user_limit",
  "promo_not_eligible",
  "promo_no_effect",
  "promo_requires_account",
  "promo_not_applicable",
  "promo_rate_limited",
])

export function isPromoError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && PROMO_ERROR_TYPES.has(error.type)
}

/**
 * The auto-apply campaign for an order shape (`code: null`), if any: a 200
 * with `valid: false` means none applies. Cached per order shape and never
 * retried, so switching back and forth between periods spends one call each,
 * not one per render — and a rate-limited answer doesn't hammer.
 *
 * Pass `null` (or `enabled: false`) to ask nothing at all.
 */
export function useAutoPromo(
  input: PromoValidateInput | null,
  { enabled = true } = {}
) {
  const { scope, ready } = useSessionScope()
  return useQuery({
    queryKey: promoKeys.validate(scope, JSON.stringify(input)),
    queryFn: () => validatePromo(input!),
    enabled: ready && enabled && input !== null,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
