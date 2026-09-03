import { useQuery } from "@tanstack/react-query"
import { apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import type { Me } from "@/types/api"

export const meKeys = {
  detail: (scope: string) => ["me", scope] as const,
}

/** GET /public/me — the profile behind the current session (guest or not). */
export function useMe() {
  const { scope, ready, userId } = useSessionScope()
  return useQuery({
    queryKey: meKeys.detail(scope),
    queryFn: () => apiResult<Me>("/public/me"),
    enabled: ready && userId !== null,
    staleTime: 5 * 60_000,
  })
}
