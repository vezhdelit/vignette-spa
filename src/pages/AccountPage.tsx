import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import {
  BadgeCheck,
  Bell,
  BellRing,
  Car,
  ChevronDown,
  ChevronRight,
  Coins,
  Copy,
  Gift,
  LogOut,
  MonitorSmartphone,
  Languages,
  ScanLine,
  ShieldCheck,
  Star,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PlateBadge } from "@/components/order/PlateBadge"
import { NotificationsList } from "@/components/notifications/NotificationsList"
import { apiErrorMessage, ApiRequestError } from "@/lib/api"
import { formatCents, formatDate } from "@/lib/format"
import {
  detectLanguage,
  languageName,
  SUPPORTED_LANGUAGES,
  translationCoverage,
  useI18nStore,
  useT,
} from "@/i18n"
import { runPlateRuleVectors } from "@/lib/plate-rules"
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
import { useRatingUiStore } from "@/stores/rating"
import { CURRENCIES, isCurrency, useSettingsStore } from "@/stores/settings"
import { useMe } from "@/queries/me"
import { useSessionScope } from "@/queries/session"
import {
  useConsents,
  useGrantConsent,
  useNotificationsSummary,
  useReferrals,
  useRevokeConsent,
  useSessions,
  useVehicles,
  useWallet,
} from "@/queries/account"
import { useDisablePush, useEnablePush, usePushSubscription } from "@/queries/push"
import { usePlateRuleVectors, usePlateRules } from "@/queries/vehicles"
import { cn } from "@/lib/utils"
import { rememberSigninMethod, track, trackCustom } from "@/lib/insights"

export function AccountPage() {
  const { t } = useT()
  const { data: me } = useMe()
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const isGuest = user?.guest ?? true

  return (
    <div className="space-y-4 pt-2">
      <h1 className="px-1 text-[26px] font-extrabold text-white">{t("account.title")}</h1>

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
                  {isGuest ? t("account.guest") : (me?.email ?? user?.email ?? "—")}
                </p>
                <p className="text-[13px] font-semibold text-navy-soft">
                  {isGuest
                    ? t("account.guestSubtitle")
                    : me?.created_at
                      ? t("account.memberSince", { date: formatDate(me.created_at) })
                      : t("account.signedIn")}
                </p>
              </>
            )}
          </div>
          {!isGuest && <BadgeCheck className="size-6 text-mint-deep" />}
        </CardContent>
      </Card>

      {isGuest ? (
        <>
          <SignInCard />
          <GuestSections />
        </>
      ) : (
        <SignedInSections />
      )}

      <RateAppRow hasRated={me?.has_rated ?? false} />

      {!isGuest && <SignOutButtons />}
      <p className="pt-1 text-center text-xs font-medium text-white/60">
        {t("account.userId", { id: user?.id ?? "—" })}
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
  const { t } = useT()
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
          toast.success(t("account.signIn.signedIn"))
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
          // Google hands the credential back in-page rather than via a
          // redirect, but the pair is reported the same way as the other two
          // so the methods compare directly.
          rememberSigninMethod("google")
          track("user.signin_started", { method: "google" })
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
    // The method is remembered as well as reported: Apple finishes after a
    // full-page redirect back to this origin, and by then this component is
    // gone. InsightsTracker reads it back to report user.signin_completed.
    rememberSigninMethod("apple")
    track("user.signin_started", { method: "apple" })
    // NO await before signInWithApple() — see lib/social.ts
    const nonce = appleNonce.current
    signInWithApple()
      .then((identityToken) => {
        if (!identityToken || !nonce) {
          toast.error(t("account.signIn.appleNoToken"))
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
    // Asking for the code is the intent; the funnel's other half is
    // user.signin_completed, which fires when the session actually appears.
    rememberSigninMethod("otp")
    track("user.signin_started", { method: "otp" })
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
      toast.success(t("account.signIn.codeSent"))
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
      toast.success(t("account.signIn.signedIn"))
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
        <h2 className="text-lg font-extrabold text-navy">{t("account.signIn.title")}</h2>

        {mode.kind === "link-email" && (
          <Alert className="mt-2 rounded-xl border-0 bg-brand-soft/50 text-navy">
            <AlertDescription className="font-semibold text-navy">
              {mode.provider === "apple"
                ? t("account.signIn.linkApple")
                : t("account.signIn.linkGoogle")}
            </AlertDescription>
          </Alert>
        )}

        {showEmailForm && (
          <>
            {mode.kind === "email" && (
              <p className="mt-1 text-sm font-semibold text-navy-soft">
                {t("account.signIn.subtitle")}
              </p>
            )}
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && emailValid && start()}
              placeholder={t("common.email")}
              aria-label={t("common.email")}
              className="mt-4 h-auto w-full rounded-2xl border-0 bg-[#f1f4f8] px-4 py-3.5 text-center text-lg font-semibold text-navy shadow-none placeholder:text-navy-soft md:text-lg"
            />
            <Button
              variant="pink"
              size="xl"
              className="mt-3 w-full text-lg tracking-wider"
              disabled={busy || !emailValid}
              onClick={start}
            >
              {busy && <Spinner className="text-white" />} {t("account.signIn.sendCode")}
            </Button>
          </>
        )}

        {showOtpForm && (
          <>
            <p className="mt-1 text-sm font-semibold text-navy-soft">
              {t("account.signIn.enterCode")}{" "}
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
                {t("account.signIn.changeEmail")}
              </Button>
              <Button
                variant="link"
                size="sm"
                className="px-0 font-bold text-brand"
                disabled={resendIn > 0 || busy}
                onClick={start}
              >
                {resendIn > 0
                  ? t("account.signIn.resendIn", { seconds: resendIn })
                  : t("account.signIn.resend")}
              </Button>
            </div>
            {busy && (
              <p className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-navy-soft">
                <Spinner /> {t("account.signIn.verifying")}
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
                {t("account.signIn.orContinue")}
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
                   {t("account.signIn.apple")}
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
  const { t } = useT()
  // the same number the header bell shows — kept fresh by that poll
  const unread = useNotificationsSummary().data?.unread_count ?? 0
  return (
    <div className="space-y-3">
      <Section icon={WalletIcon} title={t("account.section.wallet")}>
        <WalletBody />
      </Section>
      <Section icon={Gift} title={t("account.section.referrals")}>
        <ReferralsBody />
      </Section>
      <Section icon={Car} title={t("account.section.vehicles")}>
        <VehiclesBody />
      </Section>
      <Section
        icon={Bell}
        title={t("account.section.notifications")}
        badge={
          unread > 0 ? (
            <Badge className="rounded-full bg-pink px-2 py-0.5 text-[11px] font-extrabold text-white hover:bg-pink">
              {unread > 99 ? "99+" : unread}
            </Badge>
          ) : null
        }
      >
        <NotificationsList />
      </Section>
      <Section icon={BellRing} title={t("account.section.push")}>
        <PushBody />
      </Section>
      <Section icon={MonitorSmartphone} title={t("account.section.sessions")}>
        <SessionsBody />
      </Section>
      <Section icon={ShieldCheck} title={t("account.section.consents")}>
        <ConsentsBody />
      </Section>
      <Section icon={Languages} title={t("account.section.language")}>
        <LanguageBody />
      </Section>
      <Section icon={Coins} title={t("account.section.currency")}>
        <CurrencyBody />
      </Section>
      {/* dev only: proves this build's matcher still reads the served rules
          the way the server does */}
      {import.meta.env.DEV && (
        <>
          <Section icon={ScanLine} title={t("account.section.plateRules")}>
            <PlateRulesBody />
          </Section>
          <Section icon={Languages} title={t("account.section.translations")}>
            <TranslationsBody />
          </Section>
        </>
      )}
    </div>
  )
}

/**
 * What a guest session can still read: its vehicles are derived from the
 * orders it placed itself (GET /me/vehicles is guest-ok). Wallet, referrals,
 * consents and the notification writes are 403 guest_not_allowed, and a
 * guest's notification inbox is always empty — so nothing else is offered
 * until they sign in.
 */
function GuestSections() {
  const { t } = useT()
  return (
    <div className="space-y-3">
      <Section icon={Car} title={t("account.section.vehicles")}>
        <VehiclesBody />
      </Section>
      <Section icon={Languages} title={t("account.section.language")}>
        <LanguageBody />
      </Section>
      <Section icon={Coins} title={t("account.section.currency")}>
        <CurrencyBody />
      </Section>
      {/* dev only: proves this build's matcher still reads the served rules
          the way the server does */}
      {import.meta.env.DEV && (
        <>
          <Section icon={ScanLine} title={t("account.section.plateRules")}>
            <PlateRulesBody />
          </Section>
          <Section icon={Languages} title={t("account.section.translations")}>
            <TranslationsBody />
          </Section>
        </>
      )}
    </div>
  )
}

/**
 * Display currency for catalog prices (stores/settings.ts). Device-local, no
 * API call — the catalog query refetches in the chosen currency. Guests get
 * it too: it's a display preference, not account data.
 */
function CurrencyBody() {
  const { t } = useT()
  const currency = useSettingsStore((s) => s.currency)
  const setCurrency = useSettingsStore((s) => s.setCurrency)
  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        value={currency}
        onValueChange={(v) => {
          if (!v || !isCurrency(v)) return
          // Which currencies are worth keeping, and whether anyone leaves
          // the default. No standard name covers a display preference.
          trackCustom("currency_changed", { currency: v, from: currency })
          setCurrency(v)
        }}
        spacing={0}
        aria-label={t("account.currency.label")}
        className="flex-wrap gap-1.5 rounded-2xl bg-brand-soft/40 p-1.5"
      >
        {CURRENCIES.map((code) => (
          <ToggleGroupItem
            key={code}
            value={code}
            className="h-auto min-w-0 rounded-xl px-3 py-1.5 text-sm font-extrabold text-navy-soft hover:bg-transparent data-[state=on]:bg-white data-[state=on]:text-navy data-[state=on]:shadow first:rounded-xl last:rounded-xl"
          >
            {code}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs font-semibold text-navy-soft">{t("account.currency.note")}</p>
    </div>
  )
}

/**
 * "Rate the app" — the manual door to the rating sheet, always available
 * (guests included; re-rating is allowed server-side). Opening it here is
 * not a prompt, so closing it unrated is not reported as a dismissal.
 */
function RateAppRow({ hasRated }: { hasRated: boolean }) {
  const { t } = useT()
  const openSheet = useRatingUiStore((s) => s.openSheet)
  return (
    <Card className="gap-0 rounded-[24px] py-0 ring-0">
      <button
        type="button"
        className="flex w-full items-center gap-3.5 p-4 text-left outline-none"
        onClick={() => openSheet("manual")}
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-sun/25">
          <Star className="size-5.5 fill-sun text-sun" />
        </span>
        <span className="flex-1">
          <span className="block text-[16px] font-extrabold text-navy">
            {t("account.rate.title")}
          </span>
          <span className="block text-[13px] font-semibold text-navy-soft">
            {hasRated ? t("account.rate.subtitleRated") : t("account.rate.subtitle")}
          </span>
        </span>
        <ChevronRight className="size-5 text-navy-soft" />
      </button>
    </Card>
  )
}

/**
 * App language. Device-local like the currency (`src/i18n`), and it is what
 * the API is asked for too — so the copy the server writes for the plate form
 * arrives in the same language as the UI. "Match my device" clears the choice
 * and follows `navigator.languages` again.
 */
function LanguageBody() {
  const { t } = useT()
  const language = useI18nStore((state) => state.language)
  const explicit = useI18nStore((state) => state.explicit)
  const setLanguage = useI18nStore((state) => state.setLanguage)

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        value={explicit ? language : ""}
        onValueChange={(value) => {
          if (!value) return
          // A language picked by hand is a vote against what we detected —
          // context.locale already says which language the app was in, so
          // this event is specifically about the correction.
          trackCustom("language_changed", { language: value, explicit: true })
          void setLanguage(value)
        }}
        spacing={0}
        aria-label={t("account.language.label")}
        className="flex-wrap gap-1.5 rounded-2xl bg-brand-soft/40 p-1.5"
      >
        {SUPPORTED_LANGUAGES.map((code) => (
          <ToggleGroupItem
            key={code}
            value={code}
            className="h-auto min-w-0 rounded-xl px-3 py-1.5 text-sm font-extrabold text-navy-soft hover:bg-transparent data-[state=on]:bg-white data-[state=on]:text-navy data-[state=on]:shadow first:rounded-xl last:rounded-xl"
          >
            {languageName(code)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {explicit && (
        <Button
          variant="link"
          size="sm"
          className="h-auto px-1 font-bold text-brand"
          onClick={() => void setLanguage(detectLanguage(), { explicit: false })}
        >
          {t("account.language.systemDefault")}
        </Button>
      )}
      <p className="text-xs font-semibold text-navy-soft">{t("account.language.note")}</p>
    </div>
  )
}

/**
 * Dev-only: what the active translation actually covers. A partial file is
 * legitimate — the missing keys render in English — but it should be a
 * decision, not a surprise, and a key left over from a renamed string should
 * be visible.
 */
function TranslationsBody() {
  const { t, language } = useT()
  // recomputed per render; the language in the deps is what makes it fresh
  const coverage = translationCoverage()
  void language

  return (
    <div className="space-y-2.5">
      <Tile className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-navy-soft">
          {t("dev.translations.language")}
        </span>
        <span className="text-sm font-extrabold text-navy">
          {languageName(coverage.language)} ({coverage.language})
        </span>
      </Tile>
      <Tile className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-navy-soft">
          {t("dev.translations.coverage")}
        </span>
        <span
          className={cn(
            "text-sm font-extrabold",
            coverage.missing.length === 0 ? "text-mint-deep" : "text-pink"
          )}
        >
          {t("dev.translations.coverageValue", {
            translated: coverage.translated,
            total: coverage.total,
          })}
        </span>
      </Tile>
      {coverage.missing.length === 0 && coverage.unknown.length === 0 ? (
        <EmptyNote>{t("dev.translations.complete")}</EmptyNote>
      ) : (
        <Tile className="space-y-1 bg-pink/10">
          {coverage.missing.length > 0 && (
            <p className="text-xs font-bold text-pink">
              {t("dev.translations.missing")}: {coverage.missing.slice(0, 12).join(", ")}
              {coverage.missing.length > 12 ? " +" + (coverage.missing.length - 12) : ""}
            </p>
          )}
          {coverage.unknown.length > 0 && (
            <p className="text-xs font-bold text-pink">
              {t("dev.translations.unknown")}: {coverage.unknown.slice(0, 12).join(", ")}
            </p>
          )}
        </Tile>
      )}
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
  badge,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  /** e.g. an unread count, shown between the title and the chevron */
  badge?: React.ReactNode
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
          {badge}
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
  const { t } = useT()
  if (query.isPending)
    return (
      <p className="flex items-center gap-2 py-2 text-sm font-semibold text-navy-soft">
        <Spinner /> {t("common.loading")}
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
  const { t } = useT()
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
              {t("account.wallet.balance")}
            </p>
          </Tile>
          <Tile className="flex-1 p-3.5 text-center">
            <p className="text-2xl font-extrabold text-navy">
              {formatCents(data.bonuses, data.currency)}
            </p>
            <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
              {t("account.wallet.bonuses")}
            </p>
          </Tile>
        </div>
      )}
    </SectionBody>
  )
}

function ReferralsBody() {
  const { t } = useT()
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
              toast.success(t("account.referrals.copied"))
            }}
            className="h-auto w-full justify-between rounded-2xl bg-[#f1f4f8] px-4 py-3 text-sm font-bold text-navy hover:bg-[#e8edf3]"
          >
            <span className="truncate">{data.link}</span>
            <Copy className="ml-2 size-4 shrink-0 text-navy-soft" />
          </Button>
          <div className="mt-3 flex gap-3 text-center">
            {[
              { label: t("account.referrals.invited"), value: String(data.invited) },
              { label: t("account.referrals.sales"), value: String(data.sales) },
              // income is integer cents
              { label: t("account.referrals.income"), value: formatCents(data.income) },
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
  const { t } = useT()
  const { guest } = useSessionScope()
  // guest: the plates on this session's own orders; signed in: the account's saved cars
  const query = useVehicles()
  const { data } = query
  return (
    <SectionBody query={query}>
      {data &&
        (data.length === 0 ? (
          <EmptyNote>
            {guest ? t("account.vehicles.emptyGuest") : t("account.vehicles.empty")}
          </EmptyNote>
        ) : (
          <div className="space-y-2.5">
            {data.map((v) => (
              <div key={String(v.id)}>
                <PlateBadge plate={v.plate} country={v.country} />
                {v.vin_code && (
                  <p className="mt-1 px-1 text-xs font-semibold tracking-wider text-navy-soft">
                    {t("account.vehicles.vin", { vin: v.vin_code })}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}
    </SectionBody>
  )
}

/**
 * The plate-rules manifest this build is validating with, checked against the
 * conformance cases the API ships for it
 * (`GET /public/vehicles/plate-rules/vectors`). Local validation is only
 * worth having while it agrees with the server, and the rules change with a
 * deploy — so a mismatch is something to see here rather than in rejected
 * orders. Dev-only: nothing here is for a customer.
 */
function PlateRulesBody() {
  const { t } = useT()
  const rules = usePlateRules()
  const vectors = usePlateRuleVectors()
  const report =
    rules.data && vectors.data
      ? runPlateRuleVectors(rules.data, vectors.data.vectors)
      : null

  return (
    <SectionBody query={{ isPending: rules.isPending || vectors.isPending, error: rules.error || vectors.error }}>
      <div className="space-y-2.5">
        <Tile className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-navy-soft">
            {t("dev.plateRules.version")}
          </span>
          <span className="text-sm font-extrabold text-navy">
            {rules.data?.version ?? "—"}
          </span>
        </Tile>
        <Tile className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-navy-soft">
            {t("dev.plateRules.language")}
          </span>
          <span className="text-sm font-extrabold text-navy">
            {t("dev.plateRules.languageValue", {
              language: rules.data?.language ?? "—",
              count: rules.data?.languages?.length ?? "—",
            })}
          </span>
        </Tile>
        <Tile className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-navy-soft">
            {t("dev.plateRules.countries")}
          </span>
          <span className="text-sm font-extrabold text-navy">
            {t("dev.plateRules.countriesValue", {
              withRules: rules.data ? Object.keys(rules.data.countries).length : "—",
              accepted: rules.data?.country.accepted.length ?? "—",
            })}
          </span>
        </Tile>
        {report && (
          <Tile
            className={cn(
              "space-y-1",
              report.failures.length > 0 && "bg-pink/10"
            )}
          >
            <p className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-navy-soft">
                {t("dev.plateRules.selfCheck")}
              </span>
              <span
                className={cn(
                  "text-sm font-extrabold",
                  report.failures.length === 0 ? "text-mint-deep" : "text-pink"
                )}
              >
                {t("dev.plateRules.selfCheckValue", {
                  passed: report.passed,
                  total: report.total,
                })}
              </span>
            </p>
            {report.failures.slice(0, 8).map((failure) => (
              <p
                key={`${failure.country}:${failure.plate}`}
                className="text-xs font-semibold text-pink"
              >
                {failure.country.toUpperCase()} {failure.plate} — expected{" "}
                {String(failure.valid)}, got {String(failure.got)}
                {failure.errorType ? ` (${failure.errorType})` : ""}
              </p>
            ))}
          </Tile>
        )}
      </div>
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
  const { t } = useT()
  const { data: me } = useMe()
  const supported = webPushSupported()
  const subscription = usePushSubscription().data ?? null
  const enable = useEnablePush()
  const disable = useDisablePush()
  // which mutation's outcome the status line reflects
  const [last, setLast] = useState<"enable" | "disable" | null>(null)

  if (!supported) {
    return <EmptyNote>{t("account.push.unsupported")}</EmptyNote>
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
            ? t("account.push.notConfigured")
            : apiErrorMessage(enable.error),
      }
    } else if (enable.data?.status === "denied") {
      status = {
        ok: false,
        text: t("account.push.denied"),
      }
    } else if (enable.data?.status === "dismissed") {
      status = { ok: false, text: t("account.push.dismissed") }
    } else if (enable.data?.status === "registered") {
      status = {
        ok: true,
        text: me?.email
          ? t("account.push.registeredBound", { email: me.email })
          : t("account.push.registered"),
      }
    }
  } else if (last === "disable") {
    if (disable.error) {
      status = { ok: false, text: apiErrorMessage(disable.error) }
    } else if (disable.isSuccess) {
      status = { ok: true, text: t("account.push.turnedOff") }
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
      <p className="text-sm font-medium text-navy-soft">{t("account.push.intro")}</p>
      <Button
        variant="brand"
        size="pill"
        className="mt-3 h-10 w-full text-sm"
        onClick={toggle}
        disabled={busy || permission === "denied"}
      >
        {busy && <Spinner />}
        {subscription ? t("account.push.turnOff") : t("account.push.turnOn")}
      </Button>
      {permission === "denied" && (
        <p className="mt-2 text-xs font-semibold text-navy-soft">
          {t("account.push.blocked")}
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
  const { t } = useT()
  const query = useSessions()
  const { data } = query
  return (
    <SectionBody query={query}>
      {data && (
        <div className="space-y-2.5">
          {data.map((s) => (
            <Tile key={s.id} className="bg-[#f6f8fa]">
              <p className="flex items-center gap-2 text-sm font-extrabold text-navy">
                {s.device_name || t("account.sessions.unknownDevice")}
                {s.current && (
                  <Badge className="rounded-full bg-mint/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-mint-deep uppercase hover:bg-mint/20">
                    {t("account.sessions.thisDevice")}
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-navy-soft">
                {s.last_used_at
                  ? t("account.sessions.metaLastUsed", {
                      ip: s.ip ?? "—",
                      created: formatDate(s.created_at),
                      lastUsed: formatDate(s.last_used_at),
                    })
                  : t("account.sessions.meta", {
                      ip: s.ip ?? "—",
                      created: formatDate(s.created_at),
                    })}
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
  const { t } = useT()
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
            <EmptyNote>{t("account.consents.empty")}</EmptyNote>
          ) : (
            <div className="space-y-2">
              {data.map((c) => (
                <Tile
                  key={String(c.partner_id)}
                  className="bg-[#f6f8fa] text-sm font-semibold text-navy"
                >
                  {t("account.consents.row", {
                    id: String(c.partner_id),
                    scope: c.scope,
                    date: formatDate(c.granted_at),
                  })}
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
                    toast.success(t("account.consents.granted")),
                  onError: (e) => toast.error(apiErrorMessage(e)),
                })
              }
            >
              {busy === "grant" && <Spinner className="text-white" />}{" "}
              {t("account.consents.grant")}
            </Button>
            <Button
              variant="outline"
              size="pill"
              className="h-10 flex-1 border-2 border-pink bg-transparent text-sm text-pink hover:bg-pink/5 hover:text-pink"
              disabled={busy !== null}
              onClick={() =>
                revoke.mutate(undefined, {
                  onSuccess: () => toast.success(t("account.consents.revoked")),
                  onError: (e) => toast.error(apiErrorMessage(e)),
                })
              }
            >
              {busy === "revoke" && <Spinner />} {t("account.consents.revoke")}
            </Button>
          </div>
          <p className="mt-2 text-xs font-medium text-navy-soft">
            {t("account.consents.note")}
          </p>
        </>
      )}
    </SectionBody>
  )
}

/** Signing out swaps the session too — caches reset the same way as sign-in. */
function SignOutButtons() {
  const { t } = useT()
  const logout = useAuthStore((s) => s.logout)
  const logoutAll = useAuthStore((s) => s.logoutAll)
  const signOut = useMutation({
    mutationFn: (which: "one" | "all") => (which === "one" ? logout() : logoutAll()),
    onSuccess: (_result, which) =>
      toast.success(
        which === "one" ? t("account.signedOut") : t("account.signedOutAll")
      ),
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
        {t("account.signOut")}
      </Button>
      <Button
        variant="glass"
        size="xl"
        className="h-13 flex-1 text-[15px] tracking-normal normal-case disabled:opacity-60"
        disabled={busy !== null}
        onClick={() => signOut.mutate("all")}
      >
        {busy === "all" ? <Spinner className="text-white" /> : <LogOut className="size-4" />}
        {t("account.signOutAll")}
      </Button>
    </div>
  )
}
