import { create } from "zustand"

/**
 * Where a tapped push wants the app to land.
 *
 * A service worker cannot route: it has one URL to open, so `sw.js` opens
 * "/" with the push's own markers on the query string (`vsrc`, `vtype`,
 * `void`, `vscreen`). `InsightsTracker` is the one place that reads those —
 * it has to, before it strips them back out of the address bar — and it
 * leaves the routing half here for whoever can act on it.
 *
 * Consumers take it and call `clear()`. One-shot on purpose: a reload, a tab
 * switch or a later render must never re-open a card the user has closed.
 */
export interface PushFocus {
  /** the order's public id (`data.order_id`), when the push named one */
  orderId: string | null
  /** `data.screen`: vignette · order · checkout · balance · referrals · buy · home */
  screen: string | null
}

interface PushFocusState {
  focus: PushFocus | null
  setFocus: (focus: PushFocus) => void
  clear: () => void
}

export const usePushFocusStore = create<PushFocusState>()((set) => ({
  focus: null,
  setFocus: (focus) => set({ focus }),
  clear: () => set({ focus: null }),
}))

/** For non-React callers (the arrival effect) — same store, no hook rules. */
export const setPushFocus = (focus: PushFocus) =>
  usePushFocusStore.getState().setFocus(focus)

/**
 * Screens that live on /account, not on Home. They decide the split between
 * the two consumers — App's `PushFocusRoute` navigates for these, HomePage
 * opens an order card for everything else — so a push that carries both a
 * screen and an order id (a refund to the wallet, say) cannot have both act
 * on it and race to clear the focus.
 */
const ACCOUNT_SCREENS = new Set(["balance", "referrals"])

export const isAccountScreen = (screen: string | null) =>
  screen !== null && ACCOUNT_SCREENS.has(screen)
