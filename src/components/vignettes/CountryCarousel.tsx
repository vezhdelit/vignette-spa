import { useEffect, useRef } from "react"
import { COUNTRY_NAMES, FlagCircle } from "@/lib/countries"
import { cn } from "@/lib/utils"

interface CountryCarouselProps {
  countries: string[]
  selected: string
  onSelect: (country: string) => void
}

/** Horizontal flag picker — the selected flag grows and gets the white ring. */
export function CountryCarousel({ countries, selected, onSelect }: CountryCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    })
  }, [selected])

  return (
    <div className="pt-2">
      <div
        ref={scrollerRef}
        className="no-scrollbar flex items-center gap-7 overflow-x-auto px-[38%] py-3"
      >
        {countries.map((code) => {
          const isSelected = code === selected
          return (
            <button
              key={code}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              onClick={() => onSelect(code)}
              className={cn(
                "shrink-0 rounded-full transition-all duration-200",
                isSelected
                  ? "size-24 ring-4 ring-white shadow-[0_6px_24px_rgba(0,40,90,0.25)]"
                  : "size-14 opacity-80 saturate-[0.85]"
              )}
              aria-label={COUNTRY_NAMES[code] || code}
              aria-pressed={isSelected}
            >
              <FlagCircle code={code} className="h-full w-full" />
            </button>
          )
        })}
      </div>
      <h2 className="mt-2 text-center text-[28px] font-extrabold text-white">
        {COUNTRY_NAMES[selected] || selected.toUpperCase()}
      </h2>
    </div>
  )
}
