/**
 * Insurance policies on the public API, every product in one place
 * (vignette.id docs/insurance/README.md).
 *
 *   GET  /public/me/insurances/:id                   one policy — polled while it is being issued
 *   GET  /public/me/insurances/:id/documents/:type   the policy's PDFs, application/pdf
 *
 * Pricing is per product (queries/green-card.ts). The policy object is the
 * same for every product: the shared fields at the top, the product's own
 * under `details`, keyed by `product`.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiBlob, apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import { orderKeys } from "@/queries/orders"
import type { Policy, PolicyDocumentType } from "@/types/api"

export const insuranceKeys = {
  policy: (scope: string, id: number) => ["insurances", scope, "policy", id] as const,
}

const isSettled = (status: Policy["status"] | undefined) =>
  status === "issued" || status === "failed"

/**
 * One policy, polled every 5 s while the insurer is still writing it
 * (`created` / `processing`) and only while the caller shows it. When the
 * poll sees it settle, the order lists are invalidated so the card's copy
 * of the policy catches up too.
 */
export function usePolicy(initial: Policy, { enabled = true } = {}) {
  const { scope, ready } = useSessionScope()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: insuranceKeys.policy(scope, initial.id),
    queryFn: async () => {
      const policy = await apiResult<Policy>(`/public/me/insurances/${initial.id}`)
      if (isSettled(policy.status) && !isSettled(initial.status)) {
        void queryClient.invalidateQueries({ queryKey: orderKeys.all(scope) })
      }
      return policy
    },
    initialData: initial,
    enabled: ready && enabled && !isSettled(initial.status),
    refetchInterval: (query) => (isSettled(query.state.data?.status) ? false : 5_000),
    refetchOnWindowFocus: false,
  })
}

/** One of the policy's documents as a PDF blob, for QuickLook-style viewing or saving. */
export function downloadPolicyDocument(policyId: number, type: PolicyDocumentType): Promise<Blob> {
  return apiBlob(`/public/me/insurances/${policyId}/documents/${type}`)
}
