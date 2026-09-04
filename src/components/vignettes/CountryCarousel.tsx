import { useEffect, useRef } from "react"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { COUNTRY_NAMES, FlagCircle } from "@/lib/countries"
import { cn } from "@/lib/utils"

interface CountryCarouselProps {
  countries: string[]
  selected: string
  onSelect: (country: string) => void
}

/** Horizontal flag picker — the selected flag grows and gets the white ring. */
export function CountryCarousel({ countries, selected, onSelect }: CountryCarouselProps) {
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
      <ScrollArea className="w-full">
        <ToggleGroup
          type="single"
          value={selected}
          // single-mode emits "" when the active item is tapped again — keep it
          onValueChange={(code) => code && onSelect(code)}
          spacing={7}
          aria-label="Country"
          className="w-max px-[38%] py-3"
        >
          {countries.map((code) => {
            const isSelected = code === selected
            return (
              <ToggleGroupItem
                key={code}
                value={code}
                ref={isSelected ? selectedRef : undefined}
                aria-label={COUNTRY_NAMES[code] || code}
                className={cn(
                  // the toggle base pins un-sized inner svgs to 16px — the flag must fill
                  "h-auto min-w-0 shrink-0 rounded-full bg-transparent p-0 transition-all duration-200 hover:bg-transparent data-[state=on]:bg-transparent [&_svg:not([class*='size-'])]:size-full",
                  isSelected
                    ? "size-24 shadow-[0_6px_24px_rgba(0,40,90,0.25)] ring-4 ring-white"
                    : "size-14 opacity-80 saturate-[0.85]"
                )}
              >
                <FlagCircle code={code} className="h-full w-full" />
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
      <h2 className="mt-2 text-center text-[28px] font-extrabold text-white">
        {COUNTRY_NAMES[selected] || selected.toUpperCase()}
      </h2>
    </div>
  )
}
