import { useAuthStore } from "@/stores/auth"

/**
 * What every session-bound query needs from the auth store: whether the
 * initial session bootstrap has finished (queries wait for it, like the
 * screens used to), a scope segment for the query key so a sign-in or
 * sign-out never serves one account's cache to another, and whether this is
 * a guest session — endpoints a guest may not call (403 guest_not_allowed)
 * stay disabled instead of erroring.
 */
export function useSessionScope() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const guest = useAuthStore((s) => s.user?.guest ?? true)
  const ready = useAuthStore((s) => s.status === "ready")
  return { userId, guest, ready, scope: userId ?? "anon" }
}
