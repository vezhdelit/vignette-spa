/**
 * Emission-class pricing (Romania — vignette.id docs/emission-classes).
 *
 * A class-priced period of the catalogue carries `default_emission_class`
 * (the class its own price stands for, and what an order naming none pays)
 * and `emission_classes`: a whole quote per class on sale. The buyer picks
 * the single Euro norm on their registration certificate; the order sends it
 * as `cars[i].emission_class` and the server prices it as the norm's class
 * and buys the vignette for that exact norm.
 */
import type { MessageKey, MessageParams } from "@/i18n"
import type { EmissionClass, ProductPeriodPrice } from "@/types/api"

/** The norms offered, newest first: what the registration certificate says. */
export const EMISSION_NORMS = [
  "electric",
  "euro6",
  "euro5",
  "euro4",
  "euro3",
  "euro2",
  "euro1",
  "euro0",
] as const

export type EmissionNorm = (typeof EMISSION_NORMS)[number]

/** The picker's order: most emissions first, like the colour bar over it. */
export const EMISSION_NORMS_BY_EMISSIONS = [...EMISSION_NORMS].reverse()

/** Badge colours, dirtiest (warm) to cleanest (green). */
export const EMISSION_NORM_COLORS: Record<EmissionNorm, string> = {
  euro0: "#E39086",
  euro1: "#E8A07C",
  euro2: "#EBB27A",
  euro3: "#EAC47E",
  euro4: "#DDD08A",
  euro5: "#BBCF92",
  euro6: "#9CCBA4",
  electric: "#86BE9C",
}

/**
 * Typical first-registration years of a passenger car per norm, a hint for
 * someone who doesn't know theirs: [from, to], null for open-ended.
 */
export const EMISSION_NORM_YEARS: Record<
  Exclude<EmissionNorm, "electric">,
  [number | null, number | null]
> = {
  euro0: [null, 1992],
  euro1: [1992, 1996],
  euro2: [1996, 2000],
  euro3: [2000, 2005],
  euro4: [2005, 2009],
  euro5: [2009, 2014],
  euro6: [2014, null],
}

/**
 * The class that prices each norm. The server's grouping
 * (api/helpers/emission-classes.js#NORM_CLASS) — keep the two equal.
 */
const NORM_CLASS: Record<EmissionNorm, EmissionClass> = {
  electric: "electric",
  euro6: "euro6",
  euro5: "euro5_4",
  euro4: "euro5_4",
  euro3: "euro3_0",
  euro2: "euro3_0",
  euro1: "euro3_0",
  euro0: "euro3_0",
}

export const normClass = (norm: EmissionNorm): EmissionClass => NORM_CLASS[norm]

/**
 * "Euro 0–3" for a class, "Euro 4" / "Electric" for a norm. Takes the
 * caller's `t` (from useT) so the labels re-render on a language switch.
 */
export function emissionLabels(t: (key: MessageKey, params?: MessageParams) => string) {
  const classLabel = (emissionClass: EmissionClass) =>
    ({
      electric: t("emission.electric"),
      euro6: t("emission.euro", { norm: "6" }),
      euro5_4: t("emission.euro", { norm: "4–5" }),
      euro3_0: t("emission.euro", { norm: "0–3" }),
    })[emissionClass]
  const normLabel = (norm: EmissionNorm) =>
    norm === "electric"
      ? t("emission.electric")
      : t("emission.euro", { norm: norm.slice(4) })
  return { classLabel, normLabel }
}

/** The short badge shown next to a norm: "EV", "E6" … "E0". */
export const normBadge = (norm: EmissionNorm) =>
  norm === "electric" ? "EV" : "E" + norm.slice(4)

export const isClassPriced = (price: ProductPeriodPrice | null | undefined) =>
  price?.emission_class_supported === true && !!price.emission_classes

/** True when any period of the product is priced by class. */
export const anyClassPriced = (prices: Record<string, ProductPeriodPrice>) =>
  Object.values(prices).some(isClassPriced)

/**
 * One period's quote as `norm` pays it: its class's own quote, or the
 * period's for no norm, a class not on sale, or a period whose price does
 * not depend on class.
 */
export function classQuote(
  price: ProductPeriodPrice,
  norm: EmissionNorm | null,
): ProductPeriodPrice {
  if (!norm || !isClassPriced(price)) return price
  return price.emission_classes?.[normClass(norm)] ?? price
}

/** The class `price` shows for `norm`: the norm's own, else the default. */
export function pricedClass(
  price: ProductPeriodPrice | null | undefined,
  norm: EmissionNorm | null,
): EmissionClass | null {
  if (!price || !isClassPriced(price)) return null
  if (norm && price.emission_classes?.[normClass(norm)]) return normClass(norm)
  return price.default_emission_class ?? null
}

/**
 * Whether the period sells `norm`. Always true for a period not priced by
 * class: the server neither validates nor prices the field there.
 */
export function isNormSold(
  price: ProductPeriodPrice | null | undefined,
  norm: EmissionNorm | null,
) {
  if (!norm || !price || !isClassPriced(price)) return true
  return !!price.emission_classes?.[normClass(norm)]
}

/**
 * How much cheaper, in whole percent rounded down, the cheapest class is
 * than the default class. 0 when every class costs the same.
 */
export function classSavings(price: ProductPeriodPrice): number {
  if (!isClassPriced(price) || price.total_price <= 0) return 0
  const cheapest = Math.min(
    ...Object.values(price.emission_classes ?? {}).map((quote) => quote!.total_price),
  )
  return Math.max(
    0,
    Math.floor(((price.total_price - cheapest) / price.total_price) * 100),
  )
}
