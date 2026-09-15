import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { NotificationsList } from "@/components/notifications/NotificationsList"
import { useT } from "@/i18n"
import { useSessionScope } from "@/queries/session"

/**
 * The header bell's destination: the whole inbox. Opening it is what marks
 * the fetched page read (see NotificationsList) — the bell badge itself
 * only ever polls the summary.
 */
export function NotificationsPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const { guest } = useSessionScope()

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={t("common.back")}
          className="text-white hover:bg-white/15 hover:text-white active:scale-95"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
        >
          <ArrowLeft className="size-6" />
        </Button>
        <h1 className="text-[26px] font-extrabold text-white">
          {t("notifications.title")}
        </h1>
      </div>

      {guest && (
        <p className="px-1 text-sm font-semibold text-white/85">
          {t("notifications.guestNote")}{" "}
          <Link to="/account" className="underline underline-offset-2">
            {t("common.signIn")}
          </Link>{" "}
          {t("notifications.guestNoteSuffix")}
        </p>
      )}

      <Card className="rounded-[24px] ring-0">
        <CardContent>
          <NotificationsList />
        </CardContent>
      </Card>
    </div>
  )
}
