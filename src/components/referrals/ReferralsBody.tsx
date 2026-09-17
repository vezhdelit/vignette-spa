import { useState } from "react"
import { Copy, Gift, Share2, TriangleAlert, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ApiRequestError, apiErrorMessage } from "@/lib/api"
import { formatCents, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"
import {
  useClaimReferral,
  useInvitedFriends,
  useReferralEarnings,
  useReferrals,
} from "@/queries/referrals"
import { clearPendingInviteCode } from "@/stores/invite"

/**
 * The Account tab's "Invite friends" section.
 *
 * Vocabulary throughout: the INVITER shares the link and is paid, the
 * INVITED used it and their purchases pay. Rewards are integer cents and
 * land in the wallet's balance, which is why the copy points at spending
 * them on the next vignette rather than at withdrawing.
 *
 * Emails of other people are masked by the server (`display_name`); this
 * never has, and never wants, the real address.
 */

function Tile({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl bg-[#f1f4f8] p-3", className)} {...props} />
}

export function ReferralsBody() {
  const { t } = useT()
  const summary = useReferrals()
  const [tab, setTab] = useState<"invited" | "earnings">("invited")
  const invited = useInvitedFriends({ enabled: tab === "invited" })
  const earnings = useReferralEarnings({ enabled: tab === "earnings" })
  const data = summary.data

  if (summary.isPending) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm font-semibold text-navy-soft">
        <Spinner /> {t("common.loading")}
      </p>
    )
  }

  if (summary.error || !data) {
    return (
      <Alert variant="destructive" className="border-pink text-pink">
        <TriangleAlert />
        <AlertDescription className="font-semibold text-pink">
          {apiErrorMessage(summary.error)}
        </AlertDescription>
      </Alert>
    )
  }

  const share = async () => {
    // The native sheet where there is one; clipboard everywhere else.
    if (navigator.share) {
      try {
        await navigator.share({
          title: t("account.referrals.shareTitle"),
          text: t("account.referrals.shareText", {
            reward: formatCents(data.rewards.level_1),
          }),
          url: data.link,
        })
        return
      } catch {
        /* dismissed — fall through to copying */
      }
    }
    await navigator.clipboard.writeText(data.link)
    toast.success(t("account.referrals.copied"))
  }

  return (
    <>
      <p className="text-[13px] leading-snug font-semibold text-navy-soft">
        {t("account.referrals.explainer", {
          reward: formatCents(data.rewards.level_1),
        })}
      </p>

      <div className="mt-2.5 flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(data.link)
            toast.success(t("account.referrals.copied"))
          }}
          className="h-auto min-w-0 flex-1 justify-between rounded-2xl bg-[#f1f4f8] px-4 py-3 text-sm font-bold text-navy hover:bg-[#e8edf3]"
        >
          <span className="truncate">{data.link}</span>
          <Copy className="ml-2 size-4 shrink-0 text-navy-soft" />
        </Button>
        <Button
          variant="brand"
          size="icon-lg"
          onClick={share}
          aria-label={t("account.referrals.share")}
          className="size-12 shrink-0 rounded-2xl"
        >
          <Share2 className="size-5" />
        </Button>
      </div>

      <div className="mt-3 flex gap-3 text-center">
        {[
          { label: t("account.referrals.invited"), value: String(data.invited) },
          { label: t("account.referrals.sales"), value: String(data.sales) },
          // income is integer cents, and it lands in the wallet balance
          { label: t("account.referrals.income"), value: formatCents(data.income, data.currency) },
        ].map(({ label, value }) => (
          <Tile key={label} className="flex-1">
            <p className="text-lg font-extrabold text-navy">{value}</p>
            <p className="text-[11px] font-bold tracking-wider text-navy-soft uppercase">
              {label}
            </p>
          </Tile>
        ))}
      </div>

      {data.inviter ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-navy-soft">
          <UserPlus className="size-4 shrink-0" />
          {t("account.referrals.invitedBy", {
            name: data.inviter.display_name ?? "—",
          })}
        </p>
      ) : (
        <ClaimInvite />
      )}

      <div className="mt-4 flex gap-2">
        {(["invited", "earnings"] as const).map((key) => (
          <Button
            key={key}
            variant="secondary"
            size="chip"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1",
              tab === key
                ? "bg-brand text-white hover:bg-brand"
                : "bg-[#f1f4f8] text-navy hover:bg-[#e8edf3]"
            )}
          >
            {t(`account.referrals.tab.${key}` as never)}
          </Button>
        ))}
      </div>

      {tab === "invited" ? (
        <List
          pending={invited.isPending}
          empty={t("account.referrals.noInvites")}
          items={invited.items.map((person) => ({
            key: person.id,
            title: person.display_name ?? "—",
            subtitle: person.joined_at ? formatDate(person.joined_at) : "",
            value: formatCents(person.earned, data.currency),
            note:
              person.purchases > 0
                ? t("account.referrals.purchases", { count: person.purchases })
                : t("account.referrals.noPurchasesYet"),
          }))}
          hasMore={invited.hasNextPage}
          loadingMore={invited.isFetchingNextPage}
          onMore={() => void invited.fetchNextPage()}
          pagination={invited.pagination}
        />
      ) : (
        <List
          pending={earnings.isPending}
          empty={t("account.referrals.noEarnings")}
          items={earnings.items.map((entry) => ({
            key: String(entry.id),
            title: entry.invited_display_name ?? "—",
            subtitle: formatDate(entry.created_at),
            value: `+${formatCents(entry.amount, entry.currency)}`,
            note: t("account.referrals.level", { level: entry.level }),
          }))}
          hasMore={earnings.hasNextPage}
          loadingMore={earnings.isFetchingNextPage}
          onMore={() => void earnings.fetchNextPage()}
          pagination={earnings.pagination}
        />
      )}
    </>
  )
}

function List({
  pending,
  empty,
  items,
  hasMore,
  loadingMore,
  onMore,
  pagination,
}: {
  pending: boolean
  empty: string
  items: { key: string; title: string; subtitle: string; value: string; note: string }[]
  hasMore: boolean
  loadingMore: boolean
  onMore: () => void
  pagination: { current: number; total: number }
}) {
  const { t } = useT()

  if (pending) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm font-semibold text-navy-soft">
        <Spinner /> {t("common.loading")}
      </p>
    )
  }

  if (!items.length) {
    return <p className="py-2 text-sm font-semibold text-navy-soft">{empty}</p>
  }

  return (
    <>
      <ul className="mt-2 divide-y divide-[#e8edf3]">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft/60 text-brand">
              <Gift className="size-4.5" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[15px] font-bold text-navy">
                {item.title}
              </span>
              <span className="block truncate text-xs font-semibold text-navy-soft">
                {item.subtitle}
                {item.note && ` · ${item.note}`}
              </span>
            </span>
            <span className="shrink-0 text-[15px] font-extrabold whitespace-nowrap text-mint">
              {item.value}
            </span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button
          variant="secondary"
          size="pill"
          className="mt-2 w-full"
          disabled={loadingMore}
          onClick={onMore}
        >
          {loadingMore
            ? t("common.loading")
            : t("common.loadMore", {
                current: pagination.current,
                total: pagination.total,
              })}
        </Button>
      )}
    </>
  )
}

/**
 * "Someone invited me" — the self-serve claim.
 *
 * This is the path that stops an invite being lost: the web only ever
 * linked at sign-up or at checkout, so a code that arrived any other way
 * (a different device, cleared storage, an account that already existed)
 * used to go nowhere. Shown only while the account has no inviter, because
 * an inviter can never be changed once set.
 */
function ClaimInvite() {
  const { t } = useT()
  const [code, setCode] = useState("")
  const claim = useClaimReferral()

  const submit = async () => {
    try {
      const result = await claim.mutateAsync(code)
      clearPendingInviteCode()
      setCode("")
      toast.success(
        t("account.referrals.claimed", {
          name: result.inviter.display_name ?? "—",
        })
      )
    } catch (e) {
      // Every refusal here is final — a wrong code, your own code, a loop,
      // or an account that already has an inviter — so say which.
      toast.error(
        e instanceof ApiRequestError && e.type === "already_invited"
          ? t("account.referrals.alreadyInvited")
          : apiErrorMessage(e)
      )
    }
  }

  return (
    <div className="mt-3 rounded-2xl bg-[#f1f4f8] p-3">
      <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
        {t("account.referrals.haveCode")}
      </p>
      <div className="mt-2 flex items-stretch gap-2">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={t("account.referrals.codePlaceholder")}
          aria-label={t("account.referrals.haveCode")}
          autoComplete="off"
          spellCheck={false}
          className="h-auto min-w-0 flex-1 rounded-xl border-0 bg-white px-3.5 py-2.5 text-[15px] font-bold text-navy shadow-none"
        />
        <Button
          variant="brand"
          onClick={submit}
          disabled={claim.isPending || !code}
          className="h-auto shrink-0 rounded-xl px-5 text-sm font-extrabold"
        >
          {claim.isPending ? <Spinner className="size-4" /> : t("account.referrals.apply")}
        </Button>
      </div>
    </div>
  )
}
