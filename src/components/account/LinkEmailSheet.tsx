import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { ChevronRight, CircleCheck, MailPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage, ApiRequestError } from "@/lib/api"
import { trackCustom } from "@/lib/insights"
import { useT } from "@/i18n"
import { useAuthStore } from "@/stores/auth"

/**
 * A Hide My Email account (Sign in with Apple, "Hide My Email") links the
 * address the person bought with — never required (App Review 4.8):
 *
 * - LinkEmailPrompt: asked ONCE, right after the Apple sign-in that created
 *   the account (stores/auth.ts#linkPrompt). "No" simply closes it.
 * - LinkEmailRow: the card in Account for any Hide My Email account
 *   (GET /public/me private_email), for later.
 *
 * Both open LinkEmailSheet: email → code → done, through otp/start and
 * POST /public/me/identities/email. The answer is a NEW session — on the
 * account that address already had, when it had one — swapped in by the
 * store; every session-scoped query is re-read.
 */
export function LinkEmailPrompt() {
  const { t } = useT()
  const dismiss = useAuthStore((s) => s.dismissLinkPrompt)
  const [open, setOpen] = useState(false)
  const answer = (value: "yes" | "no") => {
    trackCustom("account.email_link_answered", { answer: value, via: "signup" })
    if (value === "no") dismiss()
    else setOpen(true)
  }
  return (
    <>
      <Card className="rounded-[24px] ring-0 [--card-spacing:--spacing(5)]">
        <CardContent>
          <h2 className="text-lg font-extrabold text-navy">
            {t("account.linkEmail.promptTitle")}
          </h2>
          <p className="mt-1 text-sm font-semibold text-navy-soft">
            {t("account.linkEmail.promptBody")}
          </p>
          <Button
            variant="pink"
            size="xl"
            className="mt-4 w-full text-base tracking-wide"
            onClick={() => answer("yes")}
          >
            {t("account.linkEmail.promptYes")}
          </Button>
          <Button
            variant="link"
            className="mt-1 w-full font-bold text-navy-soft"
            onClick={() => answer("no")}
          >
            {t("account.linkEmail.promptNo")}
          </Button>
        </CardContent>
      </Card>
      <LinkEmailSheet
        open={open}
        onClose={() => {
          setOpen(false)
          // closing the sheet on any step is the No answer: asked once
          dismiss()
        }}
      />
    </>
  )
}

export function LinkEmailRow() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Card className="gap-0 rounded-[24px] py-0 ring-0">
        <button
          type="button"
          className="flex w-full items-center gap-3.5 p-4 text-left outline-none"
          onClick={() => {
            trackCustom("account.email_link_answered", { answer: "yes", via: "account" })
            setOpen(true)
          }}
        >
          <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft/60">
            <MailPlus className="size-5.5 text-brand" />
          </span>
          <span className="flex-1">
            <span className="block text-[16px] font-extrabold text-navy">
              {t("account.linkEmail.rowTitle")}
            </span>
            <span className="block text-[13px] font-semibold text-navy-soft">
              {t("account.linkEmail.rowSubtitle")}
            </span>
          </span>
          <ChevronRight className="size-5 text-navy-soft" />
        </button>
      </Card>
      <LinkEmailSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

type Step =
  | { kind: "email" }
  | { kind: "code"; email: string; challengeId: string }
  | { kind: "done"; email: string; result: "linked" | "merged"; orders: number }

function LinkEmailSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const queryClient = useQueryClient()
  const startOtp = useAuthStore((s) => s.startOtp)
  const linkEmailIdentity = useAuthStore((s) => s.linkEmailIdentity)
  const [step, setStep] = useState<Step>({ kind: "email" })
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  // the next open starts on the email step again
  const close = () => {
    onClose()
    setStep({ kind: "email" })
    setCode("")
  }

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const emailValid = /.+@.+\..+/.test(email.trim())

  const sendCode = async () => {
    setBusy(true)
    try {
      const started = await startOtp(email.trim())
      setResendIn(started.resend_after)
      setCode("")
      setStep({ kind: "code", email: email.trim(), challengeId: started.challenge_id })
    } catch (e) {
      // a Hide My Email address is refused here with the server's own line
      toast.error(apiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const connect = async (value: string) => {
    if (step.kind !== "code") return
    setBusy(true)
    try {
      const link = await linkEmailIdentity({ challengeId: step.challengeId, code: value })
      trackCustom("account.email_linked", { result: link.result, orders: link.orders })
      // the session changed (a merge changes the account too): read everything again
      void queryClient.invalidateQueries()
      setStep({ kind: "done", email: step.email, result: link.result, orders: link.orders })
    } catch (e) {
      const type = e instanceof ApiRequestError ? e.type : "unknown"
      trackCustom("account.email_link_failed", { reason: type })
      toast.error(
        type === "wallet_not_empty" ? t("account.linkEmail.walletNotEmpty") : apiErrorMessage(e)
      )
      setCode("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !next && !busy && close()}>
      <DrawerContent className="border-0 data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        <div className="flex flex-col gap-4 px-5 pt-3 pb-6">
          {step.kind === "done" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CircleCheck className="size-16 text-brand" />
              <DrawerTitle className="text-[22px] font-extrabold text-navy">
                {t("account.linkEmail.doneTitle")}
              </DrawerTitle>
              <DrawerDescription className="text-[15px] font-semibold text-navy-soft">
                {step.result === "merged" && step.orders > 0
                  ? t("account.linkEmail.doneMerged", { count: step.orders, email: step.email })
                  : t("account.linkEmail.doneLinked", { email: step.email })}
              </DrawerDescription>
              <Button variant="pink" size="xl" className="mt-2 w-full" onClick={close}>
                {t("common.done")}
              </Button>
            </div>
          ) : (
            <>
              <DrawerHeader className="p-0">
                <DrawerTitle className="text-[22px] font-extrabold text-navy">
                  {t("account.linkEmail.sheetTitle")}
                </DrawerTitle>
                <DrawerDescription className="text-[15px] font-medium text-navy-soft">
                  {step.kind === "email" ? (
                    t("account.linkEmail.sheetBody")
                  ) : (
                    <>
                      {t("account.signIn.enterCode")}{" "}
                      <span className="font-bold text-navy">{step.email}</span>
                    </>
                  )}
                </DrawerDescription>
              </DrawerHeader>

              {step.kind === "email" ? (
                <>
                  <Input
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && emailValid && !busy && sendCode()}
                    placeholder={t("common.email")}
                    aria-label={t("common.email")}
                    className="h-auto w-full rounded-2xl border-0 bg-[#f1f4f8] px-4 py-3.5 text-center text-lg font-semibold text-navy shadow-none placeholder:text-navy-soft md:text-lg"
                  />
                  <Button
                    variant="pink"
                    size="xl"
                    className="w-full text-lg tracking-wider"
                    disabled={busy || !emailValid}
                    onClick={() => void sendCode()}
                  >
                    {busy && <Spinner className="text-white" />} {t("account.signIn.sendCode")}
                  </Button>
                </>
              ) : (
                <>
                  <InputOTP
                    autoFocus
                    maxLength={6}
                    pattern={REGEXP_ONLY_DIGITS}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    disabled={busy}
                    onChange={(value) => {
                      setCode(value)
                      if (value.length === 6) void connect(value)
                    }}
                    containerClassName="justify-center"
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
                  {busy ? (
                    <p className="flex items-center justify-center gap-2 text-sm font-semibold text-navy-soft">
                      <Spinner /> {t("account.linkEmail.connecting")}
                    </p>
                  ) : (
                    <div className="flex items-center justify-between">
                      <Button
                        variant="link"
                        size="sm"
                        className="px-0 font-bold text-navy-soft"
                        onClick={() => setStep({ kind: "email" })}
                      >
                        {t("account.signIn.changeEmail")}
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="px-0 font-bold text-brand"
                        disabled={resendIn > 0}
                        onClick={() => void sendCode()}
                      >
                        {resendIn > 0
                          ? t("account.signIn.resendIn", { seconds: resendIn })
                          : t("account.signIn.resend")}
                      </Button>
                    </div>
                  )}
                </>
              )}

              <Button
                variant="ghost"
                className="w-full font-bold text-navy-soft"
                disabled={busy}
                onClick={close}
              >
                {t("account.linkEmail.skip")}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
