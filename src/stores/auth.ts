import { create } from "zustand"
import { persist } from "zustand/middleware"
import { api, apiResult, configureApi, type StoredTokens } from "@/lib/api"
import type {
  EmailRequiredResult,
  Me,
  OtpStartResult,
  SessionInfo,
  TokenPayload,
  TokenUser,
} from "@/types/api"

/** 200 → tokens (signed in); 202 → email_required (finish via linkSocialEmail) */
export type SocialVerifyResult =
  | { status: "ok" }
  | { status: "email_required"; linkToken: string; expiresIn: number }

interface AuthState {
  tokens: StoredTokens | null
  user: TokenUser | null
  me: Me | null
  /** booting = restoring/creating the initial session */
  status: "booting" | "ready"

  bootstrap: () => Promise<void>
  /** single-flight: create a guest session if there is none */
  ensureSession: () => Promise<void>
  continueAsGuest: () => Promise<void>
  startOtp: (email: string) => Promise<OtpStartResult>
  verifyOtp: (challengeId: string, code: string) => Promise<void>
  /** POST /public/auth/nonce — single-use, 5-min TTL, bound to this client */
  fetchNonce: () => Promise<string>
  verifySocial: (
    provider: "apple" | "google",
    token: string,
    nonce: string
  ) => Promise<SocialVerifyResult>
  /** completes a 202 email_required: link_token + the OTP challenge result */
  linkSocialEmail: (args: {
    linkToken: string
    challengeId: string
    code: string
  }) => Promise<void>
  refreshMe: () => Promise<void>
  fetchSessions: () => Promise<SessionInfo[]>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
}

function toStoredTokens(payload: TokenPayload): StoredTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessExpiresAt: Date.now() + payload.expires_in * 1000,
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      tokens: null,
      user: null,
      me: null,
      status: "booting",

      async bootstrap() {
        const { tokens } = get()
        if (!tokens) {
          // first launch — the app works immediately on an anonymous session,
          // exactly like the mobile app (sign-in lives in Account).
          // Failure (rate limit, offline) is tolerated: ensureSession retries
          // lazily before the next authenticated call.
          try {
            await get().ensureSession()
          } catch {
            /* retried on demand */
          }
          set({ status: "ready" })
          return
        }
        set({ status: "ready" })
        void get().refreshMe()
      },

      async ensureSession() {
        if (get().tokens) return
        if (!guestInFlight) {
          guestInFlight = get()
            .continueAsGuest()
            .finally(() => {
              guestInFlight = null
            })
        }
        return guestInFlight
      },

      async continueAsGuest() {
        const result = await apiResult<TokenPayload>("/public/auth/guest", {
          method: "POST",
          body: { device_name: deviceName() },
          auth: false,
        })
        set({ tokens: toStoredTokens(result), user: result.user, me: null })
        void get().refreshMe()
      },

      async startOtp(email: string) {
        return apiResult<OtpStartResult>("/public/auth/otp/start", {
          method: "POST",
          body: { email },
          auth: false,
        })
      },

      async verifyOtp(challengeId: string, code: string) {
        const result = await apiResult<TokenPayload>("/public/auth/otp/verify", {
          method: "POST",
          body: {
            challenge_id: challengeId,
            code,
            device_name: deviceName(),
          },
          auth: false,
        })
        set({ tokens: toStoredTokens(result), user: result.user, me: null })
        void get().refreshMe()
      },

      async fetchNonce() {
        const result = await apiResult<{ nonce: string; expires_in: number }>(
          "/public/auth/nonce",
          { method: "POST", auth: false }
        )
        return result.nonce
      },

      async verifySocial(provider, token, nonce) {
        const body =
          provider === "apple"
            ? { identity_token: token, nonce, device_name: deviceName() }
            : { id_token: token, nonce, device_name: deviceName() }

        const result = await apiResult<TokenPayload | EmailRequiredResult>(
          `/public/auth/${provider}/verify`,
          { method: "POST", body, auth: false }
        )

        if ("status" in result && result.status === "email_required") {
          return {
            status: "email_required",
            linkToken: result.link_token,
            expiresIn: result.expires_in,
          }
        }

        const tokens = result as TokenPayload
        set({ tokens: toStoredTokens(tokens), user: tokens.user, me: null })
        void get().refreshMe()
        return { status: "ok" }
      },

      async linkSocialEmail({ linkToken, challengeId, code }) {
        const result = await apiResult<TokenPayload>(
          "/public/auth/social/link-email",
          {
            method: "POST",
            body: {
              link_token: linkToken,
              challenge_id: challengeId,
              code,
              device_name: deviceName(),
            },
            auth: false,
          }
        )
        set({ tokens: toStoredTokens(result), user: result.user, me: null })
        void get().refreshMe()
      },

      async refreshMe() {
        if (!get().tokens) return
        try {
          const me = await apiResult<Me>("/public/me")
          set({ me, user: { id: me.id, email: me.email, guest: me.guest } })
        } catch {
          // token problems are handled by the api client hooks
        }
      },

      async fetchSessions() {
        return apiResult<SessionInfo[]>("/public/auth/sessions")
      },

      async logout() {
        const refreshToken = get().tokens?.refreshToken
        set({ tokens: null, user: null, me: null })
        if (refreshToken) {
          try {
            await api("/public/auth/logout", {
              method: "POST",
              body: { refresh_token: refreshToken },
              auth: false,
            })
          } catch {
            // 204 always in practice; ignore network failures
          }
        }
        // fall back to a fresh guest session so the app keeps working
        try {
          await get().continueAsGuest()
        } catch {
          /* offline — screens handle it */
        }
      },

      async logoutAll() {
        try {
          await api("/public/auth/logout-all", { method: "POST" })
        } finally {
          set({ tokens: null, user: null, me: null })
          try {
            await get().continueAsGuest()
          } catch {
            /* offline */
          }
        }
      },
    }),
    {
      name: "vignette-auth",
      partialize: (state) => ({ tokens: state.tokens, user: state.user }),
    }
  )
)

let guestInFlight: Promise<void> | null = null

function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return "iPhone (web)"
  if (/Android/.test(ua)) return "Android (web)"
  return "Web browser"
}

// Wire the api client to this store (tokens live here, api.ts stays store-free)
configureApi({
  getTokens: () => useAuthStore.getState().tokens,
  onTokens: (payload) =>
    useAuthStore.setState({
      tokens: toStoredTokens(payload),
      user: payload.user,
    }),
  onSessionLost: () =>
    useAuthStore.setState({ tokens: null, user: null, me: null }),
  ensureSession: () => useAuthStore.getState().ensureSession(),
})
