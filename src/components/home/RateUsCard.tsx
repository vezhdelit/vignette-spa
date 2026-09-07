import { Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useMe } from "@/queries/me"
import { useDismissRatePrompt } from "@/queries/rating"
import { useRatingUiStore } from "@/stores/rating"

/**
 * The "anywhere" placement: a quiet card at the top of Home while the server
 * says `rate_prompt: "anywhere"` (prompted once after a purchase, not rated).
 * Tapping it opens the sheet; the cross is a dismissal, which the server
 * turns into `none` for the next 14 days. Renders nothing otherwise, so the
 * profile flags alone decide whether it exists.
 */
export function RateUsCard() {
  const { data: me } = useMe()
  const openSheet = useRatingUiStore((s) => s.openSheet)
  const dismiss = useDismissRatePrompt()

  if (me?.rate_prompt !== "anywhere") return null

  return (
    <Card className="rounded-[24px] ring-0">
      <CardContent className="flex items-center gap-3.5 py-0">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sun/25">
          <Star className="size-5.5 fill-sun text-sun" />
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 text-left outline-none"
          onClick={() => openSheet("anywhere")}
        >
          <p className="text-[15px] font-extrabold text-navy">Enjoying vignette.id?</p>
          <p className="text-[13px] font-semibold text-navy-soft">
            Rate the app — it takes ten seconds
          </p>
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Not now"
          className="shrink-0 text-navy-soft"
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate()}
        >
          <X className="size-4.5" />
        </Button>
      </CardContent>
    </Card>
  )
}
