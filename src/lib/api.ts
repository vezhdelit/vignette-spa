import type { ApiEnvelope, ApiError, TokenPayload } from "@/types/api"

/**
 * Thin fetch client for the vignette.id public API.
 *
 * - Always sends `X-Client-Id` (public client).
 * - Sends `Authorization: Bearer <access JWT>` when a session exists.
 * - Access tokens live 15 min: refresh is done proactively when the token is
 *   within 30s of expiry, and reactively (single-flight) on a 401.
 * - Success envelope { error: null, result } is unwrapped; failures throw
 *   ApiRequestError carrying the server's { type, message, field }.
 *
 * The auth store owns token state; it registers itself here via configureApi()
 * so this module stays dependency-free (no circular imports).
 */

export const API_BASE: string =
  import.meta.env.VITE_VIGNETTE_API_BASE || "/api"

export const CLIENT_ID: string =
  import.meta.env.VITE_VIGNETTE_CLIENT_ID || ""

export class ApiRequestError extends Error {
  type: string
  field?: string
  status: number
  /** seconds, from the Retry-After header on 429s */
  retryAfter?: number

  constructor(status: number, error: ApiError | null, retryAfter?: number) {
    super(error?.message || `Request failed (${status})`)
    this.name = "ApiRequestError"
    this.status = status
    this.type = error?.type || "unknown_error"
    this.field = error?.field
    this.retryAfter = retryAfter
  }
}

/** What to show a user for a failed request — surfaces Retry-After on 429s. */
export function apiErrorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof ApiRequestError) {
    return e.retryAfter ? `${e.message} — try again in ${e.retryAfter}s` : e.message
  }
  return e instanceof Error ? e.message : fallback
}

function retryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After")
  if (!raw) return undefined
  const seconds = parseInt(raw, 10)
  return Number.isFinite(seconds) ? seconds : undefined
}

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** unix ms when the access token expires */
  accessExpiresAt: number
}

interface ApiHooks {
  getTokens: () => StoredTokens | null
  /** persist a rotated token pair (from token/refresh) */
  onTokens: (payload: TokenPayload) => void
  /** refresh token is dead — session is gone */
  onSessionLost: () => void
  /**
   * No session at all — create one (guest) before an authed call goes out.
   * Must throw (ApiRequestError) when it can't, so the caller gets the real
   * reason (e.g. rate_limited) instead of the server's "Missing user access
   * token".
   */
  ensureSession: () => Promise<void>
}

let hooks: ApiHooks | null = null

export function configureApi(next: ApiHooks) {
  hooks = next
}

let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const tokens = hooks?.getTokens()
    if (!tokens?.refreshToken) return null

    try {
      const res = await fetch(`${API_BASE}/public/auth/token/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": CLIENT_ID,
        },
        body: JSON.stringify({ refresh_token: tokens.refreshToken }),
      })
      const body = (await res.json()) as ApiEnvelope<TokenPayload>
      if (!res.ok || body.error) {
        // invalid_grant — revoked/expired/reused: the session is gone
        hooks?.onSessionLost()
        return null
      }
      hooks?.onTokens(body.result)
      return body.result.access_token
    } catch {
      // The response was lost after the request may have gone out. Refresh
      // tokens are single-use with family revocation on reuse (integration
      // guide: "never retry a refresh request with the same token after a
      // timeout"), so the only safe move is to drop the session.
      hooks?.onSessionLost()
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

async function authHeader(): Promise<Record<string, string>> {
  const tokens = hooks?.getTokens()
  if (!tokens?.accessToken) return {}

  if (Date.now() > tokens.accessExpiresAt - 30_000) {
    const fresh = await refreshAccessToken()
    if (fresh) return { Authorization: `Bearer ${fresh}` }
    const after = hooks?.getTokens()
    return after?.accessToken
      ? { Authorization: `Bearer ${after.accessToken}` }
      : {}
  }

  return { Authorization: `Bearer ${tokens.accessToken}` }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** attach the user access token (default true) */
  auth?: boolean
  /** internal: don't retry again after a refresh */
  _retried?: boolean
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { method = "GET", body, query, auth = true } = options

  const url = new URL(API_BASE + path, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = { "X-Client-Id": CLIENT_ID }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (auth) {
    // sessionless (first launch, or the silent guest bootstrap failed):
    // create one now rather than sending a doomed unauthenticated request
    if (!hooks?.getTokens() && hooks?.ensureSession) {
      await hooks.ensureSession()
    }
    Object.assign(headers, await authHeader())
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) {
    return { error: null, result: undefined as T }
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiRequestError(res.status, null, retryAfterSeconds(res))
  }

  // 202 (e.g. social verify → email_required) is a success envelope
  if (!res.ok || envelope.error) {
    // one reactive refresh+retry on an expired/invalid access token
    if (
      res.status === 401 &&
      auth &&
      !options._retried &&
      envelope.error?.type === "invalid_token" &&
      hooks?.getTokens()?.refreshToken
    ) {
      const fresh = await refreshAccessToken()
      if (fresh) return api<T>(path, { ...options, _retried: true })
    }
    if (res.status === 401 && envelope.error?.type === "session_revoked") {
      hooks?.onSessionLost()
    }
    throw new ApiRequestError(res.status, envelope.error, retryAfterSeconds(res))
  }

  return envelope
}

/** Binary endpoints (e.g. /public/me/apple-pass) — returns the raw blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = { "X-Client-Id": CLIENT_ID }
  Object.assign(headers, await authHeader())
  const res = await fetch(API_BASE + path, { headers })
  if (!res.ok) {
    let error: ApiError | null = null
    try {
      error = ((await res.json()) as ApiEnvelope<unknown>).error
    } catch {
      /* not json */
    }
    throw new ApiRequestError(res.status, error)
  }
  return res.blob()
}

/** Unwrapped convenience — most callers only want `result`. */
export async function apiResult<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await api<T>(path, options)).result
}
