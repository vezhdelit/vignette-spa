import { useAuthStore } from "@/stores/auth"

/**
 * What every session-bound query needs from the auth store: whether the
 * initial session bootstrap has finished (queries wait for it, like the
 * screens used to), and a scope segment for the query key so a sign-in or
 * sign-out never serves one account's cache to another.
 */
export function useSessionScope() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const ready = useAuthStore((s) => s.status === "ready")
  return { userId, ready, scope: userId ?? "anon" }
}
