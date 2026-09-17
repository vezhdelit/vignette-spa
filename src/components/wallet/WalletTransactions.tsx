import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Receipt,
  RotateCcw,
  Ticket,
  Wallet as WalletIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatCents, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"
import { useWalletTransactions } from "@/queries/wallet"
import type { WalletEntryType, WalletTransaction } from "@/types/api"

/**
 * The wallet statement. One row per movement, newest first, in the
 * vocabulary the server already normalises to — so the legacy rows the web
 * checkout has been writing for years render the same as new ones.
 */

const ICONS: Record<WalletEntryType, React.ComponentType<{ className?: string }>> = {
  top_up: ArrowDownLeft,
  order_payment: Receipt,
  referral_reward: Gift,
  cashback: Ticket,
  cashback_reversal: RotateCcw,
  withdrawal: ArrowUpRight,
  refund: RotateCcw,
  bonus: Gift,
  welcome_bonus: Gift,
  adjustment: WalletIcon,
  other: WalletIcon,
}

function Row({ entry }: { entry: WalletTransaction }) {
  const { t } = useT()
  const Icon = ICONS[entry.type] ?? WalletIcon
  const credit = entry.direction === "credit"
  const pending = entry.status === "pending"
  const cancelled = entry.status === "cancelled"

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          credit ? "bg-mint/15 text-mint" : "bg-navy/8 text-navy-soft"
        )}
      >
        <Icon className="size-4.5" />
      </span>

      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[15px] font-bold text-navy">
          {t(`wallet.entry.${entry.type}` as never)}
        </span>
        <span className="block truncate text-xs font-semibold text-navy-soft">
          {entry.created_at ? formatDate(entry.created_at) : ""}
          {pending && ` · ${t("wallet.entry.pending")}`}
          {cancelled && ` · ${t("wallet.entry.cancelled")}`}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span
          className={cn(
            "block text-[15px] font-extrabold whitespace-nowrap",
            cancelled
              ? "text-navy-soft line-through"
              : credit
                ? "text-mint"
                : "text-navy"
          )}
        >
          {credit ? "+" : "−"}
          {formatCents(entry.amount, entry.currency)}
        </span>
        {/* a top-up's bonus, and how a mixed debit split across the pots */}
        {entry.type === "top_up" && entry.bonus > 0 && (
          <span className="block text-[11px] font-bold text-mint">
            +{formatCents(entry.bonus, entry.currency)} {t("account.wallet.bonuses")}
          </span>
        )}
        {entry.split && entry.split.bonuses ? (
          <span className="block text-[11px] font-semibold text-navy-soft">
            {formatCents(entry.split.bonuses, entry.currency)}{" "}
            {t("account.wallet.bonuses")}
          </span>
        ) : null}
      </span>
    </li>
  )
}

export function WalletTransactions({ enabled = true }: { enabled?: boolean }) {
  const { t } = useT()
  const query = useWalletTransactions({ enabled })

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm font-semibold text-navy-soft">
        <Spinner /> {t("common.loading")}
      </p>
    )
  }

  if (!query.items.length) {
    return (
      <p className="py-2 text-sm font-semibold text-navy-soft">
        {t("wallet.statement.empty")}
      </p>
    )
  }

  return (
    <>
      <ul className="divide-y divide-[#e8edf3]">
        {query.items.map((entry) => (
          <Row key={entry.id} entry={entry} />
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          variant="secondary"
          size="pill"
          className="mt-2 w-full"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage
            ? t("common.loading")
            : t("common.loadMore", {
                current: query.pagination.current,
                total: query.pagination.total,
              })}
        </Button>
      )}
    </>
  )
}
