import { useEffect, useRef, useState } from "react"
import { Check, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Textarea } from "@/components/ui/textarea"
import { apiErrorMessage } from "@/lib/api"
import { useT, type MessageKey } from "@/i18n"
import { useMe } from "@/queries/me"
import { useDismissRatePrompt, useSubmitRating } from "@/queries/rating"
import { useRatingUiStore } from "@/stores/rating"
import { cn } from "@/lib/utils"

/**
 * Where a 4–5 star rating is sent on to leave a public review. Unset in a
 * plain web deployment — the sheet then just says thanks. In the iOS shell
 * this is the App Store `?action=write-review` URL.
 */
const STORE_REVIEW_URL: string = import.meta.env.VITE_APP_STORE_REVIEW_URL || ""

// indexed by the score, so [0] is never read
const STAR_LABELS: MessageKey[] = [
  "rate.star1",
  "rate.star1",
  "rate.star2",
  "rate.star3",
  "rate.star4",
  "rate.star5",
]
const MAX_COMMENT = 2000

/**
 * The "rate the app" sheet. Mounted once (AppShell); opened through
 * stores/rating.ts. Own UI rather than the platform review dialog: the
 * server needs the score (stored either way) to decide who gets sent on to
 * the store.
 *
 * Closing without a rating after a PROMPTED open reports
 * `rating/dismissed`, which is what moves the account from `after_purchase`
 * to `anywhere` (and starts the 14-day cooldown).
 */
export function RateAppSheet() {
  const { t } = useT()
  const { open, source, purchaseTick, openSheet, closeSheet } = useRatingUiStore()
  const { data: me } = useMe()
  const submit = useSubmitRating()
  const dismiss = useDismissRatePrompt()

  // A completed checkout bumps purchaseTick. Open once per tick, but only if
  // the server says this account has never been prompted — and only once the
  // profile is actually loaded, so a slow /me doesn't swallow the moment.
  const handledTick = useRef(purchaseTick)
  useEffect(() => {
    if (purchaseTick === handledTick.current || !me) return
    handledTick.current = purchaseTick
    if (me.rate_prompt === "after_purchase") openSheet("after_purchase")
  }, [purchaseTick, me, openSheet])

  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")
  const [thanks, setThanks] = useState<{ storeReview: boolean } | null>(null)

  // fresh form for the next open — reset on close, not in an effect on open
  const close = () => {
    // shown by the server's decision and closed unrated → tell it
    if (!thanks && source !== "manual") dismiss.mutate()
    closeSheet()
    setRating(0)
    setHover(0)
    setComment("")
    setThanks(null)
  }
  const finish = () => {
    closeSheet()
    setRating(0)
    setHover(0)
    setComment("")
    setThanks(null)
  }

  const send = async () => {
    if (!rating) return
    try {
      const state = await submit.mutateAsync({ rating, comment })
      setThanks({ storeReview: Boolean(state.store_review) })
    } catch (e) {
      // 400 messages are written for the user — show them as they are
      toast.error(apiErrorMessage(e, t("rate.failed")))
    }
  }

  const shown = hover || rating

  return (
    <Drawer open={open} onOpenChange={(next) => !next && close()}>
      <DrawerContent className="border-0 !bg-brand data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        {thanks ? (
          <div className="flex flex-col items-center gap-5 px-5 pt-4 pb-6 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-mint shadow-[0_0_40px_rgba(69,217,161,0.45)]">
              <Check className="size-10 text-white" strokeWidth={3} />
            </span>
            <DrawerHeader className="p-0">
              <DrawerTitle className="text-[22px] font-extrabold text-white">
                {t("rate.thanksTitle")}
              </DrawerTitle>
              <DrawerDescription className="text-[15px] font-medium text-white/90">
                {thanks.storeReview && STORE_REVIEW_URL
                  ? t("rate.thanksStore")
                  : t("rate.thanksBody")}
              </DrawerDescription>
            </DrawerHeader>
            {thanks.storeReview && STORE_REVIEW_URL ? (
              <>
                <Button asChild variant="mint" size="xl" className="w-full text-lg tracking-[0.15em]">
                  <a href={STORE_REVIEW_URL} target="_blank" rel="noreferrer" onClick={finish}>
                    {t("rate.writeReview")}
                  </a>
                </Button>
                <Button variant="glass" size="pill" className="w-full" onClick={finish}>
                  {t("rate.maybeLater")}
                </Button>
              </>
            ) : (
              <Button variant="mint" size="xl" className="w-full text-lg tracking-[0.15em]" onClick={finish}>
                {t("common.done")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 pt-3 pb-6">
            <DrawerHeader className="p-0">
              <DrawerTitle className="text-[22px] font-extrabold text-white">
                {t("rate.title")}
              </DrawerTitle>
              <DrawerDescription className="text-[15px] font-medium text-white/85">
                {t("rate.subtitle")}
              </DrawerDescription>
            </DrawerHeader>

            <div
              className="flex justify-center gap-2"
              role="radiogroup"
              aria-label={t("rate.label")}
              onMouseLeave={() => setHover(0)}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={t("rate.starLabel", { count: value })}
                  onMouseEnter={() => setHover(value)}
                  onClick={() => setRating(value)}
                  className="rounded-full p-1 outline-none transition-transform active:scale-90 focus-visible:ring-3 focus-visible:ring-white/60"
                >
                  <Star
                    className={cn(
                      "size-11 transition-colors",
                      value <= shown ? "fill-sun text-sun" : "fill-white/15 text-white/70"
                    )}
                    strokeWidth={1.75}
                  />
                </button>
              ))}
            </div>
            <p className="-mt-1 h-5 text-center text-sm font-bold text-white/90">
              {shown ? t(STAR_LABELS[shown]) : " "}
            </p>

            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
              placeholder={t("rate.commentPlaceholder")}
              rows={3}
              className="rounded-2xl border-0 bg-white px-4 py-3 text-[15px] font-medium text-navy placeholder:text-navy-soft"
            />

            <Button
              variant="mint"
              size="xl"
              className="w-full text-lg tracking-[0.15em]"
              disabled={!rating || submit.isPending}
              onClick={() => void send()}
            >
              {submit.isPending ? t("common.sending") : t("rate.send")}
            </Button>
            <Button variant="glass" size="pill" className="w-full" onClick={close}>
              {t("common.notNow")}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
