import { useEffect, useRef } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
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
import { useAuthStore } from "@/stores/auth"
import { captureInviteCodeFromUrl } from "@/stores/invite"

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
