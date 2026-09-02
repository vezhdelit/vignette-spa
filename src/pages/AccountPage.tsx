import { useEffect, useRef, useState } from "react"
import {
  BadgeCheck,
  Bell,
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
import { apiResult, ApiRequestError } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { useAuthStore } from "@/stores/auth"
import { useOrdersStore } from "@/stores/orders"
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
  if (e instanceof ApiRequestError) return e.message
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

function SignInCard() {
  const startOtp = useAuthStore((s) => s.startOtp)
  const verifyOtp = useAuthStore((s) => s.verifyOtp)
  const reloadOrders = useOrdersStore((s) => s.load)

  const [email, setEmail] = useState("")
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const start = async () => {
    setBusy(true)
    try {
      const result = await startOtp(email.trim())
      setChallengeId(result.challenge_id)
      setResendIn(result.resend_after)
      setCode("")
      toast.success("Code sent — check your inbox")
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value: string) => {
    if (!challengeId) return
    setBusy(true)
    try {
      await verifyOtp(challengeId, value)
      useOrdersStore.getState().reset()
      void reloadOrders()
      toast.success("Signed in")
    } catch (e) {
      toast.error(errorMessage(e))
      setCode("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[24px] bg-white p-5">
      <h2 className="text-lg font-extrabold text-navy">Sign in</h2>
      {!challengeId ? (
        <>
          <p className="mt-1 text-sm font-semibold text-navy-soft">
            We'll email you a 6-digit code. No password needed.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && /.+@.+\..+/.test(email) && start()}
            placeholder="Email"
            className="mt-4 w-full rounded-2xl bg-[#f1f4f8] px-4 py-3.5 text-center text-lg font-semibold text-navy outline-none placeholder:text-navy-soft"
          />
          <button
            type="button"
            disabled={busy || !/.+@.+\..+/.test(email)}
            onClick={start}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-pink py-3.5 text-lg font-extrabold tracking-wider text-white uppercase transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy && <Spinner className="text-white" />} Send code
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm font-semibold text-navy-soft">
            Enter the code we sent to <span className="text-navy">{email}</span>
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
              onClick={() => setChallengeId(null)}
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

  return { data, error, loading, load }
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
              <p className="text-2xl font-extrabold text-navy">
                {data.balance} {data.currency === "EUR" ? "€" : data.currency}
              </p>
              <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
                Balance
              </p>
            </div>
            <div className="flex-1 rounded-2xl bg-[#f1f4f8] p-3.5 text-center">
              <p className="text-2xl font-extrabold text-navy">{data.bonuses}</p>
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
                { label: "Invited", value: data.invited },
                { label: "Sales", value: data.sales },
                { label: "Income", value: `${data.income} €` },
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
  const { data, error, loading, load } = useLazy(() =>
    apiResult<AppNotification[]>("/public/me/notifications")
  )
  return (
    <Section icon={Bell} title="Notifications" onFirstOpen={load}>
      <SectionBody loading={loading} error={error}>
        {data &&
          (data.length === 0 ? (
            <p className="py-1 text-sm font-semibold text-navy-soft">
              Nothing here yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.map((n) => (
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
            </div>
          ))}
      </SectionBody>
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
                  {s.ip ?? "—"} · created {formatDate(Math.floor(s.created_at))}
                  {s.last_used_at
                    ? ` · last used ${formatDate(Math.floor(s.last_used_at))}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionBody>
    </Section>
  )
}

function ConsentsSection() {
  const { data, error, loading, load } = useLazy(() =>
    apiResult<Consent[]>("/public/me/consents")
  )
  return (
    <Section icon={ShieldCheck} title="Partner access" onFirstOpen={load}>
      <SectionBody loading={loading} error={error}>
        {data &&
          (data.length === 0 ? (
            <p className="py-1 text-sm font-semibold text-navy-soft">
              No partner apps have access to your orders.
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
          ))}
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
