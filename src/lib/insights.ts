import { api } from "@/lib/api"
import { currentLanguage } from "@/i18n"
import { useAuthStore } from "@/stores/auth"
import { getInstallationId } from "@/lib/webpush"

/**
 * Event insights for the SPA — the browser half of the pipeline the panel
 * reads (vignette.id docs/insights/partner-api.md).
 *
 * Events go straight to the ingest endpoint as this app's own
 * public client: `X-Client-Id` identifies the partner, and the bearer token
 * the API already sends resolves `user_id` server-side. Unlike the Nuxt site
 * there is no server of ours in between, so nothing forwards a session
 * cookie and nothing needs an email — the token is the identity.
 *
 * Three rules this module keeps, in order of importance:
 *
 *  1. It never breaks a caller. Every failure — no storage, no network, a
 *     rejected batch — is swallowed. `track()` returns void, not a promise,
 *     so a click handler cannot accidentally await a page view.
 *  2. It never creates a session. `api()` will bootstrap a guest session for
 *     a request that needs auth; insights must not be what triggers that,
 *     so it sends unauthenticated until a session exists on its own.
 *  3. It batches. A page view fires on every navigation; sending one request
 *     each would be a request per click. Events queue and flush on a short
 *     timer, on page hide, and when the batch is full.
 */

/**
 * The ingest endpoint. No URL this app requests contains the word
 * "analytics": ad blockers match it in a path and kill the request inside
 * the tab, where no server log can explain the missing traffic. Measured —
 * /public/insights/events is delivered, /public/analytics/events is not.
 */
const INGEST_PATH = "/public/insights/events"

const SESSION_KEY = "vignette_session_id"
const SESSION_SEEN_KEY = "vignette_session_seen_at"
const REFERRER_KEY = "vignette_session_referrer"
const ONCE_PREFIX = "vignette_tracked_"

/**
 * The shared catalogue (vignette.id docs/insights/partner-api.md). Using
 * these names for these things is what makes this app's funnel comparable
 * with the website's and the native apps' — a synonym of our own would split
 * every report. Typed as a union so a typo is a build error rather than a
 * name nobody notices is missing for a month.
 *
 * `order.paid`, `order.activated` and `order.refunded` are deliberately
 * absent: the server emits those itself, once per order, from the payment
 * and fulfilment it actually observes. A client must never send them.
 */
export const STANDARD_EVENTS = [
  "app.opened",
  "app.link_opened",
  "app.permission_set",
  "notification.opened",
  "page.viewed",
  "product.viewed",
  "checkout.started",
  "checkout.vehicle_added",
  "checkout.plate_rejected",
  "checkout.addon_toggled",
  "checkout.promo_applied",
  "checkout.payment_opened",
  "checkout.payment_failed",
  "order.created",
  "user.identified",
  "user.signin_started",
  "user.signin_completed",
  "vehicle.lookup_used",
  "offer.viewed",
  "offer.clicked",
  "offer.dismissed",
] as const

export type StandardEvent = (typeof STANDARD_EVENTS)[number]

/**
 * Optional namespace for this app's own events, and **empty on purpose**.
 *
 * Ingest enforces no prefix: it checks the shape of a name, not its owner.
 * The prefix rule lives in POST /event-types and applies only to a *partner's*
 * own types, so that two partners cannot collide or squat a standard name.
 * This app is first-party — there is nobody to collide with — and a prefix
 * costs it two things:
 *
 *  - It puts the app in the slot the object belongs in. Every name in the
 *    catalogue is `object.action`; `spa.rating_submitted` says the app twice,
 *    once here and once in `source`, and says the object nowhere.
 *  - It blocks promotion. `rating.submitted` can become a standard name in
 *    the panel tomorrow and every client keeps sending exactly what it sends
 *    today; a prefixed name has to be renamed first, which breaks the series
 *    at the point it starts being interesting.
 *
 * Set VITE_VIGNETTE_INSIGHTS_PREFIX to a partner prefix only if these ever
 * need registering as one partner's own types rather than as shared names.
 */
const CUSTOM_PREFIX: string = import.meta.env.VITE_VIGNETTE_INSIGHTS_PREFIX || ""

/** `object.action`, lowercase snake_case — what the API's NAME_RE accepts. */
const NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

/** The API takes at most 50 events per request; stay well inside it. */
const MAX_BATCH = 20
const FLUSH_MS = 2000
/** A gap this long means the next event starts a new session. */
const SESSION_IDLE_MS = 30 * 60 * 1000

interface EventExtra {
  context?: Record<string, unknown>
  product?: string
  /**
   * The API's `order_id` is an integer column, but every id this app handles
   * is a string — Postgres bigints arrive as strings and stay that way.
   * Accept either and coerce below; a non-numeric one is dropped rather than
   * sent as NaN.
   */
  order_id?: number | string
}

const asOrderId = (value: number | string | undefined): number | undefined => {
  if (value === undefined) return undefined
  const id = typeof value === "number" ? value : Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

interface IngestEvent {
  event_id: string
  name: string
  occurred_at: string
  source: "web"
  anonymous_id: string | null
  session_id: string | null
  product?: string
  order_id?: number
  context: Record<string, unknown>
  properties: Record<string, unknown>
}

const randomId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  // RFC 4122 v4 layout from Math.random — only for very old WebViews.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === "x" ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

/** Storage can throw (private mode, blocked cookies) — never let it out. */
const read = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const write = (storage: Storage, key: string, value: string): void => {
  try {
    storage.setItem(key, value)
  } catch {
    /* no storage: the id is per-request instead of per-browser */
  }
}

const remembered = (storage: Storage, key: string): string | null => {
  const existing = read(storage, key)
  if (existing) return existing
  const value = randomId()
  write(storage, key, value)
  return value
}

/**
 * One id per browser, so a guest's events and the same person's events after
 * signing in resolve to one person. Survives sign-out on purpose: it is the
 * device, not the account.
 *
 * **It has to be the installation_id**, not an id of its own. The server
 * emits `order.paid` and `order.activated` itself and stamps each with the
 * order's `installation_id` as that event's `anonymous_id` — that stamp is
 * the only thing joining a server-side purchase to the browsing that led to
 * it. A guest has no user_id to fall back on, so two different uuids here
 * mean the funnel events belong to one person and the purchase to another,
 * and checkout-to-paid conversion reads 0% however many orders arrive.
 * Nothing in any response says so: the events all land, the last funnel step
 * is simply always empty.
 *
 * This used to mint its own `vignette_anonymous_id` while orders, promos and
 * push all sent `vignette-spa.install` — exactly that split.
 */
export const anonymousId = (): string | null =>
  typeof window === "undefined" ? null : getInstallationId()

/**
 * One id per tab, rotated after a long absence so "a session" means a visit
 * rather than a tab someone left open for three days. The check runs on
 * every event because an SPA has no page load to hang it on.
 */
export const sessionId = (): string | null => {
  if (typeof window === "undefined") return null
  const now = Date.now()
  const seen = Number(read(window.sessionStorage, SESSION_SEEN_KEY) || 0)
  if (seen && now - seen > SESSION_IDLE_MS) {
    write(window.sessionStorage, SESSION_KEY, randomId())
    // A new session has no referrer yet; what brought the old one here must
    // not be carried over.
    try {
      window.sessionStorage.removeItem(REFERRER_KEY)
    } catch {
      /* ignore */
    }
  }
  write(window.sessionStorage, SESSION_SEEN_KEY, String(now))
  return remembered(window.sessionStorage, SESSION_KEY)
}

/**
 * The sign-in method, carried from `user.signin_started` to
 * `user.signin_completed`.
 *
 * Apple finishes after a full-page redirect away and back (the Services ID's
 * return URL is this origin), so the component that started the sign-in — and
 * every field on it — is gone by the time it succeeds. sessionStorage
 * survives that round trip in the same tab; component state does not.
 */
const SIGNIN_METHOD_KEY = "vignette_signin_method"

export type SigninMethod = "otp" | "apple" | "google" | "guest"

export const rememberSigninMethod = (method: SigninMethod): void => {
  if (typeof window !== "undefined") write(window.sessionStorage, SIGNIN_METHOD_KEY, method)
}

/**
 * Reads and clears. Consuming it is what keeps a later reload — where the
 * store simply rehydrates an existing session — from looking like a second
 * sign-in.
 */
export const takeSigninMethod = (): SigninMethod | null => {
  if (typeof window === "undefined") return null
  const value = read(window.sessionStorage, SIGNIN_METHOD_KEY)
  if (value) {
    try {
      window.sessionStorage.removeItem(SIGNIN_METHOD_KEY)
    } catch {
      /* ignore */
    }
  }
  return (value as SigninMethod) || null
}

/**
 * A trailing slash makes "/vignettes" and "/vignettes/" two rows in the
 * panel's Pages breakdown. One canonical form per path.
 */
const normalizedPath = (pathname: string): string =>
  pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname

/**
 * The site that started this session, hostname only, remembered so every
 * event carries it rather than only the landing view. Empty string means
 * "none" and is remembered too, so an in-app navigation cannot re-read a
 * stale document.referrer.
 */
const sessionReferrer = (): string | undefined => {
  if (typeof window === "undefined") return undefined
  const stored = read(window.sessionStorage, REFERRER_KEY)
  if (stored !== null) return stored || undefined
  let host = ""
  try {
    if (document.referrer) {
      const url = new URL(document.referrer)
      if (url.hostname && url.hostname !== window.location.hostname) {
        host = url.hostname.replace(/^www\./, "")
      }
    }
  } catch {
    /* an unparseable referrer is no referrer */
  }
  write(window.sessionStorage, REFERRER_KEY, host)
  return host || undefined
}

/**
 * What the browser can say about itself without a library: a coarse device
 * class, browser family and OS. None of it identifies a person, and it is
 * what fills the panel's Device column. Computed once — the UA does not
 * change.
 */
let deviceCache: Record<string, string> | null = null
const deviceContext = (): Record<string, string> => {
  if (deviceCache) return deviceCache
  if (typeof navigator === "undefined") return {}
  const ua = navigator.userAgent || ""
  const device =
    /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
      ? "tablet"
      : /Mobi|iPhone|iPod|Android/i.test(ua)
        ? "mobile"
        : "desktop"
  // Order matters: Edge and Opera carry "Chrome", Chrome carries "Safari".
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Firefox\/|FxiOS/.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "other"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "other"
  deviceCache = { device, browser, os }
  return deviceCache
}

// ——— the queue ———

let queue: IngestEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null

/** True once a session exists; insights never creates one (rule 2). */
const hasSession = (): boolean => {
  try {
    return !!useAuthStore.getState().tokens
  } catch {
    return false
  }
}

const send = (events: IngestEvent[]): void => {
  if (!events.length) return
  void api(INGEST_PATH, {
    method: "POST",
    body: { sent_at: new Date().toISOString(), events },
    // With a session the bearer resolves user_id; without one this is an
    // anonymous event and asking for auth would bootstrap a guest session
    // nobody asked for.
    auth: hasSession(),
  }).catch(() => {
    // Dropped on purpose. A retry queue would mean holding events across
    // reloads and re-sending duplicates; the pipeline treats insights as
    // lossy and the panel's numbers are read as trends, not as ledgers.
  })
}

export const flush = (): void => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const batch = queue
  queue = []
  send(batch)
}

const enqueue = (event: IngestEvent): void => {
  queue.push(event)
  if (queue.length >= MAX_BATCH) {
    flush()
    return
  }
  if (!timer) timer = setTimeout(flush, FLUSH_MS)
}

// ——— the public surface ———

/**
 * Record one event. Fire-and-forget by design: it returns void so no caller
 * can await it, and it cannot throw.
 */
export function track(
  name: StandardEvent,
  properties: Record<string, unknown> = {},
  extra: EventExtra = {},
): void {
  send_(name, properties, extra)
}

/**
 * Record an event the shared catalogue has no name for yet — the rating
 * sheet, the language switch, a checkout left at a particular step.
 *
 * Name it the way the catalogue names things: `object.action`, lowercase,
 * past tense, the object first. These are ordinary names that simply are not
 * in the plan yet, and ingest stores them all the same; registering one is a
 * panel action, and the day it happens nothing here changes.
 *
 * A name the API would reject is dropped rather than sent — it would only
 * come back as `invalid_name` in the rejection log.
 *
 * Reach for a standard name first. A name is carried forever whether or not
 * it is registered, and one invented for something the catalogue already
 * covers costs exactly the comparability the catalogue exists to give.
 */
export function trackCustom(
  action: string,
  properties: Record<string, unknown> = {},
  extra: EventExtra = {},
): void {
  const name =
    CUSTOM_PREFIX && !action.includes(".") ? `${CUSTOM_PREFIX}.${action}` : action
  if (!NAME_RE.test(name)) return
  send_(name, properties, extra)
}

function send_(
  name: string,
  properties: Record<string, unknown>,
  extra: EventExtra,
): void {
  try {
    if (typeof window === "undefined") return
    enqueue({
      event_id: randomId(),
      name,
      occurred_at: new Date().toISOString(),
      source: "web",
      anonymous_id: anonymousId(),
      session_id: sessionId(),
      ...(extra.product ? { product: extra.product } : {}),
      ...(asOrderId(extra.order_id) ? { order_id: asOrderId(extra.order_id) } : {}),
      context: {
        page: normalizedPath(window.location.pathname),
        locale: currentLanguage(),
        referrer: sessionReferrer(),
        ...deviceContext(),
        ...(extra.context || {}),
      },
      properties,
    })
  } catch {
    /* insights must never break the thing it is measuring */
  }
}

/**
 * Fire once per browser session — banner impressions and other "did they
 * ever see it" events, which are noise on every render.
 */
export function trackOncePerSession(
  key: string,
  name: StandardEvent,
  properties: Record<string, unknown> = {},
  extra: EventExtra = {},
): void {
  if (onceThisSession(key)) track(name, properties, extra)
}

/** `trackOncePerSession` for one of this app's own names. */
export function trackCustomOncePerSession(
  key: string,
  action: string,
  properties: Record<string, unknown> = {},
  extra: EventExtra = {},
): void {
  if (onceThisSession(key)) trackCustom(action, properties, extra)
}

/** True the first time a key is asked for in this session, false after. */
function onceThisSession(key: string): boolean {
  if (typeof window === "undefined") return true
  const storageKey = ONCE_PREFIX + key
  // No storage: track every time rather than never.
  if (read(window.sessionStorage, storageKey)) return false
  write(window.sessionStorage, storageKey, "1")
  return true
}
