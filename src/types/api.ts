/**
 * DTOs for the vignette.id public API (`/api/public/*`).
 * Success envelope: { error: null, result, pages? } — failure: { error: { type, message, field? } }.
 */

export interface ApiError {
  type: string
  message: string
  field?: string
}

export interface ApiEnvelope<T> {
  error: ApiError | null
  result: T
  pages?: { total: number; current: number }
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

export interface Me {
  id: string
  email: string | null
  guest: boolean
  created_at: number | null
}

export interface Wallet {
  balance: number
  bonuses: number
  currency: string
}

export interface Referrals {
  code: string
  link: string
  invited: number
  sales: number
  income: number
}

export interface Vehicle {
  id: number | string
  plate: string
  country: string
  vin_code: string | null
  created_at: number
}

export interface AppNotification {
  id: number | string
  title: string
  body: string
  data: Record<string, unknown> | null
  read: boolean
  read_at: number | null
  created_at: number
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
  custom_id?: string
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
}

export interface CreateOrderResult {
  user_id: string
  orders: Order[]
  payment_link: string
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
