import { Outlet } from "react-router-dom"
import { Bell } from "lucide-react"
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
        <button
          type="button"
          className="text-white transition-transform active:scale-95"
          aria-label="Notifications"
        >
          <Bell className="size-7 fill-white" />
        </button>
      </header>

      {/* room for the floating nav pill */}
      <main className="flex-1 px-4 pb-28">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  )
}
