import { create } from "zustand"

/**
 * UI state of the "rate the app" sheet — one sheet, mounted once in the
 * shell, opened from several places:
 *
 * - a purchase completing (`notePurchaseCompleted`): the sheet opens on its
 *   own if GET /public/me says `rate_prompt: "after_purchase"`;
 * - the Home "Enjoying vignette.id?" card, shown while `rate_prompt` is
 *   `anywhere`;
 * - the Account tab's "Rate the app" row (manual; ignores the flags).
 *
 * `source` tells the sheet whether a close-without-rating should be reported
 * to the server (prompted opens do, a manual open does not — the user came
 * looking, nothing was pushed on them).
 */
export type RatePromptSource = "after_purchase" | "anywhere" | "manual"

interface RatingUiState {
  open: boolean
  source: RatePromptSource | null
  /** bumps once per completed checkout; the sheet decides what to do with it */
  purchaseTick: number
  openSheet: (source: RatePromptSource) => void
  closeSheet: () => void
  notePurchaseCompleted: () => void
}

export const useRatingUiStore = create<RatingUiState>()((set) => ({
  open: false,
  source: null,
  purchaseTick: 0,
  openSheet: (source) => set({ open: true, source }),
  closeSheet: () => set({ open: false }),
  notePurchaseCompleted: () => set((s) => ({ purchaseTick: s.purchaseTick + 1 })),
}))

/** For non-React callers (order flows) — same store, no hook rules. */
export const notePurchaseCompleted = () =>
  useRatingUiStore.getState().notePurchaseCompleted()
