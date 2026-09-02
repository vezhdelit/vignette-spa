import { Flag } from "@/lib/countries"
import { cn } from "@/lib/utils"

function EuStars({ className }: { className?: string }) {
  // ring of 12 stars, simplified as dots at this size
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2
    return {
      x: 50 + Math.sin(angle) * 30,
      y: 50 - Math.cos(angle) * 30,
    }
  })
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="6" fill="#FFCC00" />
      ))}
    </svg>
  )
}

interface PlateBadgeProps {
  plate: string
  country: string | null
  placeholder?: string
  className?: string
  /** larger display variant for the home card */
  size?: "md" | "lg"
}

/**
 * The license-plate visual: dark-blue country band (flag + code, or EU stars
 * when no country picked yet) + the plate number on a light plate ground.
 */
export function PlateBadge({
  plate,
  country,
  placeholder = "REGISTRATION PLATE",
  className,
  size = "md",
}: PlateBadgeProps) {
  const code = country?.toUpperCase()
  return (
    <div
      className={cn(
        "flex w-full items-stretch overflow-hidden rounded-xl bg-[#ECEFF3] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0 flex-col items-center justify-center gap-1 bg-[#173A7A] px-2",
          size === "lg" ? "w-14 py-3" : "w-12 py-2"
        )}
      >
        {country ? (
          <>
            <Flag code={country} className="h-4 w-6 rounded-[2px]" />
            <span className="text-[10px] leading-none font-bold text-white">
              {code}
            </span>
          </>
        ) : (
          <EuStars className="size-8" />
        )}
      </div>
      <div className="flex min-h-12 flex-1 items-center justify-center px-3">
        {plate ? (
          <span
            className={cn(
              "font-extrabold whitespace-nowrap text-navy uppercase",
              size === "lg"
                ? "text-[22px] tracking-[0.2em]"
                : "text-[20px] tracking-[0.14em]"
            )}
          >
            {plate}
          </span>
        ) : (
          <span className="text-sm font-semibold tracking-[0.2em] text-navy-soft">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  )
}
