import { Link, Outlet } from "react-router-dom"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNotificationsSummary } from "@/queries/account"
import { BottomNav } from "./BottomNav"

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-[32px] leading-none font-extrabold tracking-tight text-white">
        vignette
      </span>
      <span className="rounded-[10px] bg-white px-2 py-1 text-lg leading-none font-extrabold text-brand">
        ID
      </span>
    </span>
  )
}

export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-brand">
      <header className="flex items-center justify-between px-5 pt-4 pb-3">
        <Logo />
        <NotificationsBell />
      </header>

      {/* room for the floating nav pill */}
      <main className="flex-1 px-4 pb-28">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  )
}

/**
 * The header bell: unread count from GET /public/me/notifications/summary
 * (a cheap poll, no read-state write — see queries/account.ts), opening the
 * inbox page, which is what marks things read.
 */
function NotificationsBell() {
  const unread = useNotificationsSummary().data?.unread_count ?? 0
  return (
    <Button
      asChild
      variant="ghost"
      size="icon-lg"
      className="relative text-white hover:bg-white/15 hover:text-white active:scale-95"
    >
      <Link
        to="/notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell className="size-7 fill-white" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-pink px-1 text-[11px] leading-none font-extrabold text-white ring-2 ring-brand">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  )
}
