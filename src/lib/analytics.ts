import { api } from "@/lib/api"
import { currentLanguage } from "@/i18n"
import { useAuthStore } from "@/stores/auth"

/**
 * Event analytics for the SPA — the browser half of the pipeline the panel
 * reads (vignette.id docs/analytics/partner-api.md).
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
 *     a request that needs auth; analytics must not be what triggers that,
 *     so it sends unauthenticated until a session exists on its own.
 *  3. It batches. A page view fires on every navigation; sending one request
 *     each would be a request per click. Events queue and flush on a short
 *     timer, on page hide, and when the batch is full.
 */

/**
 * The quiet alias of /public/analytics/events. Identical endpoint, same
 * controller — but ad blockers match "/analytics/" and a trailing "/events"
 * as a matter of course, and a blocked request never reaches a server log to
 * explain itself. Roughly a quarter of desktop traffic runs a blocker, and
 * losing exactly the people who run one skews every number on the page.
 */
const INGEST_PATH = "/public/insights/records"

const ANONYMOUS_KEY = "vignette_anonymous_id"
const SESSION_KEY = "vignette_session_id"
const SESSION_SEEN_KEY = "vignette_session_seen_at"
const REFERRER_KEY = "vignette_session_referrer"
const ONCE_PREFIX = "vignette_tracked_"

/** The API takes at most 50 events per request; stay well inside it. */
const MAX_BATCH = 20
const FLUSH_MS = 2000
/** A gap this long means the next event starts a new session. */
const SESSION_IDLE_MS = 30 * 60 * 1000

type Consent = "granted" | "denied" | "unknown"

interface EventExtra {
  context?: Record<string, unknown>
  consent?: Consent
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
  consent: Consent
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
 */
export const anonymousId = (): string | null =>
  typeof window === "undefined" ? null : remembered(window.localStorage, ANONYMOUS_KEY)

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

/** True once a session exists; analytics never creates one (rule 2). */
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
    // reloads and re-sending duplicates; the pipeline treats analytics as
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
  name: string,
  properties: Record<string, unknown> = {},
  extra: EventExtra = {},
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
      // The SPA has no cookie banner: it runs where the shell around it owns
      // consent, so it states what it knows rather than claiming permission.
      consent: extra.consent || "unknown",
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
    /* analytics must never break the thing it is measuring */
  }
}

/**
 * Fire once per browser session — banner impressions and other "did they
 * ever see it" events, which are noise on every render.
 */
export function trackOncePerSession(
  key: string,
  name: string,
  properties: Record<string, unknown> = {},
  extra: EventExtra = {},
): void {
  if (typeof window !== "undefined") {
    const storageKey = ONCE_PREFIX + key
    // No storage: track every time rather than never.
    if (read(window.sessionStorage, storageKey)) return
    write(window.sessionStorage, storageKey, "1")
  }
  track(name, properties, extra)
}
