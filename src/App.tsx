import { useEffect, useRef } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { AppShell } from "@/components/layout/AppShell"
import { HomePage } from "@/pages/HomePage"
import { VignettesPage } from "@/pages/VignettesPage"
import { SupportPage } from "@/pages/SupportPage"
import { AccountPage } from "@/pages/AccountPage"
import { dropSessionQueries, queryClient } from "@/lib/query"
import { useAuthStore } from "@/stores/auth"

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useSessionCacheReset()

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/vignettes" element={<VignettesPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/account" element={<AccountPage />} />
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
