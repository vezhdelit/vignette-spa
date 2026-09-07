import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiResult } from "@/lib/api"
import { meKeys } from "@/queries/me"
import { useSessionScope } from "@/queries/session"
import type { Me, RatingState } from "@/types/api"

/**
 * The two writes behind the "rate the app" sheet. Both answer the fresh
 * `has_rated` / `rate_prompt` pair, which is patched straight into the cached
 * GET /public/me — the flags are read from there everywhere (Home card,
 * after-purchase trigger), so no refetch is needed. Guest sessions may call
 * both.
 */

function patchMe(
  queryClient: ReturnType<typeof useQueryClient>,
  scope: string,
  state: RatingState
) {
  queryClient.setQueryData<Me>(meKeys.detail(scope), (me) =>
    me ? { ...me, has_rated: state.has_rated, rate_prompt: state.rate_prompt } : me
  )
}

export interface SubmitRatingInput {
  rating: number
  comment?: string
}

/** POST /public/me/rating — 400 invalid_request carries a user-facing message. */
export function useSubmitRating() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: ({ rating, comment }: SubmitRatingInput) =>
      apiResult<RatingState>("/public/me/rating", {
        method: "POST",
        body: { rating, comment: comment?.trim() || undefined },
      }),
    onSuccess: (state) => patchMe(queryClient, scope, state),
  })
}

/** POST /public/me/rating/dismissed — the sheet was shown and closed unrated. */
export function useDismissRatePrompt() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: () =>
      apiResult<RatingState>("/public/me/rating/dismissed", { method: "POST" }),
    onSuccess: (state) => patchMe(queryClient, scope, state),
  })
}
