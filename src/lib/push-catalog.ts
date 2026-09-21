/**
 * Push notifications are translated on the device (vignette.id's
 * docs/push/ios-integration.md §3 "Rendering the device's language"). A push,
 * and every row of GET /public/me/notifications, carries `data.loc`:
 *
 *   { title: "notifications.order_paid.title", body: "notifications.order_paid.body", args: { country: "at" } }
 *
 * plus the English sentence as `title`/`body`, which is the fallback. The
 * strings are the `notifications.<type>.*` keys of the API's translations
 * (`GET /public/locales/:language?prefix=notifications`) — the same catalog
 * the iOS app downloads, so both render one wording — and this module is the
 * SPA's copy of it. Their placeholders are single-brace (`{country}`), the
 * apps' convention, not the site's `{{name}}`:
 *
 * - fetched for the active UI language, re-fetched when it changes
 *   (`startPushCatalog()` subscribes to the i18n store), persisted so the
 *   inbox renders instantly and offline;
 * - published into the Cache API under a synthetic URL, because the service
 *   worker (public/sw.js) shows the OS notification and has no access to
 *   `localStorage`, module state or `import.meta.env`. The worker only reads
 *   that cache; it never fetches;
 * - rendered per field: a key the catalog lacks keeps the English — never a
 *   raw key. Arguments are raw values formatted BY NAME (the vocabulary is
 *   the contract): `country` an ISO code, `expires_at` unix seconds shown in
 *   Europe/Berlin (validity ends at 23:59 there), `amount`/`bonus` euro cents
 *   with two decimals — the € sign is in the template.
 *
 * The worker's copy of these rules is in public/sw.js#formatArg; keep the two
 * in step, or the banner and the inbox disagree about the same message.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { apiResult } from "@/lib/api"
import { countryLabel } from "@/lib/countries"
import { currentLanguage, formattingLocale, useI18nStore } from "@/i18n"
import type { AppNotification, PushLoc } from "@/types/api"

export interface PushCatalog {
  language: string
  /** `version` of the API's locales manifest — what a push names as `catalog_version` */
  version: string
  /** flat `notifications.<type>.*` keys → templates with `{name}` placeholders */
  strings: Record<string, string>
}

/** Cache API store + entry the service worker reads the catalog from. */
export const PUSH_CATALOG_CACHE = "vignette-push-catalog"
export const PUSH_CATALOG_URL = "/__push-catalog"

/* ----------------------------------------------------------------- store */

interface PushCatalogState {
  catalog: PushCatalog | null
  setCatalog: (catalog: PushCatalog | null) => void
}

const usePushCatalogStore = create<PushCatalogState>()(
  persist(
    (set) => ({
      catalog: null,
      setCatalog: (catalog) => set({ catalog }),
    }),
    { name: "vignette-push-catalog" }
  )
)

/** The catalog for the active language, or null while none is known. Subscribes. */
export function usePushCatalog(): PushCatalog | null {
  return usePushCatalogStore((state) => state.catalog)
}

/* ------------------------------------------------------------------ sync */

interface LocaleStringsResult {
  language: string
  version: string
  strings: Record<string, string>
}

// Client credential only — translations are not user-scoped. A language the
// API has no file for is 404 unsupported_language; offline is a network
// error. Either way: null, and the caller decides what to keep showing.
async function fetchCatalog(language: string): Promise<PushCatalog | null> {
  try {
    const result = await apiResult<LocaleStringsResult>(
      `/public/locales/${encodeURIComponent(language)}`,
      { query: { prefix: "notifications" }, auth: false }
    )
    return { language: result.language, version: result.version, strings: result.strings }
  } catch {
    return null
  }
}

// The worker has no storage this page can write except the Cache API, so
// the catalog goes in as a synthetic response. `caches` is absent on an
// insecure origin and may throw with storage blocked — the worker then
// shows the English fallback, which is the designed degradation.
async function publishToServiceWorker(catalog: PushCatalog | null): Promise<void> {
  if (typeof caches === "undefined") return
  try {
    const cache = await caches.open(PUSH_CATALOG_CACHE)
    if (!catalog) {
      await cache.delete(PUSH_CATALOG_URL)
      return
    }
    await cache.put(
      PUSH_CATALOG_URL,
      new Response(JSON.stringify(catalog), {
        headers: { "Content-Type": "application/json" },
      })
    )
  } catch {
    /* storage blocked */
  }
}

let syncInFlight: Promise<void> | null = null

/**
 * Fetch the active language's catalog and hand it to both consumers. A
 * failed fetch keeps the stored catalog only when it is for the SAME
 * language (offline refresh); for a different one it is dropped, so a
 * switch to a language the API cannot serve shows English rather than the
 * previous language.
 */
export function syncPushCatalog(): Promise<void> {
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    const language = currentLanguage()
    const fetched = await fetchCatalog(language)
    const stored = usePushCatalogStore.getState().catalog
    const next = fetched ?? (stored?.language === language ? stored : null)
    usePushCatalogStore.getState().setCatalog(next)
    await publishToServiceWorker(next)
  })().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

/**
 * Called once at boot (main.tsx), after the language is known. Republishes
 * the persisted catalog to the worker first — the browser may have evicted
 * the cache while localStorage survived — then refreshes from the API, and
 * again on every language switch. Never awaited: the app must not wait for
 * push copy.
 */
export function startPushCatalog(): void {
  void publishToServiceWorker(usePushCatalogStore.getState().catalog)
  void syncPushCatalog()

  let last = currentLanguage()
  useI18nStore.subscribe((state) => {
    if (state.language !== last) {
      last = state.language
      void syncPushCatalog()
    }
  })
}

/* ------------------------------------------------------------- rendering */

const PLACEHOLDER = /\{(\w+)\}/g
const TIME_ZONE = "Europe/Berlin"

function expiryDate(unixSeconds: number): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }
  try {
    return new Intl.DateTimeFormat(formattingLocale(), options).format(new Date(unixSeconds * 1000))
  } catch {
    return new Intl.DateTimeFormat("en-GB", options).format(new Date(unixSeconds * 1000))
  }
}

function euroCents(cents: number): string {
  const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  try {
    return new Intl.NumberFormat(formattingLocale(), options).format(cents / 100)
  } catch {
    return new Intl.NumberFormat("en", options).format(cents / 100)
  }
}

// The argument vocabulary. Unknown names print as-is, so a new argument the
// server starts sending is never lost — it just isn't formatted yet.
function formatArg(name: string, value: unknown): string {
  switch (name) {
    case "country":
      return countryLabel(String(value))
    case "expires_at":
      return expiryDate(Number(value))
    case "amount":
    case "bonus":
      return euroCents(Number(value))
    default:
      return String(value)
  }
}

/** `data.loc` when it is well-formed, else null (older rows, other data). */
export function pushLocOf(data: AppNotification["data"]): PushLoc | null {
  const loc = data?.loc
  if (!loc || typeof loc !== "object") return null
  const { title, body, args } = loc
  if (title !== null && typeof title !== "string") return null
  if (body !== null && typeof body !== "string") return null
  return { title, body, args: args && typeof args === "object" ? args : {} }
}

/**
 * One field: the catalog's template for `key` with its placeholders filled,
 * or `fallback` (the English the server sent) when there is no key, no
 * catalog, or the catalog predates the key.
 */
export function renderPushField(
  key: string | null,
  args: PushLoc["args"],
  fallback: string,
  catalog: PushCatalog | null
): string {
  if (!key || !catalog) return fallback
  const template = catalog.strings[key]
  if (typeof template !== "string") return fallback
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    name in args ? formatArg(name, args[name]) : whole
  )
}

/** A notification's title and body in the active language. */
export function renderNotification(
  notification: Pick<AppNotification, "title" | "body" | "data">,
  catalog: PushCatalog | null
): { title: string; body: string } {
  const loc = pushLocOf(notification.data)
  if (!loc) return { title: notification.title, body: notification.body }
  return {
    title: renderPushField(loc.title, loc.args, notification.title, catalog),
    body: renderPushField(loc.body, loc.args, notification.body, catalog),
  }
}
