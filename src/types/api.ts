/**
 * DTOs for the vignette.id public API (`/api/public/*`).
 * Success envelope: { error: null, result, pages? } — failure: { error: { type, message, field? } }.
 */

export interface ApiError {
  type: string
  message: string
  field?: string
  /** promo_not_eligible only — which condition failed (e.g. "min_cars") */
  reason?: string
}

export interface ApiEnvelope<T> {
  error: ApiError | null
  result: T
  pages?: { total: number; current: number }
  /** GET /public/me/notifications only — the badge numbers ride alongside the page */
  unread_count?: number
  total_count?: number
}

/* ------------------------------------------------------------------ auth */

export interface TokenUser {
  id: string
  email: string | null
  guest: boolean
}

export interface TokenPayload {
  token_type: "Bearer"
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
  user: TokenUser
}

export interface OtpStartResult {
  challenge_id: string
  expires_in: number
  resend_after: number
}

/** 202 from apple/google verify when the provider didn't disclose a usable email. */
export interface EmailRequiredResult {
  status: "email_required"
  link_token: string
  expires_in: number
}

export interface SessionInfo {
  id: string
  client_id: string
  env: "live" | "sandbox"
  device_name: string | null
  ip: string | null
  user_agent: string | null
  created_at: number
  last_used_at: number | null
  current: boolean
}

/* -------------------------------------------------------------------- me */

/**
 * Server verdict on the "rate the app" sheet — the server decides WHETHER,
 * the app decides WHERE. `after_purchase`: never prompted, show once right
 * after a checkout completes. `anywhere`: prompted before and closed without
 * rating; any natural moment is fine. `none`: rated already, asked less than
 * 14 days ago, or more than a year since the first prompt.
 */
export type RatePrompt = "none" | "after_purchase" | "anywhere"

export interface Me {
  id: string
  email: string | null
  guest: boolean
  created_at: number | null
  /** true from the first submitted rating on; never goes back */
  has_rated: boolean
  rate_prompt: RatePrompt
}

/** POST /public/me/rating and /rating/dismissed both answer the fresh flags. */
export interface RatingState {
  has_rated: boolean
  rate_prompt: RatePrompt
  /** rating call only — 4–5 stars: continue into the store review flow */
  store_review?: boolean
}

/* ---------------------------------------------------------------- wallet */

/**
 * GET /public/me/wallet. Every amount is INTEGER CENTS.
 *
 * Two pots: `balance` is money paid in (top-ups) plus referral rewards and
 * is withdrawable; `bonuses` is top-up bonus tiers and promo cashback and
 * can only be spent on an order. A checkout spends `bonuses` first — that
 * order is `checkout.debit_order`, not something to hardcode here.
 *
 * `env` is which wallet this session sees: a sandbox client has its own
 * sandbox wallet, topped up through Stripe test mode, and can never reach
 * the live one.
 */
export interface Wallet {
  env: "live" | "sandbox"
  balance: number
  bonuses: number
  /** balance + bonuses — what a checkout could draw on */
  total: number
  currency: string
  top_up: {
    enabled: boolean
    currency: string
    provider: "stripe"
    min_amount: number
    max_amount: number
    /** the tiles to offer, each with the bonus that amount earns */
    presets: { amount: number; bonus: number }[]
    bonus_tiers: { from: number; bonus: number }[]
  }
  checkout: {
    /** whether `wallet: { use: true }` on an order will be accepted */
    enabled: boolean
    /** which pot is spent first, e.g. ["bonuses", "balance"] */
    debit_order: ("balance" | "bonuses")[]
  }
}

/** The app-facing vocabulary of a ledger row (services/wallet.js#LEDGER_TYPES). */
export type WalletEntryType =
  | "top_up"
  | "order_payment"
  | "referral_reward"
  | "cashback"
  | "cashback_reversal"
  | "withdrawal"
  | "refund"
  | "bonus"
  | "welcome_bonus"
  | "adjustment"
  | "other"

export type WalletEntryStatus = "pending" | "completed" | "cancelled"

/** GET /public/me/wallet/transactions — one row of the statement, in cents. */
export interface WalletTransaction {
  id: number
  type: WalletEntryType
  direction: "credit" | "debit"
  amount: number
  /** top-ups only: the bonus the tier granted on top of `amount` */
  bonus: number
  pot: "balance" | "bonuses" | "mixed"
  /** mixed rows (an order paid from both pots): how the amount split */
  split: { balance: number | null; bonuses: number | null } | null
  status: WalletEntryStatus
  currency: string
  order_id: number | null
  description: string | null
  created_at: number | null
  updated_at: number | null
}

/**
 * The Stripe block a NATIVE payment sheet would confirm. This app does not
 * use it: the server also returns `payment_link`, a hosted page that mounts
 * Stripe, PayPal and Monobank itself, so the SPA embeds that in an iframe
 * exactly as it embeds an order's checkout and needs no Stripe SDK at all.
 */
export interface TopUpPayment {
  provider: "stripe"
  env: "live" | "sandbox"
  publishable_key: string | null
  client_secret: string
  payment_intent_id: string
  customer_id: string | null
  customer_session_client_secret: string | null
  customer_ephemeral_key_secret: string | null
}

/** POST /public/me/wallet/top-ups, and the GET :id poll. Cents. */
export interface TopUp {
  id: number
  amount: number
  bonus: number
  currency: string
  status: WalletEntryStatus
  env: "live" | "sandbox"
  provider: string | null
  created_at: number | null
  completed_at: number | null
  /**
   * The hosted checkout page. Present on create and, while the top-up is
   * still pending, on the poll too — so a reload never loses it. Null once
   * there is nothing left to pay.
   */
  payment_link: string | null
  /** the raw Stripe intent, for native sheets; unused here */
  payment?: TopUpPayment | null
  /** poll and cancel: the balances after whatever this call did */
  wallet?: Pick<Wallet, "balance" | "bonuses" | "total" | "currency">
}

/* ------------------------------------------------------------- referrals */

/**
 * GET /public/me/referrals. `income` is INTEGER CENTS and lands in the
 * wallet's `balance`, which is what makes a reward spendable at checkout.
 * Vocabulary: INVITER shared the link and gets the money, INVITED used it
 * and their purchases pay.
 */
export interface Referrals {
  code: string
  link: string
  invited: number
  sales: number
  income: number
  currency: string
  rewards: {
    /** cents paid to the inviter per purchase */
    level_1: number
    /** cents paid to the inviter's own inviter */
    level_2: number
    pot: "balance" | "bonuses"
  }
  /** who invited this account, if anyone */
  inviter: ReferralInviter | null
}

/** Another account as a referral may show it — the email is masked server-side. */
export interface ReferralInviter {
  code: string | null
  display_name: string | null
}

/** GET /public/me/referrals/invited — one person this account invited. */
export interface ReferralInvited {
  id: string
  display_name: string | null
  joined_at: number | null
  /** rewarded purchases they have made */
  purchases: number
  /** cents they have earned this account so far */
  earned: number
}

/** GET /public/me/referrals/earnings — one (order, level) reward paid. */
export interface ReferralEarning {
  id: number
  level: number
  amount: number
  currency: string
  order_id: number
  invited_display_name: string | null
  source: string
  created_at: number
}

/** GET /public/referrals/:code — client credential only, before sign-in. */
export interface ReferralLookup {
  valid: boolean
  inviter: ReferralInviter
  rewards: { level_1: number; level_2: number; currency: string }
}

/** POST /public/me/referrals/claim */
export interface ReferralClaimResult {
  inviter: ReferralInviter
  linked_at: number
}

/**
 * GET /public/me/vehicles. Signed in: the account's saved cars (vehicles
 * table, numeric id). Guest: the distinct plates on the orders this session
 * placed itself — no DB row, so `id` is the string "<country>:<plate>".
 * Treat `id` as opaque either way.
 */
export interface Vehicle {
  id: number | string
  plate: string
  country: string
  vin_code: string | null
  created_at: number | null
}

export interface AppNotification {
  id: number | string
  title: string
  body: string
  /** same shape as the push payload, e.g. { type: "order_paid", order_id } */
  data: Record<string, unknown> | null
  read: boolean
  read_at: number | null
  created_at: number
}

/** GET /public/me/notifications/summary — badge numbers + newest row, no read-state write. */
export interface NotificationsSummary {
  unread_count: number
  total_count: number
  latest: AppNotification | null
}

export interface Consent {
  partner_id: number | string
  scope: string
  granted_at: number
}

/* ---------------------------------------------------------------- orders */

export type OrderStatusLabel =
  | "CREATED"
  | "PENDING"
  | "ACTIVE"
  | "EXPIRED"
  | "DEFERRED"
  | "WILL BE ACTIVE"
  | "REFUNDED"
  | "DELETED"
  | "UNPAID DELETED"
  | "USER DELETED"
  | "UNDEFINED"

export interface OrderCar {
  plate: string
  country: string
  provider_id?: string | null
  pdf?: string | null
}

export interface OrderAction {
  eligible: boolean
  available_at?: number | null
  expires_at?: number | null
  reason_code?: string | null
}

export interface RefundAction extends OrderAction {
  amount_eur?: number
  percent?: number
}

export interface Order {
  id: string
  custom_id: string | null
  product: string
  cars: OrderCar[]
  purchase_date: number | null
  start_from: number | null
  start_date: number | null
  /** unix seconds, or the string "YYYY-MM-DD 23:59" for products without a
   *  unix validity window (helpers/order-status.js#prepareDates), or null */
  end_date: number | string | null
  period: string | number
  type: string
  country: string
  status: OrderStatusLabel
  receipt: string | null
  subaccount?: string | null
  vehicle_type?: string | null
  flex?: { type?: string; enabled?: boolean } | boolean | null
  modify?: OrderAction
  full_refund?: RefundAction
  partial_refund?: RefundAction
  /** CREATED (unpaid) orders only: the checkout URL — reopen it to finish paying */
  payment_link?: string
  /** the one promo this order carries, or null (helpers/promo-rules.js#publicPromoView) */
  promo?: OrderPromo | null
}

/**
 * GET /public/me/orders/:id/status — the checkout poll: just the label (and
 * payment_link while unpaid), none of the cars/prices/action blocks.
 */
export interface OrderStatus {
  id: string
  custom_id: string | null
  status: OrderStatusLabel
  payment_link?: string
}

export interface OrderChange {
  type: string
  field: string
  old_value: unknown
  new_value: unknown
  date: number
}

export interface CreateOrderCar {
  plate: string
  country: string
  vin_code?: string
}

export interface CreateOrderProduct {
  name: string
  period: string
  start_date: number
  flex?: { type: "default" | "expanded"; enabled: boolean }
  /**
   * REQUIRED in practice: /public/me/orders pins order_has_been_paid: false,
   * and validatePartnerCustomIds rejects unpaid products without one
   * ("Custom id is required if order_has_been_paid set to false"). Must be
   * unique per partner — use a fresh UUID per attempt.
   */
  custom_id: string
}

export interface CreateOrderBody {
  terms_and_privacy_accepted: boolean
  cars: CreateOrderCar[]
  products: CreateOrderProduct[]
  allowed_payment_providers?: string[]
  open_order_details_by_default?: boolean
  email?: string
  installation_id?: string
  /**
   * A promo code the user typed, validated first with
   * POST /public/me/promos/validate. Omit it and the server still applies the
   * best auto-apply campaign the order qualifies for. The same `promo_*`
   * errors as validate come back here (with `field: "promo_code"`) when the
   * code stopped applying in between.
   */
  promo_code?: string
  /**
   * Driver-info products (e.g. Moldova): required when the selected period
   * carries "driver_info_required". Field names per
   * services/partner-order.js#validatePartnerDriverInfo — user_name,
   * passport_number, passport_country.
   */
  user?: {
    user_name: string
    passport_number: string
    passport_country: string
    email?: string
  }
  /**
   * Pay from the wallet. The server reserves min(wallet, order total,
   * max_amount) — bonuses before balance — when the order is created, and
   * the payment page then charges only `payment.due`. When the wallet
   * covers everything there is no payment_link at all and the order is
   * already paid. Signed-in sessions only (a guest has no wallet).
   */
  wallet?: {
    use: boolean
    /** cents; cap what may be taken from the wallet for this order */
    max_amount?: number
  }
}

/**
 * POST /public/me/orders returns slim order stubs, not the full read shape —
 * verified live: { id, custom_id, currency, profit, vat_fee, flex }. Fetch
 * GET /public/me/orders/:id for the full order.
 */
export interface CreatedOrderStub {
  id: string
  custom_id: string
  currency?: string
  flex?: { type?: string; enabled?: boolean; price?: number } | null
}

export interface CreateOrderResult {
  user_id: string
  orders: CreatedOrderStub[]
  /**
   * Absent when the wallet covered the whole order — `payment.status` is
   * then "paid" and the order is already PENDING, so there is nothing to
   * open and nothing to poll. Branch on `payment.status`, not on this.
   */
  payment_link?: string
  /**
   * How this order is being paid. Present on every /public/me order
   * response; `wallet` is null unless the request asked to use it.
   */
  payment?: OrderPaymentSummary
}

/** All cents. `due` is what the payment page will charge. */
export interface OrderPaymentSummary {
  status: "paid" | "payment_required"
  total: number
  due: number
  currency: string
  wallet: {
    applied: number
    from_balance: number
    from_bonuses: number
  } | null
}

/* --------------------------------------------------------------- catalog */

export interface ProductPeriodPrice {
  total_price: number
  government_price: number
  partner_fee: number
  currency: string
  restrictions?: string[]
}

export interface ProductRestrictions {
  height?: string
  seats?: string
  weight?: string
  width?: string
  direction?: string
}

export interface CatalogProduct {
  name: string
  title: string
  type: "vignette" | "tunnel"
  icon: string
  color: string | null
  country: string
  vehicle_type: string | null
  priority: number
  status: "active" | "offline"
  restrictions: ProductRestrictions | null
  price: Record<string, ProductPeriodPrice>
}

export interface FlexOption {
  type: "default" | "expanded" | string
  price: number
  original_price: number
  currency: string
  per: string
  enabled: boolean
  is_default: boolean
  is_partner_paid: boolean
}

/* ---------------------------------------------------------------- promos */

/**
 * The promo an order carries, or null. Always EUR: an order settles in EUR
 * whatever the display currency is. `cashback_status` is `pending` until the
 * order is paid, then `granted` (credited to wallet.bonuses), `reversed`
 * after a full refund, or `skipped` when the buyer had no wallet.
 */
export interface OrderPromo {
  code: string | null
  name: string | null
  /** one-liner like "-10% vignette, 2 € cashback" */
  effect_summary: string | null
  discount_eur: number
  cashback_eur: number
  cashback_status: "pending" | "granted" | "reversed" | "skipped" | null
}

/** The promo POST /public/me/promos/validate resolved for an order. */
export interface PromoInfo {
  code: string | null
  name: string
  kind: "shared" | "unique" | "auto" | string
  effect_summary: string
  /** true when no code was sent and the server picked an auto campaign */
  auto: boolean
}

/** What the payment link will charge — EUR, whatever the display currency. */
export interface PromoPricePreview {
  subtotal_eur: number
  discount_eur: number
  pay_price_eur: number
  currency: string
}

/**
 * 200 from POST /public/me/promos/validate. A code that cannot be used is a
 * 400 with a `promo_*` type instead; `valid: false` with `promo: null` is the
 * "no auto campaign applies" answer to `code: null`.
 */
export interface PromoValidateResult {
  valid: boolean
  promo: PromoInfo | null
  discount_eur: number
  cashback_eur?: number
  price_preview: PromoPricePreview
}

/** The order the promo is priced against — same shapes as POST /me/orders. */
export interface PromoValidateProduct {
  name: string
  period: string
  start_date: number
  flex?: { type: "default" | "expanded"; enabled: boolean }
}

export interface PromoValidateBody {
  /** null asks for the best auto-apply campaign instead of a typed code */
  code: string | null
  /** may be empty for a price-only preview before the plate is typed */
  cars: { plate: string; country: string }[]
  products: PromoValidateProduct[]
  /** guests / anonymous installs: what per-user limits key on */
  email?: string
  installation_id?: string
}

/* --------------------------------------------------------------- vehicles */

/**
 * GET /public/vehicles/lookup — the registry behind a plate. Every field
 * except plate/country may be null, and the keys are always present, so the
 * shape never depends on which registry answered. `color`, `body_type` and
 * `fuel_type` are lowercase snake_case English open enums — show a term we
 * don't recognise as-is.
 */
export interface VehicleLookup {
  plate: string
  country: string
  vin_code: string | null
  brand: string | null
  model: string | null
  year: number | null
  color: string | null
  body_type: string | null
  fuel_type: string | null
  engine_capacity: number | null
  own_weight: number | null
  total_weight: number | null
  category: string | null
  registration_date: string | null
}

/**
 * GET /public/vehicles/lookup/supported-countries — which plate countries
 * resolve and which fields each can fill. Gate the "find my VIN" affordance
 * on this instead of hardcoding `ua`.
 */
export interface VehicleLookupCountry {
  country: string
  fields: string[]
}

/** One row of POST /public/vehicles/validate. `plate` is the NORMALIZED plate. */
export interface VehicleCheck {
  plate: string | null
  country: string | null
  valid: boolean
  /** whether GET /public/vehicles/lookup can resolve this plate's country */
  lookup_supported?: boolean
  /** invalid_format | invalid_country | invalid_plate | duplicate_vehicle */
  error?: { type: string; message: string }
  /**
   * On a format failure: the customer's "why" (the manifest's explain /
   * hint text, same as lib/plate-rules.ts#plateHintText builds). Absent for
   * a short plate, an unknown country or a duplicate.
   */
  hint?: string | null
}

export interface VehiclesValidateResult {
  /** true only when every vehicle passed */
  valid: boolean
  vehicles: VehicleCheck[]
}

/* ------------------------------------------------------------ plate rules */

export interface PlateRuleError {
  type: string
  message: string
}

export interface PlateForbidRule {
  /** stable across languages and versions — what a translation addresses */
  id?: string
  pattern: string
  type: string
  message: string
}

/** A string is a bare pattern; the object form only counts when no `unless` matches. */
export type PlateAcceptRule = string | { pattern: string; unless: string[] }

export interface PlateRuleSet {
  forbid: PlateForbidRule[]
  accept: PlateAcceptRule[]
  message?: string
}

/**
 * GET /public/vehicles/plate-rules — the plate rules as data, so a form can
 * validate locally and only call POST /public/vehicles/validate at submit.
 * It is the same file the server runs, so a matcher built from it returns the
 * same verdict, error type and message (see lib/plate-rules.ts).
 */
export interface PlateRulesManifest {
  version: string
  /** the language every message in this copy is in (ISO 639-1) … */
  language?: string
  /** … and the languages the API can serve */
  languages?: string[]
  changelog?: string[]
  readme?: string[]
  default_message: string
  /** "e.g. {examples}: {format}" — how a country's hint line is assembled */
  hint_template?: string
  normalize: {
    steps: string[]
    /** a regex character-class body, e.g. "0-9A-Za-zćčšž…-" */
    allowed_characters: string
    min_length: number
    min_length_error: PlateRuleError
  }
  country: {
    notes?: string[]
    /** every country code the API accepts at all, lowercase ISO-3166-1 alpha-2 */
    accepted: string[]
    unknown_error: { type: string; message_template: string }
  }
  /** applies to an accepted country with no rules of its own (it, fr, rs, …) */
  unlisted: { notes?: string | string[]; rules: PlateRuleSet }
  countries: Record<
    string,
    {
      /**
       * Customer copy for under a rejected plate: `format` in plain words,
       * `examples` in the issued style. A forbid message says what is wrong;
       * this says what right looks like. Null where the file has none.
       */
      hint?: { format: string; examples: string[] } | null
      /**
       * Ordered positive expectations every valid plate of the country meets.
       * Consulted only after the rules rejected a plate: the first one the
       * normalized plate does NOT match is the reason to show — `message`
       * may carry `{plate}` and `{length}`.
       */
      explain?: { id?: string; pattern: string; message: string }[]
      notes?: string[]
      /** informational — the names the rules were built from */
      lists?: Record<string, string[]>
      patterns?: Record<string, string>
      rules: PlateRuleSet
    }
  >
}

export interface PlateRuleVector {
  country: string
  plate: string
  valid: boolean
  why?: string
}

/** GET /public/vehicles/plate-rules/vectors — conformance cases for the manifest. */
export interface PlateRuleVectors {
  version: string
  vectors: PlateRuleVector[]
}
