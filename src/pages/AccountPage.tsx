import { useCallback, useEffect, useRef, useState } from "react"
import {
  BadgeCheck,
  Bell,
  BellRing,
  Car,
  ChevronDown,
  Copy,
  Gift,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  UserRound,
  Wallet as WalletIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { PlateBadge } from "@/components/order/PlateBadge"
import { api, apiResult, ApiRequestError } from "@/lib/api"
import { formatCents, formatDate } from "@/lib/format"
import {
  APPLE_CLIENT_ID,
  GOOGLE_CLIENT_ID,
  initAppleSignIn,
  isAppleCancel,
  renderGoogleButton,
  signInWithApple,
} from "@/lib/social"
import { useAuthStore } from "@/stores/auth"
import { useOrdersStore } from "@/stores/orders"
import {
  currentSubscription,
  getInstallationId,
  subscribe,
  unsubscribe,
  webPushSupported,
} from "@/lib/webpush"
import { cn } from "@/lib/utils"
import type {
  AppNotification,
  Consent,
  Referrals,
  SessionInfo,
  Vehicle,
  Wallet,
} from "@/types/api"

function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) {
    return e.retryAfter
      ? `${e.message} — try again in ${e.retryAfter}s`
      : e.message
  }
  return e instanceof Error ? e.message : "Something went wrong"
}

export function AccountPage() {
  const me = useAuthStore((s) => s.me)
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const isGuest = user?.guest ?? true

  return (
    <div className="space-y-4 pt-2">
      <h1 className="px-1 text-[26px] font-extrabold text-white">Account</h1>

      {/* profile card */}
      <div className="flex items-center gap-4 rounded-[24px] bg-white p-4">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft/60">
          <UserRound className="size-8 text-brand" />
        </span>
        <div className="min-w-0 flex-1">
          {status === "booting" ? (
            <div className="h-5 w-32 animate-pulse rounded-full bg-cloud" />
          ) : (
            <>
              <p className="truncate text-[17px] font-extrabold text-navy">
                {isGuest ? "Guest" : (me?.email ?? user?.email ?? "—")}
              </p>
              <p className="text-[13px] font-semibold text-navy-soft">
                {isGuest
                  ? "Sign in to keep your vignettes across devices"
                  : me?.created_at
                    ? `Member since ${formatDate(me.created_at)}`
                    : "Signed in"}
              </p>
            </>
          )}
        </div>
        {!isGuest && <BadgeCheck className="size-6 text-mint-deep" />}
      </div>

      {isGuest ? <SignInCard /> : <SignedInSections />}

      {!isGuest && <SignOutButtons />}
      <p className="pt-1 text-center text-xs font-medium text-white/60">
        User ID: {user?.id ?? "—"}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- sign in */

type SignInMode =
  | { kind: "email" }
  | { kind: "otp"; email: string; challengeId: string }
  /** apple/google verify answered 202 email_required */
  | { kind: "link-email"; provider: string; linkToken: string }
  | {
      kind: "link-otp"
      provider: string
      linkToken: string
      email: string
      challengeId: string
    }

function SignInCard() {
  const startOtp = useAuthStore((s) => s.startOtp)
  const verifyOtp = useAuthStore((s) => s.verifyOtp)
  const fetchNonce = useAuthStore((s) => s.fetchNonce)
  const verifySocial = useAuthStore((s) => s.verifySocial)
  const linkSocialEmail = useAuthStore((s) => s.linkSocialEmail)
  const reloadOrders = useOrdersStore((s) => s.load)

  const [mode, setMode] = useState<SignInMode>({ kind: "email" })
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const googleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const onSignedIn = () => {
    useOrdersStore.getState().reset()
    void reloadOrders()
    toast.success("Signed in")
  }

  const finishSocial = useCallback(
    async (provider: "apple" | "google", token: string, nonce: string) => {
      setBusy(true)
      try {
        const result = await verifySocial(provider, token, nonce)
        if (result.status === "email_required") {
          // provider disclosed no usable email — collect one via OTP
          setMode({ kind: "link-email", provider, linkToken: result.linkToken })
          setEmail("")
        } else {
          onSignedIn()
        }
      } catch (e) {
        toast.error(errorMessage(e))
      } finally {
        setBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verifySocial]
  )

  // Google: the nonce is baked into the rendered button — arm on mount.
  // Nonces are single-use (5-min TTL), so re-arm after every credential.
  const armGoogle = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID || !googleRef.current) return
    try {
      const nonce = await fetchNonce()
      await renderGoogleButton(googleRef.current, {
        nonce,
        onCredential: (idToken) => {
          void finishSocial("google", idToken, nonce).finally(() => {
            void armGoogle()
          })
        },
      })
    } catch {
      /* button simply doesn't render */
    }
  }, [fetchNonce, finishSocial])

  // Apple: all async prep happens ahead of the tap (popup-blocker rule) and
  // re-arms after every attempt — the nonce is consumed server-side even on
  // a failed verify.
  const appleNonce = useRef<string | null>(null)
  const armApple = useCallback(async () => {
    if (!APPLE_CLIENT_ID) return
    try {
      const nonce = await fetchNonce()
      await initAppleSignIn(nonce)
      appleNonce.current = nonce
    } catch {
      appleNonce.current = null
    }
  }, [fetchNonce])

  useEffect(() => {
    void armGoogle()
    void armApple()
  }, [armGoogle, armApple])

  const onAppleClick = () => {
    // NO await before signInWithApple() — see lib/social.ts
    const nonce = appleNonce.current
    signInWithApple()
      .then((identityToken) => {
        if (!identityToken || !nonce) {
          toast.error("Apple sign-in didn't return a token")
          return
        }
        return finishSocial("apple", identityToken, nonce)
      })
      .catch((e) => {
        if (!isAppleCancel(e)) toast.error(errorMessage(e))
      })
      .finally(() => {
        void armApple()
      })
  }

  const start = async () => {
    setBusy(true)
    try {
      const result = await startOtp(email.trim())
      setResendIn(result.resend_after)
      setCode("")
      if (mode.kind === "link-email" || mode.kind === "link-otp") {
        setMode({
          kind: "link-otp",
          provider: mode.provider,
          linkToken: mode.linkToken,
          email: email.trim(),
          challengeId: result.challenge_id,
        })
      } else {
        setMode({ kind: "otp", email: email.trim(), challengeId: result.challenge_id })
      }
      toast.success("Code sent — check your inbox")
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value: string) => {
    setBusy(true)
    try {
      if (mode.kind === "otp") {
        await verifyOtp(mode.challengeId, value)
      } else if (mode.kind === "link-otp") {
        await linkSocialEmail({
          linkToken: mode.linkToken,
          challengeId: mode.challengeId,
          code: value,
        })
      } else {
        return
      }
      onSignedIn()
    } catch (e) {
      toast.error(errorMessage(e))
      setCode("")
    } finally {
      setBusy(false)
    }
  }

  const emailValid = /.+@.+\..+/.test(email)
  const showEmailForm = mode.kind === "email" || mode.kind === "link-email"
  const showOtpForm = mode.kind === "otp" || mode.kind === "link-otp"

  return (
    <div className="rounded-[24px] bg-white p-5">
      <h2 className="text-lg font-extrabold text-navy">Sign in</h2>

      {mode.kind === "link-email" && (
        <p className="mt-2 rounded-xl bg-brand-soft/50 px-3 py-2 text-sm font-semibold text-navy">
          Your {mode.provider === "apple" ? "Apple ID" : "Google account"} didn't
          share a usable email. Enter your real email — we'll verify it with a
          code and link it to your {mode.provider} sign-in.
        </p>
      )}

      {showEmailForm && (
        <>
          {mode.kind === "email" && (
            <p className="mt-1 text-sm font-semibold text-navy-soft">
              We'll email you a 6-digit code. No password needed.
            </p>
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && emailValid && start()}
            placeholder="Email"
            className="mt-4 w-full rounded-2xl bg-[#f1f4f8] px-4 py-3.5 text-center text-lg font-semibold text-navy outline-none placeholder:text-navy-soft"
          />
          <button
            type="button"
            disabled={busy || !emailValid}
            onClick={start}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-pink py-3.5 text-lg font-extrabold tracking-wider text-white uppercase transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy && <Spinner className="text-white" />} Send code
          </button>
        </>
      )}

      {showOtpForm && (
        <>
          <p className="mt-1 text-sm font-semibold text-navy-soft">
            Enter the code we sent to{" "}
            <span className="text-navy">{mode.email}</span>
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "")
              setCode(value)
              if (value.length === 6) void verify(value)
            }}
            placeholder="••••••"
            className="mt-4 w-full rounded-2xl bg-[#f1f4f8] px-4 py-3.5 text-center text-3xl font-extrabold tracking-[0.5em] text-navy outline-none placeholder:text-navy-soft/50"
          />
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setMode(
                  mode.kind === "link-otp"
                    ? {
                        kind: "link-email",
                        provider: mode.provider,
                        linkToken: mode.linkToken,
                      }
                    : { kind: "email" }
                )
              }
              className="text-sm font-bold text-navy-soft"
            >
              Change email
            </button>
            <button
              type="button"
              disabled={resendIn > 0 || busy}
              onClick={start}
              className="text-sm font-bold text-brand disabled:opacity-50"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </div>
          {busy && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-navy-soft">
              <Spinner /> Verifying…
            </p>
          )}
        </>
      )}

      {/* social sign-in — only when the env configures the provider */}
      {mode.kind === "email" && (GOOGLE_CLIENT_ID || APPLE_CLIENT_ID) && (
        <div className="mt-4 border-t border-[#eef2f6] pt-4">
          <p className="mb-3 text-center text-xs font-bold tracking-wider text-navy-soft uppercase">
            or continue with
          </p>
          <div className="space-y-2.5">
            {GOOGLE_CLIENT_ID && (
              <div ref={googleRef} className="flex justify-center" />
            )}
            {APPLE_CLIENT_ID && (
              <button
                type="button"
                onClick={onAppleClick}
                className="mx-auto flex w-full max-w-[400px] items-center justify-center gap-2 rounded-full bg-black py-2.5 text-[15px] font-bold text-white transition active:scale-[0.98]"
              >
                 Continue with Apple
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------- signed-in extras */

function SignedInSections() {
  return (
    <div className="space-y-3">
      <WalletSection />
      <ReferralsSection />
      <VehiclesSection />
      <NotificationsSection />
      <PushSection />
      <SessionsSection />
      <ConsentsSection />
    </div>
  )
}

/** Collapsible white card; `load` runs on first expand (not on mount). */
function Section({
  icon: Icon,
  title,
  children,
  onFirstOpen,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  onFirstOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const openedOnce = useRef(false)

  const toggle = () => {
    if (!openedOnce.current && !open) {
      openedOnce.current = true
      onFirstOpen?.()
    }
    setOpen((v) => !v)
  }

  return (
    <div className="overflow-hidden rounded-[24px] bg-white">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3.5 p-4 text-left"
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft/60">
          <Icon className="size-5.5 text-brand" />
        </span>
        <span className="flex-1 text-[16px] font-extrabold text-navy">{title}</span>
        <ChevronDown
          className={cn("size-5 text-navy-soft transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function useLazy<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetcher())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return { data, error, loading, load, setData }
}

function SectionBody({
  loading,
  error,
  children,
}: {
  loading: boolean
  error: string | null
  children: React.ReactNode
}) {
  if (loading)
    return (
      <p className="flex items-center gap-2 py-2 text-sm font-semibold text-navy-soft">
        <Spinner /> Loading…
      </p>
    )
  if (error)
    return <p className="py-2 text-sm font-semibold text-pink">{error}</p>
  return <>{children}</>
}

function WalletSection() {
  const { data, error, loading, load } = useLazy(() =>
    apiResult<Wallet>("/public/me/wallet")
  )
  return (
    <Section icon={WalletIcon} title="Wallet" onFirstOpen={load}>
      <SectionBody loading={loading} error={error}>
        {data && (
          <div className="flex gap-3">
            <div className="flex-1 rounded-2xl bg-[#f1f4f8] p-3.5 text-center">
              {/* balance/bonuses arrive as integer cents */}
              <p className="text-2xl font-extrabold text-navy">
                {formatCents(data.balance, data.currency)}
              </p>
              <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
                Balance
              </p>
            </div>
            <div className="flex-1 rounded-2xl bg-[#f1f4f8] p-3.5 text-center">
              <p className="text-2xl font-extrabold text-navy">
                {formatCents(data.bonuses, data.currency)}
              </p>
              <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
                Bonuses
              </p>
            </div>
          </div>
        )}
      </SectionBody>
    </Section>
  )
}

function ReferralsSection() {
  const { data, error, loading, load } = useLazy(() =>
    apiResult<Referrals>("/public/me/referrals")
  )
  return (
    <Section icon={Gift} title="Invite friends" onFirstOpen={load}>
      <SectionBody loading={loading} error={error}>
        {data && (
          <>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(data.link)
                toast.success("Referral link copied")
              }}
              className="flex w-full items-center justify-between rounded-2xl bg-[#f1f4f8] px-4 py-3"
            >
              <span className="truncate text-sm font-bold text-navy">{data.link}</span>
              <Copy className="ml-2 size-4 shrink-0 text-navy-soft" />
            </button>
            <div className="mt-3 flex gap-3 text-center">
              {[
                { label: "Invited", value: String(data.invited) },
                { label: "Sales", value: String(data.sales) },
                // income is integer cents
                { label: "Income", value: formatCents(data.income) },
              ].map(({ label, value }) => (
                <div key={label} className="flex-1 rounded-2xl bg-[#f1f4f8] p-3">
                  <p className="text-lg font-extrabold text-navy">{value}</p>
                  <p className="text-[11px] font-bold tracking-wider text-navy-soft uppercase">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionBody>
    </Section>
  )
}

function VehiclesSection() {
  const { data, error, loading, load } = useLazy(() =>
    apiResult<Vehicle[]>("/public/me/vehicles")
  )
  return (
    <Section icon={Car} title="My vehicles" onFirstOpen={load}>
      <SectionBody loading={loading} error={error}>
        {data &&
          (data.length === 0 ? (
            <p className="py-1 text-sm font-semibold text-navy-soft">
              Vehicles from your orders will appear here.
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.map((v) => (
                <div key={String(v.id)}>
                  <PlateBadge plate={v.plate} country={v.country} />
                  {v.vin_code && (
                    <p className="mt-1 px-1 text-xs font-semibold tracking-wider text-navy-soft">
                      VIN: {v.vin_code}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
      </SectionBody>
    </Section>
  )
}

function NotificationsSection() {
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [pages, setPages] = useState({ total: 1, current: 1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = async (page: number) => {
    setLoading(true)
    setError(null)
    try {
      // fetching marks the page read server-side (mark_read defaults on)
      const envelope = await api<AppNotification[]>("/public/me/notifications", {
        query: { page },
      })
      setItems((prev) =>
        page > 1 && prev ? [...prev, ...envelope.result] : envelope.result
      )
      setPages(envelope.pages ?? { total: 1, current: page })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section icon={Bell} title="Notifications" onFirstOpen={() => void loadPage(1)}>
      <SectionBody loading={loading && !items} error={error}>
        {items &&
          (items.length === 0 ? (
            <p className="py-1 text-sm font-semibold text-navy-soft">
              Nothing here yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {items.map((n) => (
                <div
                  key={String(n.id)}
                  className={cn(
                    "rounded-2xl p-3",
                    n.read ? "bg-[#f6f8fa]" : "bg-brand-soft/50"
                  )}
                >
                  <p className="text-sm font-extrabold text-navy">{n.title}</p>
                  <p className="mt-0.5 text-sm font-medium text-navy/80">{n.body}</p>
                  <p className="mt-1 text-[11px] font-semibold text-navy-soft">
                    {formatDate(n.created_at)}
                  </p>
                </div>
              ))}
              {pages.current < pages.total && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadPage(pages.current + 1)}
                  className="w-full rounded-full bg-[#f1f4f8] py-2 text-sm font-bold text-navy disabled:opacity-50"
                >
                  {loading ? "Loading…" : `Load more (${pages.current}/${pages.total})`}
                </button>
              )}
            </div>
          ))}
      </SectionBody>
    </Section>
  )
}

/**
 * Web push registration — the browser as a push install, mirroring what the
 * iOS app does over APNs (vignette.id docs/push/web-integration.md). Enable
 * walks permission -> service worker -> GET web-push-key -> subscribe ->
 * POST /public/devices with the subscription as the token. The login state
 * AT REGISTRATION TIME decides the binding (a session, guest or signed-in,
 * is always attached — so after signing in on a previously-guest browser,
 * hit Enable again to re-bind to the account). Orders placed from this
 * browser carry the same installation_id (OrderSheet.tsx#submit), so it
 * hears their status alerts even if it registered while signed out.
 */
function PushSection() {
  const me = useAuthStore((s) => s.me)
  const supported = webPushSupported()
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported"
  )
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!supported) return
    currentSubscription()
      .then(setSubscription)
      .catch(() => {})
  }, [supported])

  const enable = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const granted = await Notification.requestPermission()
      setPermission(granted)
      if (granted !== "granted") {
        setStatus({
          ok: false,
          text:
            granted === "denied"
              ? "Permission denied — reset it in the browser's site settings to retry"
              : "Permission dismissed — nothing registered",
        })
        return
      }

      // Client credential only — the VAPID key is server config, not
      // user-scoped.
      const { public_key } = await apiResult<{ public_key: string }>(
        "/public/devices/web-push-key",
        { auth: false }
      )

      const sub = await subscribe(public_key)

      await apiResult("/public/devices", {
        method: "POST",
        body: {
          installation_id: getInstallationId(),
          platform: "web",
          token: sub.toJSON(),
        },
      })

      setSubscription(sub)
      setStatus({
        ok: true,
        text: me?.email
          ? `Registered — bound to ${me.email}`
          : "Registered — orders placed from this browser will alert here",
      })
    } catch (e) {
      setStatus({
        ok: false,
        text:
          e instanceof ApiRequestError && e.type === "not_configured"
            ? "Push notifications aren't set up on the server yet"
            : errorMessage(e),
      })
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await unsubscribe()
      await api("/public/devices", {
        method: "DELETE",
        body: { installation_id: getInstallationId() },
      })
      setSubscription(null)
      setStatus({ ok: true, text: "Notifications turned off on this device" })
    } catch (e) {
      setStatus({ ok: false, text: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section icon={BellRing} title="Push notifications">
      {!supported ? (
        <p className="py-1 text-sm font-semibold text-navy-soft">
          This browser doesn't support push notifications.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-navy-soft">
            Get order status alerts on this device, even with the tab closed.
          </p>
          <button
            type="button"
            onClick={() => void (subscription ? disable() : enable())}
            disabled={busy || permission === "denied"}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {busy && <Spinner />}
            {subscription ? "Turn off notifications" : "Turn on notifications"}
          </button>
          {permission === "denied" && (
            <p className="mt-2 text-xs font-semibold text-navy-soft">
              Blocked for this site — re-enable it in the browser's site
              settings to retry.
            </p>
          )}
          {status && (
            <p
              className={cn(
                "mt-2 text-xs font-semibold",
                status.ok ? "text-mint-deep" : "text-pink"
              )}
            >
              {status.text}
            </p>
          )}
        </>
      )}
    </Section>
  )
}

function SessionsSection() {
  const fetchSessions = useAuthStore((s) => s.fetchSessions)
  const { data, error, loading, load } = useLazy<SessionInfo[]>(fetchSessions)
  return (
    <Section icon={MonitorSmartphone} title="Devices & sessions" onFirstOpen={load}>
      <SectionBody loading={loading} error={error}>
        {data && (
          <div className="space-y-2.5">
            {data.map((s) => (
              <div key={s.id} className="rounded-2xl bg-[#f6f8fa] p-3">
                <p className="flex items-center gap-2 text-sm font-extrabold text-navy">
                  {s.device_name || "Unknown device"}
                  {s.current && (
                    <span className="rounded-full bg-mint/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-mint-deep uppercase">
                      This device
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-navy-soft">
                  {s.ip ?? "—"} · created {formatDate(s.created_at)}
                  {s.last_used_at ? ` · last used ${formatDate(s.last_used_at)}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionBody>
    </Section>
  )
}

/**
 * Partner-order visibility consent (GET/POST/DELETE /public/me/consents).
 * Grant/revoke applies to the CALLING client's partner; on a first-party
 * client granting is harmless but changes nothing (it already sees all).
 */
function ConsentsSection() {
  const { data, error, loading, load, setData } = useLazy(() =>
    apiResult<Consent[]>("/public/me/consents")
  )
  const [busy, setBusy] = useState<"grant" | "revoke" | null>(null)

  const grant = async () => {
    setBusy("grant")
    try {
      await apiResult<Consent>("/public/me/consents", { method: "POST" })
      toast.success("Full account access granted to this app's partner")
      setData(await apiResult<Consent[]>("/public/me/consents"))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const revoke = async () => {
    setBusy("revoke")
    try {
      await api("/public/me/consents", { method: "DELETE" })
      toast.success("Access revoked")
      setData(await apiResult<Consent[]>("/public/me/consents"))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section icon={ShieldCheck} title="Partner access" onFirstOpen={load}>
      <SectionBody loading={loading} error={error}>
        {data && (
          <>
            {data.length === 0 ? (
              <p className="py-1 text-sm font-semibold text-navy-soft">
                No partner apps have access to your full order history.
              </p>
            ) : (
              <div className="space-y-2">
                {data.map((c) => (
                  <div
                    key={String(c.partner_id)}
                    className="rounded-2xl bg-[#f6f8fa] p-3 text-sm font-semibold text-navy"
                  >
                    Partner #{String(c.partner_id)} · {c.scope} · granted{" "}
                    {formatDate(c.granted_at)}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2.5">
              <button
                type="button"
                disabled={busy !== null}
                onClick={grant}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {busy === "grant" && <Spinner className="text-white" />} Grant
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={revoke}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-pink py-2.5 text-sm font-extrabold text-pink disabled:opacity-50"
              >
                {busy === "revoke" && <Spinner />} Revoke
              </button>
            </div>
            <p className="mt-2 text-xs font-medium text-navy-soft">
              Granting lets this app's partner read your whole order history
              (orders?scope=all). Revocation is immediate.
            </p>
          </>
        )}
      </SectionBody>
    </Section>
  )
}

function SignOutButtons() {
  const logout = useAuthStore((s) => s.logout)
  const logoutAll = useAuthStore((s) => s.logoutAll)
  const resetOrders = useOrdersStore((s) => s.reset)
  const [busy, setBusy] = useState<"one" | "all" | null>(null)

  const run = async (which: "one" | "all") => {
    setBusy(which)
    try {
      await (which === "one" ? logout() : logoutAll())
      resetOrders()
      toast.success(which === "one" ? "Signed out" : "Signed out everywhere")
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex gap-3">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run("one")}
        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/20 py-3.5 text-[15px] font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy === "one" ? <Spinner className="text-white" /> : <LogOut className="size-4" />}
        Sign out
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run("all")}
        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/20 py-3.5 text-[15px] font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy === "all" ? <Spinner className="text-white" /> : <LogOut className="size-4" />}
        Sign out everywhere
      </button>
    </div>
  )
}
