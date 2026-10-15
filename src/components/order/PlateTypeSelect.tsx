import { CircleQuestionMark } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select"
import { useT, type MessageKey } from "@/i18n"
import { cn } from "@/lib/utils"
import type { PlateType } from "@/types/api"

/** The website's special-plate vocabulary, in its order. */
export const PLATE_TYPES: PlateType[] = [
  "diplomatic",
  "temporary",
  "export",
  "transfer",
  "government",
  "historic",
  "custom",
  "other",
]

export const PLATE_TYPE_KEYS: Record<PlateType, MessageKey> = {
  custom: "order.plateType.custom",
  diplomatic: "order.plateType.diplomatic",
  export: "order.plateType.export",
  government: "order.plateType.government",
  historic: "order.plateType.historic",
  temporary: "order.plateType.temporary",
  transfer: "order.plateType.transfer",
  other: "order.plateType.other",
}

// Radix Select cannot carry an empty-string item, so "standard" is a sentinel.
const STANDARD = "__standard__"

/**
 * "Is this a special plate?" — offered under a plate the country's format
 * rules reject, because a diplomatic, temporary, export or similar series
 * never matches them. Picking a type sends it as `cars[].type`: the server
 * then skips the format rules for the plate and holds the paid order for an
 * admin's check before issuing it, so the note says the order stays pending.
 */
export function PlateTypeSelect({
  value,
  onChange,
  prompt = true,
  className,
}: {
  value: PlateType | null
  onChange: (next: PlateType | null) => void
  /** lead with the question (the plate was rejected) or just show the control */
  prompt?: boolean
  className?: string
}) {
  const { t } = useT()

  return (
    <div className={cn("rounded-2xl bg-white/15 px-3 py-3", className)}>
      {prompt && !value && (
        <p className="mb-2 flex items-center gap-2 px-1 text-[15px] font-extrabold text-white">
          <CircleQuestionMark className="size-4 shrink-0" />
          {t("order.plateType.question")}
        </p>
      )}
      <Select
        value={value ?? STANDARD}
        onValueChange={(next) => onChange(next === STANDARD ? null : (next as PlateType))}
      >
        <SelectTrigger
          aria-label={t("order.plateType.label")}
          className="h-auto w-full justify-between rounded-xl border-0 bg-white px-3.5 py-3 text-[15px] font-bold text-navy shadow-none"
        >
          <span className={cn(!value && "text-navy-soft")}>
            {value ? t(PLATE_TYPE_KEYS[value]) : t("order.plateType.select")}
          </span>
        </SelectTrigger>
        {/* popper: the trigger has no <SelectValue>, so item-aligned mode
            would never place the list (see the plate country select) */}
        <SelectContent position="popper" align="start">
          {PLATE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {t(PLATE_TYPE_KEYS[type])}
            </SelectItem>
          ))}
          {value && (
            <>
              <SelectSeparator />
              <SelectItem value={STANDARD}>{t("order.plateType.standard")}</SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
      <p className="mt-2 px-1 text-xs font-semibold text-white/80">
        {value ? t("order.plateType.reviewNote") : t("order.plateType.unsureHint")}
      </p>
    </div>
  )
}
