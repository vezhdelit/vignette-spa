import { cn } from "@/lib/utils"

/** Countries vignette.id sells vignettes for, in carousel order. */
export const VIGNETTE_COUNTRIES = [
  "at",
  "ch",
  "si",
  "hu",
  "sk",
  "cz",
  "ro",
  "bg",
  "md",
] as const

export const COUNTRY_NAMES: Record<string, string> = {
  at: "Austria",
  ch: "Switzerland",
  si: "Slovenia",
  hu: "Hungary",
  sk: "Slovakia",
  cz: "Czech Republic",
  ro: "Romania",
  bg: "Bulgaria",
  ua: "Ukraine",
  de: "Germany",
  pl: "Poland",
  fr: "France",
  it: "Italy",
  nl: "Netherlands",
  be: "Belgium",
  lt: "Lithuania",
  lv: "Latvia",
  ee: "Estonia",
  hr: "Croatia",
  md: "Moldova",
  gb: "United Kingdom",
  es: "Spain",
}

/** Countries offered in the registration-plate selector. */
export const PLATE_COUNTRIES = [
  "ua",
  "at",
  "bg",
  "hr",
  "cz",
  "ee",
  "fr",
  "de",
  "hu",
  "it",
  "lv",
  "lt",
  "md",
  "nl",
  "pl",
  "ro",
  "sk",
  "si",
  "es",
  "ch",
  "gb",
  "be",
] as const

/** EU members among the plate countries — decides the blue EU band vs a plain country band. */
const EU_MEMBERS = new Set([
  "at", "be", "bg", "hr", "cz", "ee", "fr", "de", "hu", "it",
  "lv", "lt", "nl", "pl", "ro", "sk", "si", "es",
])

export function isEuMember(code: string): boolean {
  return EU_MEMBERS.has(code.toLowerCase())
}

/* ------------------------------------------------------------------ flags */

type Stripes = { dir: "h" | "v"; colors: string[] }

const STRIPE_FLAGS: Record<string, Stripes> = {
  at: { dir: "h", colors: ["#ED2939", "#FFFFFF", "#ED2939"] },
  bg: { dir: "h", colors: ["#FFFFFF", "#00966E", "#D62612"] },
  hu: { dir: "h", colors: ["#CE2939", "#FFFFFF", "#477050"] },
  ro: { dir: "v", colors: ["#002B7F", "#FCD116", "#CE1126"] },
  ua: { dir: "h", colors: ["#0057B7", "#FFD700"] },
  de: { dir: "h", colors: ["#000000", "#DD0000", "#FFCE00"] },
  pl: { dir: "h", colors: ["#FFFFFF", "#DC143C"] },
  fr: { dir: "v", colors: ["#002395", "#FFFFFF", "#ED2939"] },
  it: { dir: "v", colors: ["#009246", "#FFFFFF", "#CE2B37"] },
  nl: { dir: "h", colors: ["#AE1C28", "#FFFFFF", "#21468B"] },
  be: { dir: "v", colors: ["#000000", "#FDDA24", "#EF3340"] },
  lt: { dir: "h", colors: ["#FDB913", "#046A38", "#BE3A34"] },
  lv: { dir: "h", colors: ["#9E3039", "#FFFFFF", "#9E3039"] },
  ee: { dir: "h", colors: ["#0072CE", "#000000", "#FFFFFF"] },
  es: { dir: "h", colors: ["#AA151B", "#F1BF00", "#AA151B"] },
  md: { dir: "v", colors: ["#003DA5", "#FFD200", "#CC092F"] },
}

function StripeSvg({ dir, colors }: Stripes) {
  const size = 100 / colors.length
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      {colors.map((color, i) => (
        <rect
          key={i}
          x={dir === "v" ? i * size : 0}
          y={dir === "h" ? i * size : 0}
          width={dir === "v" ? size : 100}
          height={dir === "h" ? size : 100}
          fill={color}
        />
      ))}
    </svg>
  )
}

function SpecialSvg({ code }: { code: string }) {
  switch (code) {
    case "ch":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
          <rect width="100" height="100" fill="#DA291C" />
          <rect x="42" y="20" width="16" height="60" fill="#fff" />
          <rect x="20" y="42" width="60" height="16" fill="#fff" />
        </svg>
      )
    case "cz":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
          <rect width="100" height="50" fill="#FFFFFF" />
          <rect y="50" width="100" height="50" fill="#D7141A" />
          <path d="M0,0 L55,50 L0,100 Z" fill="#11457E" />
        </svg>
      )
    case "sk":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
          <rect width="100" height="34" fill="#FFFFFF" />
          <rect y="33" width="100" height="34" fill="#0B4EA2" />
          <rect y="66" width="100" height="34" fill="#EE1C25" />
          <path d="M30,28 h26 v24 c0,10 -13,16 -13,16 s-13,-6 -13,-16 Z" fill="#EE1C25" stroke="#FFFFFF" strokeWidth="3" />
          <path d="M40.5,38 h5 v-6 h4 v6 h5 v4 h-5 v12 h-4 v-12 h-5 Z" fill="#FFFFFF" />
        </svg>
      )
    case "si":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
          <rect width="100" height="34" fill="#FFFFFF" />
          <rect y="33" width="100" height="34" fill="#005DA4" />
          <rect y="66" width="100" height="34" fill="#ED1C24" />
          <path d="M22,22 h20 v14 c0,8 -10,12 -10,12 s-10,-4 -10,-12 Z" fill="#005DA4" stroke="#FFFFFF" strokeWidth="2.5" />
          <path d="M25,38 l4,-5 3,3 3,-6 3,6 3,-3 4,5 Z" fill="#FFFFFF" />
        </svg>
      )
    case "hr":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
          <rect width="100" height="34" fill="#FF0000" />
          <rect y="33" width="100" height="34" fill="#FFFFFF" />
          <rect y="66" width="100" height="34" fill="#171796" />
          <g>
            {[0, 1, 2, 3, 4].map((col) =>
              [0, 1, 2, 3].map((row) => (
                <rect
                  key={`${col}-${row}`}
                  x={35 + col * 6}
                  y={30 + row * 6}
                  width="6"
                  height="6"
                  fill={(col + row) % 2 === 0 ? "#FF0000" : "#FFFFFF"}
                />
              ))
            )}
          </g>
        </svg>
      )
    case "gb":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
          <rect width="100" height="100" fill="#012169" />
          <path d="M0,0 L100,100 M100,0 L0,100" stroke="#FFFFFF" strokeWidth="18" />
          <path d="M0,0 L100,100 M100,0 L0,100" stroke="#C8102E" strokeWidth="8" />
          <path d="M50,0 V100 M0,50 H100" stroke="#FFFFFF" strokeWidth="26" />
          <path d="M50,0 V100 M0,50 H100" stroke="#C8102E" strokeWidth="14" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
          <rect width="100" height="100" fill="#B6C4D6" />
        </svg>
      )
  }
}

export function Flag({ code, className }: { code: string; className?: string }) {
  const lower = code.toLowerCase()
  const stripes = STRIPE_FLAGS[lower]
  return (
    <span
      className={cn("block shrink-0 overflow-hidden", className)}
      role="img"
      aria-label={COUNTRY_NAMES[lower] || lower.toUpperCase()}
    >
      {stripes ? <StripeSvg {...stripes} /> : <SpecialSvg code={lower} />}
    </span>
  )
}

/** Rectangular flag (3:2-ish) — the little flag next to ROMANIA on product cards. */
export function FlagRect({ code, className }: { code: string; className?: string }) {
  return <Flag code={code} className={cn("h-4 w-6 rounded-[3px]", className)} />
}

/** Round flag chip — carousel and "add other e-vignettes". */
export function FlagCircle({ code, className }: { code: string; className?: string }) {
  return <Flag code={code} className={cn("aspect-square rounded-full", className)} />
}
