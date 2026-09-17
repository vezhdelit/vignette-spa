import { useState } from "react"
import { Plus, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { TopUpPanel } from "@/components/wallet/TopUpPanel"
import { WalletTransactions } from "@/components/wallet/WalletTransactions"
import { apiErrorMessage } from "@/lib/api"
import { formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n"
import { useInvalidateWallet, useWallet } from "@/queries/wallet"

/**
 * The Account tab's Wallet section: the two pots, a way to top up, and the
 * statement.
 *
 * Both amounts are integer cents. `balance` is money paid in plus referral
 * rewards and can be withdrawn; `bonuses` is top-up tiers and promo cashback
 * and can only be spent on an order — which is why they are shown apart
 * rather than as one number.
 */

function Tile({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl bg-[#f1f4f8] p-3", className)} {...props} />
}

export function WalletBody() {
  const { t } = useT()
  const query = useWallet()
  const invalidateWallet = useInvalidateWallet()
  const [toppingUp, setToppingUp] = useState(false)
  const data = query.data

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm font-semibold text-navy-soft">
        <Spinner /> {t("common.loading")}
      </p>
    )
  }

  if (query.error || !data) {
    return (
      <Alert variant="destructive" className="border-pink text-pink">
        <TriangleAlert />
        <AlertDescription className="font-semibold text-pink">
          {apiErrorMessage(query.error)}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <>
      <div className="flex gap-3">
        <Tile className="flex-1 p-3.5 text-center">
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

      {/* bonuses can pay for a vignette but can never be withdrawn — worth
          saying once, next to the number */}
      {data.bonuses > 0 && (
        <p className="mt-2 text-[13px] leading-snug font-semibold text-navy-soft">
          {t("account.wallet.bonusesNote")}
        </p>
      )}

      {data.top_up.enabled && !toppingUp && (
        <Button
          variant="brand"
          size="pill"
          className="mt-3 w-full"
          onClick={() => setToppingUp(true)}
        >
          <Plus className="size-4" />
          {t("account.wallet.topUp")}
        </Button>
      )}

      {toppingUp && (
        <TopUpPanel
          wallet={data}
          onClose={() => setToppingUp(false)}
          onCredited={invalidateWallet}
        />
      )}

      <p className="mt-4 text-xs font-bold tracking-wider text-navy-soft uppercase">
        {t("wallet.statement.title")}
      </p>
      <WalletTransactions />
    </>
  )
}
