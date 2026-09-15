/**
 * The app's i18n. No dependency — `Intl` does the hard parts (plural
 * categories, language names, dates, numbers) and the rest is a dictionary
 * lookup with `{name}` interpolation.
 *
 * - `src/i18n/locales/en.ts` is the source and the fallback, bundled with the
 *   app so a string is never missing.
 * - `src/i18n/locales/<lang>.json` are the translations, **lazily imported**
 *   (one small chunk per language, only the active one is downloaded). Adding
 *   a file is all it takes to offer a language — the picker and
 *   `SUPPORTED_LANGUAGES` are derived from the glob below, no registry to
 *   edit.
 * - The chosen language is device-local and persisted (like the display
 *   currency), and it is what the API is asked for too (`apiLanguage()`), so
 *   the copy the server writes — plate hints, promo and order messages —
 *   arrives in the same language as the UI around it.
 *
 * Re-rendering: `useT()` subscribes, so a component that uses it updates when
 * the language changes. The bare `t()` reads the current state without
 * subscribing — for module-level helpers and non-React call sites (toasts,
 * formatters). `App` subscribes at the root as well, so the whole tree
 * re-renders on a switch; if a `React.memo` boundary is ever added between
 * the root and a component that only uses bare `t()`, that component must
 * subscribe with `useT()` itself.
 */
import { useMemo } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { en } from "./locales/en"

export type MessageKey = keyof typeof en
/** a plain string, or plural categories selected on `params.count` */
type Message = string | Readonly<Record<string, string>>
export type MessageParams = Record<string, string | number>
type Dictionary = Partial<Record<MessageKey, Message>>

/* ------------------------------------------------------------- languages */

// Lazily-imported translation chunks, keyed "./locales/uk.json".
const loaders = import.meta.glob<Dictionary>("./locales/*.json", { import: "default" })

const codeOf = (path: string) => path.slice("./locales/".length, -".json".length)

/** English plus every translation file present, alphabetical after `en`. */
export const SUPPORTED_LANGUAGES: string[] = [
  "en",
  ...Object.keys(loaders).map(codeOf).sort(),
]

/**
 * The spellings this app accepts for a language beyond its ISO 639-1 code:
 * the site's own locale file names (`ua.json`, `cz.json`, …) and a couple of
 * common non-ISO ones, so a link or a stored preference from elsewhere in the
 * product resolves to the language it means. Mirrors the API's own aliases.
 */
const ALIASES: Record<string, string> = {
  ua: "uk",
  cz: "cs",
  si: "sl",
  rs: "sr",
  ba: "bs",
  se: "sv",
  dk: "da",
  no: "nb",
}

/** "uk-UA" → "uk", "CZ" → "cs"; null when we have no such language. */
export function normalizeLanguage(value: string | null | undefined): string | null {
  if (!value) return null
  const primary = value.trim().toLowerCase().split(/[-_]/)[0]
  const code = ALIASES[primary] ?? primary
  return SUPPORTED_LANGUAGES.includes(code) ? code : null
}

/** The first of the browser's languages we can actually serve, else English. */
export function detectLanguage(): string {
  const wanted = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language])
  for (const tag of wanted) {
    const code = normalizeLanguage(tag)
    if (code) return code
  }
  return "en"
}

/**
 * The language's own name for a picker — "Deutsch", "українська". `Intl`
 * knows these; the code itself is the fallback for a browser that doesn't.
 */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code)
    if (name && name.toLowerCase() !== code) {
      return name.charAt(0).toLocaleUpperCase(code) + name.slice(1)
    }
  } catch {
    /* Intl without this language — fall through */
  }
  return code.toUpperCase()
}

/** A country's name in the active language — `Intl` owns this list, not us. */
export function countryName(code: string, fallback?: string): string {
  try {
    const name = new Intl.DisplayNames([currentLanguage()], { type: "region" }).of(
      code.toUpperCase()
    )
    if (name && name.toUpperCase() !== code.toUpperCase()) return name
  } catch {
    /* unknown region or no Intl data */
  }
  return fallback ?? code.toUpperCase()
}

/* ----------------------------------------------------------------- store */

interface I18nState {
  /** the active language; only this field is persisted */
  language: string
  /** the active language's dictionary — empty for English (en is the source) */
  dictionary: Dictionary
  /** whether the user picked a language, or we followed the device */
  explicit: boolean
  setLanguage: (language: string, options?: { explicit?: boolean }) => Promise<void>
}

const dictionaryCache = new Map<string, Dictionary>()

async function loadDictionary(language: string): Promise<Dictionary> {
  if (language === "en") return {}
  const cached = dictionaryCache.get(language)
  if (cached) return cached
  const loader = loaders[`./locales/${language}.json`]
  if (!loader) return {}
  try {
    const dictionary = await loader()
    dictionaryCache.set(language, dictionary)
    return dictionary
  } catch {
    // the chunk failed (offline on a cold cache) — English is a safe UI
    return {}
  }
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      language: "en",
      dictionary: {},
      explicit: false,
      setLanguage: async (language, options) => {
        const code = normalizeLanguage(language) ?? "en"
        const dictionary = await loadDictionary(code)
        set({ language: code, dictionary, explicit: options?.explicit ?? true })
        if (typeof document !== "undefined") document.documentElement.lang = code
      },
    }),
    {
      name: "vignette-language",
      // the dictionary is a build artefact, never storage
      partialize: (state) => ({ language: state.language, explicit: state.explicit }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<I18nState> | undefined
        const language = normalizeLanguage(stored?.language)
        return {
          ...current,
          // a language whose file has since been removed falls back cleanly
          language: language ?? current.language,
          explicit: Boolean(stored?.explicit) && language !== null,
        }
      },
    }
  )
)

/**
 * Resolves the language and loads its dictionary before the first paint —
 * awaited in `main.tsx`, so the app never renders English and then flips.
 * Without a stored choice, the device's language decides.
 */
export async function initI18n(): Promise<void> {
  const { language, explicit, setLanguage } = useI18nStore.getState()
  await setLanguage(explicit ? language : detectLanguage(), { explicit })
}

/* ------------------------------------------------------------ translation */

const pluralRules = new Map<string, Intl.PluralRules>()

function pluralCategory(language: string, count: number): string {
  let rules = pluralRules.get(language)
  if (!rules) {
    try {
      rules = new Intl.PluralRules(language)
    } catch {
      rules = new Intl.PluralRules("en")
    }
    pluralRules.set(language, rules)
  }
  return rules.select(count)
}

function resolve(
  dictionary: Dictionary,
  language: string,
  key: MessageKey,
  params?: MessageParams
): string {
  const message: Message | undefined = dictionary[key] ?? en[key]
  if (message === undefined) {
    if (import.meta.env.DEV) console.warn(`i18n: unknown key "${key}"`)
    return key
  }

  let text: string
  if (typeof message === "string") {
    text = message
  } else {
    // plural forms — a translation may carry only the categories its language
    // has, so fall back through `other` (required) to whatever exists
    const count = Number(params?.count ?? 0)
    const category = pluralCategory(language, count)
    text =
      message[category] ??
      message.other ??
      message.one ??
      Object.values(message)[0] ??
      ""
  }

  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  )
}

/**
 * Translate a key. Does NOT subscribe to language changes — use it in
 * module-level helpers, toasts and formatters; use `useT()` in components.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const { dictionary, language } = useI18nStore.getState()
  return resolve(dictionary, language, key, params)
}

/** The active language — for `Intl` formatters and the API's `?lang=`. */
export function currentLanguage(): string {
  return useI18nStore.getState().language
}

/**
 * The locale `Intl` should format dates and numbers with. Same as the
 * language, except English: plain "en" means US conventions (Sep 10, 2026),
 * and this is a European product whose English UI has always shown day first
 * — "en-GB" keeps 10 Sep 2026 without changing the language.
 */
export function formattingLocale(): string {
  const language = currentLanguage()
  return language === "en" ? "en-GB" : language
}

/**
 * What to ask the API for. The same code the UI is in: the server falls back
 * to English for a language it doesn't have, which is exactly what this app
 * would show around it.
 */
export function apiLanguage(): string {
  return currentLanguage()
}

/**
 * `t` bound to the active language, and the language itself. Subscribes, so
 * the component re-renders when the language changes.
 */
export function useT(): {
  t: (key: MessageKey, params?: MessageParams) => string
  language: string
} {
  const language = useI18nStore((state) => state.language)
  const dictionary = useI18nStore((state) => state.dictionary)
  return useMemo(
    () => ({
      t: (key: MessageKey, params?: MessageParams) =>
        resolve(dictionary, language, key, params),
      language,
    }),
    [dictionary, language]
  )
}

/** Just the active language, for a component that only formats. */
export function useLanguage(): string {
  return useI18nStore((state) => state.language)
}

/* --------------------------------------------------- coverage (dev panel) */

export interface TranslationCoverage {
  language: string
  total: number
  translated: number
  missing: MessageKey[]
  /** keys in the translation that `en.ts` no longer has */
  unknown: string[]
}

/** What the active translation covers — Account → "Translations (dev)". */
export function translationCoverage(): TranslationCoverage {
  const { language, dictionary } = useI18nStore.getState()
  const keys = Object.keys(en) as MessageKey[]
  const missing = language === "en" ? [] : keys.filter((key) => !(key in dictionary))
  const unknown = Object.keys(dictionary).filter((key) => !(key in en))
  return {
    language,
    total: keys.length,
    translated: keys.length - missing.length,
    missing,
    unknown,
  }
}
