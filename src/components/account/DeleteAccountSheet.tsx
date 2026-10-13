import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, ShieldAlert, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { apiErrorMessage, ApiRequestError } from "@/lib/api"
import { formatCents } from "@/lib/format"
import { trackCustom } from "@/lib/insights"
import { useT } from "@/i18n"
import { useDeleteAccount, useDeletionPreview } from "@/queries/account"

/** what the server keeps of a typed reason */
const MAX_REASON = 200

/**
 * The door to account deletion — the last row of the Account tab, under
 * sign-out. Apple (App Store Review 5.1.1(v)) and Google Play both require
 * that an account can be deleted from inside the app; this is that.
 */
export function DeleteAccountRow() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Card className="gap-0 rounded-[24px] py-0 ring-0">
        <button
          type="button"
          className="flex w-full items-center gap-3.5 p-4 text-left outline-none"
          onClick={() => setOpen(true)}
        >
          <span className="flex size-11 items-center justify-center rounded-2xl bg-pink/15">
            <Trash2 className="size-5.5 text-pink" />
          </span>
          <span className="flex-1">
            <span className="block text-[16px] font-extrabold text-navy">
              {t("account.delete.title")}
            </span>
            <span className="block text-[13px] font-semibold text-navy-soft">
              {t("account.delete.subtitle")}
            </span>
          </span>
          <ChevronRight className="size-5 text-navy-soft" />
        </button>
      </Card>
      <DeleteAccountSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The confirmation. It reads GET /me/deletion while open — vignettes that
 * stay valid, unpaid orders that are abandoned, and the wallet money that is
 * forfeited — and sends DELETE /me. When the preview says money is at stake
 * the person has to tick the acknowledgement first; if the server still
 * answers 409 (a top-up landed in between), the preview is re-read and the
 * tick asked for again rather than the request being retried blindly.
 *
 * Success drops the session: the API revoked every session of the account,
 * the query cache is cleared and a fresh guest session takes over, so the
 * Account tab is back to its signed-out state by the time the sheet closes.
 */
function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const navigate = useNavigate()
  const preview = useDeletionPreview(open)
  const remove = useDeleteAccount()
  const [acknowledged, setAcknowledged] = useState(false)
  const [reason, setReason] = useState("")

  // every open starts clean — the tick and the text belong to one decision
  useEffect(() => {
    if (open) {
      setAcknowledged(false)
      setReason("")
    }
  }, [open])

  const data = preview.data
  const forfeit = data?.requires_forfeit_acknowledgement ?? false
  const forfeitAmount = data ? formatCents(data.wallet.total, data.wallet.currency) : ""
  const canConfirm = !!data && !remove.isPending && (!forfeit || acknowledged)

  const confirm = async () => {
    if (!data) return
    trackCustom("account.deletion_requested", {
      active_orders: data.orders.active,
      pending_orders: data.orders.pending,
      forfeited_cents: forfeit ? data.wallet.total : 0,
      has_reason: reason.trim().length > 0,
    })
    try {
      await remove.mutateAsync({ reason, acknowledgeForfeit: forfeit && acknowledged })
      onClose()
      toast.success(t("account.delete.done"), { description: t("account.delete.again") })
      navigate("/")
    } catch (e) {
      if (e instanceof ApiRequestError && e.type === "wallet_balance_forfeit") {
        // money arrived after the preview was read: show it and ask again
        setAcknowledged(false)
        void preview.refetch()
        toast.error(t("account.delete.walletChanged"))
        return
      }
      toast.error(apiErrorMessage(e))
    }
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !next && !remove.isPending && onClose()}>
      <DrawerContent className="border-0 !bg-brand data-[vaul-drawer-direction=bottom]:rounded-t-[26px]">
        <div className="flex flex-col gap-4 px-5 pt-3 pb-6">
          <DrawerHeader className="p-0">
            <DrawerTitle className="text-[22px] font-extrabold text-white">
              {t("account.delete.sheetTitle")}
            </DrawerTitle>
            <DrawerDescription className="text-[15px] font-medium text-white/85">
              {t("account.delete.sheetBody")}
            </DrawerDescription>
          </DrawerHeader>

          {preview.isPending ? (
            <p className="flex items-center gap-2 py-2 text-sm font-semibold text-white/85">
              <Spinner className="text-white" /> {t("common.loading")}
            </p>
          ) : preview.error ? (
            <Alert variant="destructive" className="border-0 bg-white/15 text-white">
              <TriangleAlert />
              <AlertDescription className="font-semibold text-white">
                {apiErrorMessage(preview.error)}
              </AlertDescription>
            </Alert>
          ) : data ? (
            <>
              {/* what stays — the part that makes deleting safe to do */}
              <div className="rounded-2xl bg-white/15 px-4 py-3">
                <p className="text-[13px] font-extrabold tracking-wide text-white/70 uppercase">
                  {t("account.delete.keepsTitle")}
                </p>
                <ul className="mt-1.5 space-y-1.5 text-[14px] font-semibold text-white">
                  {data.orders.active > 0 && (
                    <li>{t("account.delete.keepsVignettes", { count: data.orders.active })}</li>
                  )}
                  <li>{t("account.delete.keepsRecords")}</li>
                  {data.orders.pending > 0 && (
                    <li className="text-white/80">
                      {t("account.delete.pending", { count: data.orders.pending })}
                    </li>
                  )}
                </ul>
              </div>

              {forfeit && (
                <div className="rounded-2xl bg-pink/25 px-4 py-3">
                  <p className="flex items-center gap-2 text-[15px] font-extrabold text-white">
                    <ShieldAlert className="size-5 shrink-0" />
                    {t("account.delete.walletTitle")}
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-white/90">
                    {t("account.delete.walletBody", { amount: forfeitAmount })}
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={acknowledged}
                      onCheckedChange={(v) => setAcknowledged(v === true)}
                      className="mt-0.5 size-6 shrink-0 rounded-md border-2 border-white/80 bg-white/15 data-checked:border-white data-checked:bg-white data-checked:text-pink"
                    />
                    <span className="text-[14px] font-extrabold leading-snug text-white">
                      {t("account.delete.walletAck", { amount: forfeitAmount })}
                    </span>
                  </label>
                </div>
              )}

              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
                placeholder={t("account.delete.reasonPlaceholder")}
                rows={2}
                className="rounded-2xl border-0 bg-white px-4 py-3 text-[15px] font-medium text-navy placeholder:text-navy-soft"
              />
            </>
          ) : null}

          <Button
            variant="pink"
            size="xl"
            className="w-full text-lg tracking-[0.15em]"
            disabled={!canConfirm}
            onClick={() => void confirm()}
          >
            {remove.isPending ? t("account.delete.deleting") : t("account.delete.confirm")}
          </Button>
          <Button
            variant="glass"
            size="pill"
            className="w-full"
            disabled={remove.isPending}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
