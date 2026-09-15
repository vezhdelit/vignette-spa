/**
 * The plate matcher, built from `GET /public/vehicles/plate-rules`.
 *
 * That document is the same file the server runs (api/frontend/plate-rules
 * .json), so applying it in the exact order its `_readme` prescribes gives
 * the same verdict, error type and message as the API — which is what lets
 * the order form reject a bad plate before it costs a round trip. The server
 * still re-validates every order, so a stale manifest can never let a plate
 * through; `POST /public/vehicles/validate` and order creation are the truth.
 *
 * Regex dialect: ECMAScript, no flags, with lookahead. Never compile a rule
 * with the `g` flag — they are cached and reused, and `lastIndex` would
 * survive between `.test()` calls.
 *
 * `runPlateRuleVectors` checks this implementation against the conformance
 * cases from `GET /public/vehicles/plate-rules/vectors` (Account → "Plate
 * rules" in dev).
 */
import { t } from "@/i18n"
import type {
  PlateRuleError,
  PlateRuleSet,
  PlateRuleVector,
  PlateRulesManifest,
} from "@/types/api"

export interface PlateVerdict {
  valid: boolean
  /** the NORMALIZED plate — adopt it: that is the form an order stores */
  plate: string
  error: PlateRuleError | null
}

interface CompiledRules {
  forbid: { regex: RegExp; type: string; message: string }[]
  accept: { regex: RegExp; unless: RegExp[] }[]
  message: string
  /** positive expectations, in order — the customer's "why" (see plateHintText) */
  explain: { regex: RegExp; message: string }[]
}

// Keyed by manifest version + country, so a rules update recompiles and a
// re-fetch that changed nothing reuses everything.
const rulesCache = new Map<string, CompiledRules>()
const disallowedCache = new Map<string, RegExp>()

/** `[^0-9A-Za-z…-]` — the characters normalization drops. */
function disallowedFor(manifest: PlateRulesManifest): RegExp {
  const cached = disallowedCache.get(manifest.version)
  if (cached) return cached
  const regex = new RegExp(`[^${manifest.normalize.allowed_characters}]`, "g")
  disallowedCache.set(manifest.version, regex)
  return regex
}

/**
 * Step 3 of the algorithm: trim, drop every character outside
 * `normalize.allowed_characters`, uppercase, keep only the first hyphen.
 * Mirrors api/frontend/plate-patterns.js#normalizePlate.
 */
export function normalizePlate(manifest: PlateRulesManifest, plate: string): string {
  const stripped = String(plate ?? "")
    .trim()
    .replace(disallowedFor(manifest), "")
    .toUpperCase()

  let collapsed = ""
  for (const char of stripped) {
    if (char !== "-" || !collapsed.includes("-")) collapsed += char
  }
  return collapsed
}

function compile(
  rules: PlateRuleSet,
  fallbackMessage: string,
  explain: { pattern: string; message: string }[] = []
): CompiledRules {
  const message = rules.message || fallbackMessage
  return {
    forbid: (rules.forbid || []).map((entry) => ({
      regex: new RegExp(entry.pattern),
      type: entry.type || "invalid_plate",
      message: entry.message || message,
    })),
    accept: (rules.accept || []).map((entry) =>
      typeof entry === "string"
        ? { regex: new RegExp(entry), unless: [] }
        : {
            regex: new RegExp(entry.pattern),
            unless: (entry.unless || []).map((source) => new RegExp(source)),
          }
    ),
    message,
    explain: explain.map((entry) => ({
      regex: new RegExp(entry.pattern),
      message: entry.message,
    })),
  }
}

/**
 * The rule set for one country: its own, or `unlisted.rules` when the code is
 * accepted but has no entry (it, fr, rs, …).
 */
function rulesFor(manifest: PlateRulesManifest, country: string): CompiledRules {
  const key = `${manifest.version}:${country}`
  const cached = rulesCache.get(key)
  if (cached) return cached

  const spec = manifest.countries[country]
  const compiled = compile(
    spec ? spec.rules : manifest.unlisted.rules,
    manifest.default_message,
    spec?.explain
  )
  rulesCache.set(key, compiled)
  return compiled
}

/**
 * Why a plate the rules rejected is wrong, in the customer's terms: the first
 * `explain` expectation the NORMALIZED plate does not meet, with `{plate}` /
 * `{length}` filled in. Null when every expectation holds — the pieces are
 * right, the arrangement isn't — or the country has no explain list.
 */
export function explainPlate(
  manifest: PlateRulesManifest,
  plate: string,
  country: string
): string | null {
  const code = String(country ?? "").toLowerCase()
  if (!manifest.countries[code]) return null
  for (const entry of rulesFor(manifest, code).explain) {
    if (!entry.regex.test(plate)) {
      return entry.message
        .replace(/\{plate\}/g, plate)
        .replace(/\{length\}/g, String(plate.length))
    }
  }
  return null
}

/**
 * Format-check one plate, in the order the manifest prescribes — each step
 * only runs when every earlier one passed.
 */
export function checkPlate(
  manifest: PlateRulesManifest,
  plate: string,
  country: string
): PlateVerdict {
  const raw = String(plate ?? "")
  const code = String(country ?? "").toLowerCase()
  const tooShort = (value: string): PlateVerdict => ({
    valid: false,
    plate: value,
    error: manifest.normalize.min_length_error,
  })

  // 1. empty plate/country, or a RAW plate under the minimum (before any
  //    normalization — that is what the server checks first)
  if (!raw || !code || raw.length < manifest.normalize.min_length) {
    return tooShort(raw)
  }

  // 2. a country the API does not accept at all: no format rule runs
  if (!manifest.country.accepted.includes(code)) {
    return {
      valid: false,
      plate: raw,
      error: {
        type: manifest.country.unknown_error.type,
        message: manifest.country.unknown_error.message_template.replace(
          "{country}",
          code
        ),
      },
    }
  }

  // 3. normalize — dropping characters can push it back under the minimum
  const normalized = normalizePlate(manifest, raw)
  if (normalized.length < manifest.normalize.min_length) {
    return tooShort(normalized)
  }

  // 4./5. the first forbid match is the verdict
  const rules = rulesFor(manifest, code)
  for (const rule of rules.forbid) {
    if (rule.regex.test(normalized)) {
      return {
        valid: false,
        plate: normalized,
        error: { type: rule.type, message: rule.message },
      }
    }
  }

  // 6. valid when ANY accept entry matches and none of its `unless` do
  for (const rule of rules.accept) {
    if (rule.regex.test(normalized) && !rule.unless.some((u) => u.test(normalized))) {
      return { valid: true, plate: normalized, error: null }
    }
  }

  // 7. nothing accepted it
  return {
    valid: false,
    plate: normalized,
    error: { type: "invalid_plate", message: rules.message },
  }
}

/**
 * What to put under the plate field. The manifest's own per-country messages
 * are written for a customer; the fallback `default_message` is a link to the
 * partner docs, which no app user wants — that one is rephrased.
 */
export function plateErrorText(
  manifest: PlateRulesManifest,
  verdict: PlateVerdict,
  countryName?: string
): string | null {
  if (verdict.valid || !verdict.error) return null
  if (verdict.error.message !== manifest.default_message) return verdict.error.message
  return countryName
    ? t("plate.invalidForCountry", { country: countryName })
    : t("plate.invalidGeneric")
}

/**
 * The line under a rejected plate. First the specific reason, from the
 * country's `explain` expectations run against the normalized plate — "A
 * Ukrainian plate is 8 characters — two letters, four digits, two letters;
 * AAAAAA has 6" — and only when none of them is unmet, what right looks like:
 * "e.g. AA 1234 BB or KA 6797 MT: two letters, four digits, two letters".
 * Same text the server puts on a `POST /vehicles/validate` row. Null for an
 * unknown country, one without customer copy, and for a verdict where the
 * format isn't the problem (too short, unknown country) — then the message
 * alone is the whole story. When a `forbid` rule rejected the plate its
 * message already is the why, so explain is skipped: a second, unrelated
 * expectation next to "Plate must not include Q" would only confuse.
 */
export function plateHintText(
  manifest: PlateRulesManifest,
  country: string,
  verdict?: PlateVerdict | null
): string | null {
  if (verdict?.error && ["invalid_format", "invalid_country"].includes(verdict.error.type)) {
    return null
  }
  const code = String(country ?? "").toLowerCase()
  const forbidFired =
    Boolean(verdict?.error) &&
    Boolean(manifest.countries[code]) &&
    verdict!.error!.message !== rulesFor(manifest, code).message
  if (verdict && !forbidFired) {
    const reason = explainPlate(manifest, verdict.plate, code)
    if (reason) return reason
  }
  const hint = manifest.countries[code]?.hint
  if (!hint) return null
  // assembled the way the server does it, from the manifest's own template
  // (served in the manifest's language) — "e.g. AA 1234 BB / KA 6797 MT: …"
  const examples = hint.examples.join(" / ")
  if (!examples) return hint.format
  return (manifest.hint_template ?? "e.g. {examples}: {format}")
    .replace("{examples}", examples)
    .replace("{format}", hint.format)
}

/**
 * Conformance check against `GET /public/vehicles/plate-rules/vectors`: every
 * case run through the matcher above, so a rules change that this
 * implementation would read differently shows up as a failure instead of as
 * a rejected order.
 */
export function runPlateRuleVectors(
  manifest: PlateRulesManifest,
  vectors: PlateRuleVector[]
): {
  total: number
  passed: number
  failures: (PlateRuleVector & { got: boolean; errorType: string | null })[]
} {
  const failures: (PlateRuleVector & { got: boolean; errorType: string | null })[] = []

  for (const vector of vectors) {
    const verdict = checkPlate(manifest, vector.plate, vector.country)
    if (verdict.valid !== vector.valid) {
      failures.push({
        ...vector,
        got: verdict.valid,
        errorType: verdict.error?.type ?? null,
      })
    }
  }

  return { total: vectors.length, passed: vectors.length - failures.length, failures }
}
