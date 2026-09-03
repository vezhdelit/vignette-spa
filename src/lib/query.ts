import { QueryClient } from "@tanstack/react-query"
import { ApiRequestError } from "@/lib/api"

/**
 * The one QueryClient. Server state lives here (TanStack Query); the only
 * thing kept outside it is the auth session itself (stores/auth.ts), which
 * the api client needs synchronously to sign requests.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx is a definitive answer (not found, forbidden, validation…) —
      // only network failures and 5xx deserve another attempt.
      retry: (failureCount, error) =>
        !(error instanceof ApiRequestError && error.status < 500) &&
        failureCount < 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
})

/**
 * Query-key roots whose second segment is the session scope (user id, or
 * "anon"). Everything under them belongs to one signed-in/guest session;
 * the catalog is deliberately not among them.
 */
const SESSION_SCOPED_ROOTS = new Set(["me", "orders", "account"])

/** Forget everything cached for a session that just ended (sign-in/out). */
export function dropSessionQueries(scope: string) {
  queryClient.removeQueries({
    predicate: (query) =>
      SESSION_SCOPED_ROOTS.has(String(query.queryKey[0])) &&
      query.queryKey[1] === scope,
  })
}
