import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useT } from "@/i18n"
import { ApiRequestError } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import { useClaimReferral } from "@/queries/referrals"
import { clearPendingInviteCode, getPendingInviteCode } from "@/stores/invite"

/**
 * Turns an invite code the visitor arrived with into an actual link, the
 * moment there is an account to link.
 *
 * This is the piece that stops invites being lost. A referral link is
 * followed by someone who is not signed in, and the server will only link
 * an account through `POST /public/me/referrals/claim`, which needs a user
 * token. So the code waits in localStorage (stores/invite.ts) and this
 * component spends it as soon as the session stops being a guest.
 *
 * Mounted once, in the app shell. It renders nothing.
 *
 * Every outcome clears the code, including the refusals: they are all
 * final — a wrong code, your own code, a loop, or an account that already
 * has an inviter — so retrying on the next launch would only produce the
 * same error again. A network failure is the one case that keeps it, to be
 * retried next time.
 */
export function InviteClaimer() {
  const { t } = useT()
  const { ready, guest, userId } = useSessionScope()
  const claim = useClaimReferral()
  // one attempt per signed-in session, whatever re-renders happen
  const attemptedFor = useRef<string | null>(null)
  const { mutateAsync } = claim

  useEffect(() => {
    if (!ready || guest || !userId || attemptedFor.current === userId) return

    const code = getPendingInviteCode()
    if (!code) return

    attemptedFor.current = userId
    void (async () => {
      try {
        const result = await mutateAsync(code)
        clearPendingInviteCode()
        toast.success(
          t("account.referrals.claimed", {
            name: result.inviter.display_name ?? "—",
          })
        )
      } catch (e) {
        if (e instanceof ApiRequestError) {
          // the server reached a verdict, and every one of them is final
          clearPendingInviteCode()
          // Only worth a toast when the user could act on it. Already being
          // invited, or following your own link, is not something to
          // interrupt a sign-in for.
          if (e.type === "referral_code_invalid") {
            toast.error(t("account.referrals.codeInvalid"))
          }
        }
      }
    })()
  }, [ready, guest, userId, mutateAsync, t])

  return null
}
