import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { REGEXP_ONLY_DIGITS } from "input-otp"
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
  TriangleAlert,
  UserRound,
  Wallet as WalletIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { PlateBadge } from "@/components/order/PlateBadge"
import { apiErrorMessage, ApiRequestError } from "@/lib/api"
import { formatCents, formatDate } from "@/lib/format"
import {
  APPLE_CLIENT_ID,
  GOOGLE_CLIENT_ID,
  initAppleSignIn,
  isAppleCancel,
  renderGoogleButton,
  signInWithApple,
} from "@/lib/social"
import { webPushSupported } from "@/lib/webpush"
import { useAuthStore } from "@/stores/auth"
import { useMe } from "@/queries/me"
import {
  useConsents,
  useGrantConsent,
  useNotifications,
  useReferrals,
  useRevokeConsent,
  useSessions,
  useVehicles,
  useWallet,
} from "@/queries/account"
import { useDisablePush, useEnablePush, usePushSubscription } from "@/queries/push"
import { cn } from "@/lib/utils"

export function AccountPage() {
  const { data: me } = useMe()
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const isGuest = user?.guest ?? true

  return (
    <div className="space-y-4 pt-2">
      <h1 className="px-1 text-[26px] font-extrabold text-white">Account</h1>

      {/* profile card */}
      <Card className="rounded-[24px] ring-0">
        <CardContent className="flex items-center gap-4">
          <Avatar className="size-14 bg-brand-soft/60">
            <AvatarFallback className="bg-transparent">
              <UserRound className="size-8 text-brand" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            {status === "booting" ? (
              <Skeleton className="h-5 w-32 rounded-full bg-cloud" />
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
        </CardContent>
      </Card>

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

/**
 * Signing in swaps the session (user id) — every session-scoped query key
 * carries it, so orders/wallet/… start over on their own; nothing here has
 * to reset caches by hand.
 */
function SignInCard() {
  const startOtp = useAuthStore((s) => s.startOtp)
  const verifyOtp = useAuthStore((s) => s.verifyOtp)
  const fetchNonce = useAuthStore((s) => s.fetchNonce)
  const verifySocial = useAuthStore((s) => s.verifySocial)
  const linkSocialEmail = useAuthStore((s) => s.linkSocialEmail)

  const otpStart = useMutation({ mutationFn: startOtp })
  const otpVerify = useMutation({
    mutationFn: ({ challengeId, code }: { challengeId: string; code: string }) =>
      verifyOtp(challengeId, code),
  })
  const socialVerify = useMutation({
    mutationFn: ({
      provider,
      token,
      nonce,
    }: {
      provider: "apple" | "google"
      token: string
      nonce: string
    }) => verifySocial(provider, token, nonce),
  })
  const linkEmail = useMutation({ mutationFn: linkSocialEmail })
  const busy =
    otpStart.isPending ||
    otpVerify.isPending ||
    socialVerify.isPending ||
    linkEmail.isPending
  // stable across renders (unlike the mutation objects) — safe as effect deps
  const { mutateAsync: verifySocialAsync } = socialVerify

  const [mode, setMode] = useState<SignInMode>({ kind: "email" })
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [resendIn, setResendIn] = useState(0)
  const googleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const finishSocial = useCallback(
    async (provider: "apple" | "google", token: string, nonce: string) => {
      try {
        const result = await verifySocialAsync({ provider, token, nonce })
        if (result.status === "email_required") {
          // provider disclosed no usable email — collect one via OTP
          setMode({ kind: "link-email", provider, linkToken: result.linkToken })
          setEmail("")
        } else {
          toast.success("Signed in")
        }
      } catch (e) {
        toast.error(apiErrorMessage(e))
      }
    },
    [verifySocialAsync]
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
        if (!isAppleCancel(e)) toast.error(apiErrorMessage(e))
      })
      .finally(() => {
        void armApple()
      })
  }

  const start = async () => {
    try {
      const result = await otpStart.mutateAsync(email.trim())
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
      toast.error(apiErrorMessage(e))
    }
  }

  const verify = async (value: string) => {
    try {
      if (mode.kind === "otp") {
        await otpVerify.mutateAsync({ challengeId: mode.challengeId, code: value })
      } else if (mode.kind === "link-otp") {
        await linkEmail.mutateAsync({
          linkToken: mode.linkToken,
          challengeId: mode.challengeId,
          code: value,
        })
      } else {
        return
      }
      toast.success("Signed in")
    } catch (e) {
      toast.error(apiErrorMessage(e))
      setCode("")
    }
  }

  const emailValid = /.+@.+\..+/.test(email)
  const showEmailForm = mode.kind === "email" || mode.kind === "link-email"
  const showOtpForm = mode.kind === "otp" || mode.kind === "link-otp"

  return (
    <Card className="rounded-[24px] ring-0 [--card-spacing:--spacing(5)]">
      <CardContent>
        <h2 className="text-lg font-extrabold text-navy">Sign in</h2>

        {mode.kind === "link-email" && (
          <Alert className="mt-2 rounded-xl border-0 bg-brand-soft/50 text-navy">
            <AlertDescription className="font-semibold text-navy">
              Your {mode.provider === "apple" ? "Apple ID" : "Google account"} didn't
              share a usable email. Enter your real email — we'll verify it with a
              code and link it to your {mode.provider} sign-in.
            </AlertDescription>
          </Alert>
        )}

        {showEmailForm && (
          <>
            {mode.kind === "email" && (
              <p className="mt-1 text-sm font-semibold text-navy-soft">
                We'll email you a 6-digit code. No password needed.
              </p>
            )}
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && emailValid && start()}
              placeholder="Email"
              aria-label="Email"
              className="mt-4 h-auto w-full rounded-2xl border-0 bg-[#f1f4f8] px-4 py-3.5 text-center text-lg font-semibold text-navy shadow-none placeholder:text-navy-soft md:text-lg"
            />
            <Button
              variant="pink"
              size="xl"
              className="mt-3 w-full text-lg tracking-wider"
              disabled={busy || !emailValid}
              onClick={start}
            >
              {busy && <Spinner className="text-white" />} Send code
            </Button>
          </>
        )}

        {showOtpForm && (
          <>
            <p className="mt-1 text-sm font-semibold text-navy-soft">
              Enter the code we sent to{" "}
              <span className="text-navy">{mode.email}</span>
            </p>
            <InputOTP
              autoFocus
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(value) => {
                setCode(value)
                if (value.length === 6) void verify(value)
              }}
              containerClassName="mt-4 justify-center"
            >
              <InputOTPGroup className="gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-12 rounded-2xl border border-[#e3ebf3] bg-[#f1f4f8] text-2xl font-extrabold text-navy first:rounded-2xl last:rounded-2xl"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <div className="mt-3 flex items-center justify-between">
              <Button
                variant="link"
                size="sm"
                className="px-0 font-bold text-navy-soft"
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
              >
                Change email
              </Button>
              <Button
                variant="link"
                size="sm"
                className="px-0 font-bold text-brand"
                disabled={resendIn > 0 || busy}
                onClick={start}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </Button>
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
          <div className="mt-4">
            <div className="relative flex items-center">
              <Separator className="flex-1" />
              <span className="px-3 text-xs font-bold tracking-wider text-navy-soft uppercase">
                or continue with
              </span>
              <Separator className="flex-1" />
            </div>
            <div className="mt-4 space-y-2.5">
              {GOOGLE_CLIENT_ID && (
                <div ref={googleRef} className="flex justify-center" />
              )}
              {APPLE_CLIENT_ID && (
                <Button
                  size="pill"
                  onClick={onAppleClick}
                  className="mx-auto flex w-full max-w-[400px] bg-black text-[15px] font-bold text-white hover:bg-black/90 active:scale-[0.98]"
                >
                   Continue with Apple
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ----------------------------------------------------- signed-in extras */

function SignedInSections() {
  return (
    <div className="space-y-3">
      <Section icon={WalletIcon} title="Wallet">
        <WalletBody />
      </Section>
      <Section icon={Gift} title="Invite friends">
        <ReferralsBody />
      </Section>
      <Section icon={Car} title="My vehicles">
        <VehiclesBody />
      </Section>
      <Section icon={Bell} title="Notifications">
        <NotificationsBody />
      </Section>
      <Section icon={BellRing} title="Push notifications">
        <PushBody />
      </Section>
      <Section icon={MonitorSmartphone} title="Devices & sessions">
        <SessionsBody />
      </Section>
      <Section icon={ShieldCheck} title="Partner access">
        <ConsentsBody />
      </Section>
    </div>
  )
}

/**
 * Collapsible white card. CollapsibleContent mounts its children only while
 * open — that is what makes each body's query lazy: nothing is fetched until
 * the user opens the section, and the cache serves the next open instantly.
 */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <Collapsible asChild>
      <Card className="gap-0 rounded-[24px] py-0 ring-0">
        <CollapsibleTrigger className="group flex w-full items-center gap-3.5 p-4 text-left">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft/60">
            <Icon className="size-5.5 text-brand" />
          </span>
          <span className="flex-1 text-[16px] font-extrabold text-navy">{title}</span>
          <ChevronDown className="size-5 text-navy-soft transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

/** Loading/error states of a section's query; renders children once settled. */
function SectionBody({
  query,
  children,
}: {
  query: { isPending: boolean; error: unknown }
  children: React.ReactNode
}) {
  if (query.isPending)
    return (
      <p className="flex items-center gap-2 py-2 text-sm font-semibold text-navy-soft">
        <Spinner /> Loading…
      </p>
    )
  if (query.error)
    return (
      <Alert variant="destructive" className="border-pink text-pink">
        <TriangleAlert />
        <AlertDescription className="font-semibold text-pink">
          {apiErrorMessage(query.error)}
        </AlertDescription>
      </Alert>
    )
  return <>{children}</>
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <Empty className="border-0 p-1 py-1">
      <EmptyHeader>
        <EmptyDescription className="text-sm font-semibold text-navy-soft">
          {children}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/** the light stat / list tile used inside the sections */
function Tile({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl bg-[#f1f4f8] p-3", className)} {...props} />
}

function WalletBody() {
  const query = useWallet()
  const { data } = query
  return (
    <SectionBody query={query}>
      {data && (
        <div className="flex gap-3">
          <Tile className="flex-1 p-3.5 text-center">
            {/* balance/bonuses arrive as integer cents */}
            <p className="text-2xl font-extrabold text-navy">
              {formatCents(data.balance, data.currency)}
            </p>
            <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
              Balance
            </p>
          </Tile>
          <Tile className="flex-1 p-3.5 text-center">
            <p className="text-2xl font-extrabold text-navy">
              {formatCents(data.bonuses, data.currency)}
            </p>
            <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
              Bonuses
            </p>
          </Tile>
        </div>
      )}
    </SectionBody>
  )
}

function ReferralsBody() {
  const query = useReferrals()
  const { data } = query
  return (
    <SectionBody query={query}>
      {data && (
        <>
          <Button
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(data.link)
              toast.success("Referral link copied")
            }}
            className="h-auto w-full justify-between rounded-2xl bg-[#f1f4f8] px-4 py-3 text-sm font-bold text-navy hover:bg-[#e8edf3]"
          >
            <span className="truncate">{data.link}</span>
            <Copy className="ml-2 size-4 shrink-0 text-navy-soft" />
          </Button>
          <div className="mt-3 flex gap-3 text-center">
            {[
              { label: "Invited", value: String(data.invited) },
              { label: "Sales", value: String(data.sales) },
              // income is integer cents
              { label: "Income", value: formatCents(data.income) },
            ].map(({ label, value }) => (
              <Tile key={label} className="flex-1">
                <p className="text-lg font-extrabold text-navy">{value}</p>
                <p className="text-[11px] font-bold tracking-wider text-navy-soft uppercase">
                  {label}
                </p>
              </Tile>
            ))}
          </div>
        </>
      )}
    </SectionBody>
  )
}

function VehiclesBody() {
  const query = useVehicles()
  const { data } = query
  return (
    <SectionBody query={query}>
      {data &&
        (data.length === 0 ? (
          <EmptyNote>Vehicles from your orders will appear here.</EmptyNote>
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
  )
}

function NotificationsBody() {
  // fetching a page marks it read server-side (mark_read defaults on)
  const query = useNotifications()
  const { items, pagination, hasNextPage, fetchNextPage, isFetchingNextPage } = query
  return (
    <SectionBody query={query}>
      {items.length === 0 ? (
        <EmptyNote>Nothing here yet.</EmptyNote>
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => (
            <Tile
              key={String(n.id)}
              className={cn(n.read ? "bg-[#f6f8fa]" : "bg-brand-soft/50")}
            >
              <p className="text-sm font-extrabold text-navy">{n.title}</p>
              <p className="mt-0.5 text-sm font-medium text-navy/80">{n.body}</p>
              <p className="mt-1 text-[11px] font-semibold text-navy-soft">
                {formatDate(n.created_at)}
              </p>
            </Tile>
          ))}
          {hasNextPage && (
            <Button
              variant="secondary"
              size="pill"
              className="h-9 w-full bg-[#f1f4f8] text-sm font-bold text-navy"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage
                ? "Loading…"
                : `Load more (${pagination.current}/${pagination.total})`}
            </Button>
          )}
        </div>
      )}
    </SectionBody>
  )
}

/**
 * Web push toggle — the browser as a push install (see queries/push.ts for
 * the registration chain). The session at registration time decides the
 * binding, so re-enable after signing in on a previously-guest browser to
 * re-bind to the account. Orders placed from this browser carry the same
 * installation_id (OrderSheet.tsx#submit), so it hears their status alerts
 * even if it registered while signed out.
 */
function PushBody() {
  const { data: me } = useMe()
  const supported = webPushSupported()
  const subscription = usePushSubscription().data ?? null
  const enable = useEnablePush()
  const disable = useDisablePush()
  // which mutation's outcome the status line reflects
  const [last, setLast] = useState<"enable" | "disable" | null>(null)

  if (!supported) {
    return <EmptyNote>This browser doesn't support push notifications.</EmptyNote>
  }

  // live browser value — every mutation settling re-renders this component
  const permission = Notification.permission
  const busy = enable.isPending || disable.isPending

  let status: { ok: boolean; text: string } | null = null
  if (last === "enable") {
    if (enable.error) {
      status = {
        ok: false,
        text:
          enable.error instanceof ApiRequestError && enable.error.type === "not_configured"
            ? "Push notifications aren't set up on the server yet"
            : apiErrorMessage(enable.error),
      }
    } else if (enable.data?.status === "denied") {
      status = {
        ok: false,
        text: "Permission denied — reset it in the browser's site settings to retry",
      }
    } else if (enable.data?.status === "dismissed") {
      status = { ok: false, text: "Permission dismissed — nothing registered" }
    } else if (enable.data?.status === "registered") {
      status = {
        ok: true,
        text: me?.email
          ? `Registered — bound to ${me.email}`
          : "Registered — orders placed from this browser will alert here",
      }
    }
  } else if (last === "disable") {
    if (disable.error) {
      status = { ok: false, text: apiErrorMessage(disable.error) }
    } else if (disable.isSuccess) {
      status = { ok: true, text: "Notifications turned off on this device" }
    }
  }

  const toggle = () => {
    if (subscription) {
      setLast("disable")
      disable.mutate()
    } else {
      setLast("enable")
      enable.mutate()
    }
  }

  return (
    <>
      <p className="text-sm font-medium text-navy-soft">
        Get order status alerts on this device, even with the tab closed.
      </p>
      <Button
        variant="brand"
        size="pill"
        className="mt-3 h-10 w-full text-sm"
        onClick={toggle}
        disabled={busy || permission === "denied"}
      >
        {busy && <Spinner />}
        {subscription ? "Turn off notifications" : "Turn on notifications"}
      </Button>
      {permission === "denied" && (
        <p className="mt-2 text-xs font-semibold text-navy-soft">
          Blocked for this site — re-enable it in the browser's site settings to
          retry.
        </p>
      )}
      {status && (
        <Alert
          variant={status.ok ? "default" : "destructive"}
          className={cn(
            "mt-2 border-0 bg-transparent px-0 py-1",
            status.ok ? "text-mint-deep" : "text-pink"
          )}
        >
          <AlertDescription
            className={cn("text-xs font-semibold", status.ok ? "text-mint-deep" : "text-pink")}
          >
            {status.text}
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

function SessionsBody() {
  const query = useSessions()
  const { data } = query
  return (
    <SectionBody query={query}>
      {data && (
        <div className="space-y-2.5">
          {data.map((s) => (
            <Tile key={s.id} className="bg-[#f6f8fa]">
              <p className="flex items-center gap-2 text-sm font-extrabold text-navy">
                {s.device_name || "Unknown device"}
                {s.current && (
                  <Badge className="rounded-full bg-mint/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-mint-deep uppercase hover:bg-mint/20">
                    This device
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-navy-soft">
                {s.ip ?? "—"} · created {formatDate(s.created_at)}
                {s.last_used_at ? ` · last used ${formatDate(s.last_used_at)}` : ""}
              </p>
            </Tile>
          ))}
        </div>
      )}
    </SectionBody>
  )
}

/**
 * Partner-order visibility consent. Grant/revoke applies to the CALLING
 * client's partner; on a first-party client granting is harmless but changes
 * nothing (it already sees all).
 */
function ConsentsBody() {
  const query = useConsents()
  const { data } = query
  const grant = useGrantConsent()
  const revoke = useRevokeConsent()
  const busy = grant.isPending ? "grant" : revoke.isPending ? "revoke" : null

  return (
    <SectionBody query={query}>
      {data && (
        <>
          {data.length === 0 ? (
            <EmptyNote>No partner apps have access to your full order history.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {data.map((c) => (
                <Tile
                  key={String(c.partner_id)}
                  className="bg-[#f6f8fa] text-sm font-semibold text-navy"
                >
                  Partner #{String(c.partner_id)} · {c.scope} · granted{" "}
                  {formatDate(c.granted_at)}
                </Tile>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2.5">
            <Button
              variant="brand"
              size="pill"
              className="h-10 flex-1 text-sm"
              disabled={busy !== null}
              onClick={() =>
                grant.mutate(undefined, {
                  onSuccess: () =>
                    toast.success("Full account access granted to this app's partner"),
                  onError: (e) => toast.error(apiErrorMessage(e)),
                })
              }
            >
              {busy === "grant" && <Spinner className="text-white" />} Grant
            </Button>
            <Button
              variant="outline"
              size="pill"
              className="h-10 flex-1 border-2 border-pink bg-transparent text-sm text-pink hover:bg-pink/5 hover:text-pink"
              disabled={busy !== null}
              onClick={() =>
                revoke.mutate(undefined, {
                  onSuccess: () => toast.success("Access revoked"),
                  onError: (e) => toast.error(apiErrorMessage(e)),
                })
              }
            >
              {busy === "revoke" && <Spinner />} Revoke
            </Button>
          </div>
          <p className="mt-2 text-xs font-medium text-navy-soft">
            Granting lets this app's partner read your whole order history
            (orders?scope=all). Revocation is immediate.
          </p>
        </>
      )}
    </SectionBody>
  )
}

/** Signing out swaps the session too — caches reset the same way as sign-in. */
function SignOutButtons() {
  const logout = useAuthStore((s) => s.logout)
  const logoutAll = useAuthStore((s) => s.logoutAll)
  const signOut = useMutation({
    mutationFn: (which: "one" | "all") => (which === "one" ? logout() : logoutAll()),
    onSuccess: (_result, which) =>
      toast.success(which === "one" ? "Signed out" : "Signed out everywhere"),
    onError: (e) => toast.error(apiErrorMessage(e)),
  })
  const busy = signOut.isPending ? signOut.variables : null

  return (
    <div className="flex gap-3">
      <Button
        variant="glass"
        size="xl"
        className="h-13 flex-1 text-[15px] tracking-normal normal-case disabled:opacity-60"
        disabled={busy !== null}
        onClick={() => signOut.mutate("one")}
      >
        {busy === "one" ? <Spinner className="text-white" /> : <LogOut className="size-4" />}
        Sign out
      </Button>
      <Button
        variant="glass"
        size="xl"
        className="h-13 flex-1 text-[15px] tracking-normal normal-case disabled:opacity-60"
        disabled={busy !== null}
        onClick={() => signOut.mutate("all")}
      >
        {busy === "all" ? <Spinner className="text-white" /> : <LogOut className="size-4" />}
        Sign out everywhere
      </Button>
    </div>
  )
}
