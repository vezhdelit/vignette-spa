import { useMemo } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { api, apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import type {
  ReferralEarning,
  ReferralInvited,
  ReferralLookup,
  Referrals,
} from "@/types/api"

/**
 * Referrals.
 *
 * Vocabulary, kept exactly as the API uses it: the INVITER shared the link
 * and is paid; the INVITED used it and their purchases are what pay. Never
 * "referrer"/"referral" — one letter apart, opposite ends of the same link.
 *
 * Money is integer cents and lands in the wallet's `balance`, so a reward is
 * spendable at checkout like any other balance.
 */

export const referralKeys = {
  all: (scope: string) => ["referrals", scope] as const,
  summary: (scope: string) => ["referrals", scope, "summary"] as const,
  invited: (scope: string) => ["referrals", scope, "invited"] as const,
  earnings: (scope: string) => ["referrals", scope, "earnings"] as const,
  /** not session-scoped: the code is resolved before anyone is signed in */
  lookup: (code: string) => ["referrals", "lookup", code] as const,
}

/** GET /public/me/referrals — my code, link, totals and who invited me. */
export function useReferrals() {
  const { scope, ready, guest } = useSessionScope()
  return useQuery({
    queryKey: referralKeys.summary(scope),
    queryFn: () => apiResult<Referrals>("/public/me/referrals"),
    enabled: ready && !guest,
  })
}

function usePagedReferrals<T>(
  key: readonly unknown[],
  path: string,
  enabled: boolean
) {
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam }) => {
      const envelope = await api<T[]>(path, { query: { page: pageParam } })
      return {
        items: envelope.result,
        pagination: envelope.pages ?? { total: 1, current: pageParam },
      }
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.current < last.pagination.total
        ? last.pagination.current + 1
        : undefined,
    enabled,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  )

  const pagination = query.data?.pages.at(-1)?.pagination ?? { total: 1, current: 1 }

  return { ...query, items, pagination }
}

/**
 * GET /public/me/referrals/invited — the people I invited, newest first,
 * each with what they have earned me. Emails are masked server-side.
 */
export function useInvitedFriends({ enabled = true } = {}) {
  const { scope, ready, guest } = useSessionScope()
  return usePagedReferrals<ReferralInvited>(
    referralKeys.invited(scope),
    "/public/me/referrals/invited",
    ready && !guest && enabled
  )
}

/** GET /public/me/referrals/earnings — one row per reward paid to me. */
export function useReferralEarnings({ enabled = true } = {}) {
  const { scope, ready, guest } = useSessionScope()
  return usePagedReferrals<ReferralEarning>(
    referralKeys.earnings(scope),
    "/public/me/referrals/earnings",
    ready && !guest && enabled
  )
}

/**
 * GET /public/referrals/:code — needs the client id only, no user token, so
 * an invite can be shown before sign-in ("Invited by an***@gmail.com").
 * A 404 (referral_code_invalid) is the normal answer for a stale code, so
 * this never retries.
 */
export function useReferralLookup(code: string | null) {
  return useQuery({
    queryKey: referralKeys.lookup(code ?? ""),
    queryFn: () =>
      apiResult<ReferralLookup>(`/public/referrals/${encodeURIComponent(code!)}`, {
        auth: false,
      }),
    enabled: Boolean(code),
    retry: false,
    staleTime: 5 * 60_000,
  })
}
