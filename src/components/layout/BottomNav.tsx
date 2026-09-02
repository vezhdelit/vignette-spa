import { NavLink } from "react-router-dom"
import { House, MessageCircle, CircleUserRound } from "lucide-react"
import { cn } from "@/lib/utils"

/** Motorway icon (road under a bridge) — lucide has no highway glyph. */
function MotorwayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 21 L9 3" />
      <path d="M20 21 L15 3" />
      <path d="M12 5v2" />
      <path d="M12 10v2" />
      <path d="M12 15v2" />
      <path d="M3 8h18" />
    </svg>
  )
}

const TABS = [
  { to: "/", label: "Home", icon: House },
  { to: "/vignettes", label: "Vignettes", icon: MotorwayIcon },
  { to: "/support", label: "Support", icon: MessageCircle },
  { to: "/account", label: "Account", icon: CircleUserRound },
] as const

export function BottomNav() {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-4 pb-4">
      <div className="pointer-events-auto flex items-stretch justify-between rounded-[26px] bg-white px-4 py-2.5 shadow-[0_8px_30px_rgba(0,60,120,0.18)]">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-w-16 flex-col items-center gap-1 rounded-2xl px-2 py-1 transition-colors",
                isActive ? "text-pink" : "text-navy-soft"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn("size-6", isActive && to === "/" && "fill-pink")}
                />
                <span className="text-[10px] font-bold tracking-[0.12em] uppercase">
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
