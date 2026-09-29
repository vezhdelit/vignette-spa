import { useEffect, useRef } from "react"
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { AppShell } from "@/components/layout/AppShell"
import { InsightsTracker } from "@/components/InsightsTracker"
import { HomePage } from "@/pages/HomePage"
import { VignettesPage } from "@/pages/VignettesPage"
import { SupportPage } from "@/pages/SupportPage"
import { AccountPage } from "@/pages/AccountPage"
import { NotificationsPage } from "@/pages/NotificationsPage"
import { dropSessionQueries, queryClient } from "@/lib/query"
import { useLanguage } from "@/i18n"
import { usePushLocaleSync } from "@/queries/push"
import { useAuthStore } from "@/stores/auth"
import { captureInviteCodeFromUrl } from "@/stores/invite"
import { isAccountScreen, usePushFocusStore } from "@/stores/push-focus"

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap)
  // Subscribing here re-renders the whole tree when the language changes,
  // which is what updates the components that read copy through the bare
  // `t()` (module-level helpers, formatters) rather than `useT()`. See the
  // note in src/i18n/index.ts.
  useLanguage()

  useEffect(() => {
    // Before anything else: a visitor who followed /r/<code> (or arrived
    // with ?ref=) is carrying an invite. Read it off the URL now, because
    // the router is about to redirect /r/<code> to "/" and sign-in will
    // reload the page before there is an account to link it to.
    captureInviteCodeFromUrl()
    void bootstrap()
  }, [bootstrap])

  useSessionCacheReset()

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <InsightsTracker />
        <PushLocaleSyncTracker />
        <PushFocusRoute />
        {/* spends an invite code the visitor arrived with, once there is an
            account to attach it to */}
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/vignettes" element={<VignettesPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

/**
 * Re-POSTs /public/devices' `locale`/`timezone` when either drifts from
 * what this install last told the server — a no-op until push is on. A
 * real component, not a bare hook call inside `App`: `usePushLocaleSync`
 * uses `useQuery` internally, which needs a `QueryClientProvider`
 * ancestor in the RENDERED tree, not merely one that appears later in the
 * same function. Calling it directly in `App()` crashed every mount (no
 * QueryClient in context yet) — see the commit that added it.
 */
function PushLocaleSyncTracker() {
  usePushLocaleSync()
  return null
}

/**
 * A push about the wallet or a referral reward opens "/" like every other
 * tap — the service worker has one URL to give — so send it on to the page
 * that actually holds those. Orders are Home's business (HomePage reads the
 * same focus), and the two never both act on one push: the screen decides.
 */
function PushFocusRoute() {
  const navigate = useNavigate()
  const focus = usePushFocusStore((s) => s.focus)
  const clear = usePushFocusStore((s) => s.clear)

  useEffect(() => {
    if (!isAccountScreen(focus?.screen ?? null)) return
    clear()
    navigate("/account")
  }, [focus, navigate, clear])

  return null
}

/**
 * A sign-in or sign-out swaps the session: every session-scoped query key
 * carries the user id, so the new session starts from an empty cache on its
 * own — this just forgets the previous session's data instead of leaving it
 * around until garbage collection.
 */
function useSessionCacheReset() {
  const scope = useAuthStore((s) => s.user?.id ?? "anon")
  const previous = useRef(scope)

  useEffect(() => {
    if (previous.current !== scope) {
      dropSessionQueries(previous.current)
      previous.current = scope
    }
  }, [scope])
}
