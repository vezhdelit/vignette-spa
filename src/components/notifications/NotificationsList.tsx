import { CheckCheck, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage } from "@/lib/api"
import { formatDotDateTime } from "@/lib/format"
import { useT } from "@/i18n"
import { useSessionScope } from "@/queries/session"
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useNotifications,
} from "@/queries/account"
import { cn } from "@/lib/utils"
import type { AppNotification } from "@/types/api"

/**
 * The inbox. Mounting this list IS "the user opened the notifications
 * screen" — the one moment the API wants the fetched page flipped to read
 * (GET /public/me/notifications?mark_read=true), so it is only rendered by
 * the /notifications page and the Account section's open state, never by a
 * badge or a poll. Tapping a row toggles it explicitly (…/:id/read,
 * …/:id/unread); the header offers mark-all-read while anything is unread.
 * Those three writes are 403 for a guest, so they are hidden then — a
 * guest's inbox is always empty anyway.
 */
export function NotificationsList({ className }: { className?: string }) {
  const { t } = useT()
  const { guest } = useSessionScope()
  const query = useNotifications({ markRead: true })
  const {
    items,
    pagination,
    unreadCount,
    totalCount,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = query
  const markRead = useMarkNotificationRead()
  const markUnread = useMarkNotificationUnread()
  const markAll = useMarkAllNotificationsRead()

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

  if (items.length === 0)
    return (
      <Empty className="border-0 p-1 py-1">
        <EmptyHeader>
          <EmptyDescription className="text-sm font-semibold text-navy-soft">
            {guest ? t("notifications.emptyGuest") : t("notifications.empty")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  const toggle = (n: AppNotification) => {
    if (guest) return
    const mutation = n.read ? markUnread : markRead
    mutation.mutate(n.id, { onError: (e) => toast.error(apiErrorMessage(e)) })
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-bold tracking-wider text-navy-soft uppercase">
          {unreadCount > 0
            ? t("notifications.counts", { unread: unreadCount, total: totalCount })
            : t("notifications.countsAllRead", { total: totalCount })}
        </p>
        {!guest && unreadCount > 0 && (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0 font-bold text-brand"
            disabled={markAll.isPending}
            onClick={() =>
              markAll.mutate(undefined, {
                onSuccess: (r) =>
                  toast.success(
                    r.updated_count
                      ? t("notifications.markedRead", { count: r.updated_count })
                      : t("notifications.alreadyRead")
                  ),
                onError: (e) => toast.error(apiErrorMessage(e)),
              })
            }
          >
            {markAll.isPending ? (
              <Spinner className="size-3.5" />
            ) : (
              <CheckCheck className="size-3.5" />
            )}
            {t("notifications.markAllRead")}
          </Button>
        )}
      </div>

      {items.map((n) => (
        <button
          type="button"
          key={String(n.id)}
          onClick={() => toggle(n)}
          disabled={guest}
          aria-pressed={n.read}
          title={
            guest
              ? undefined
              : n.read
                ? t("notifications.markAsUnread")
                : t("notifications.markAsRead")
          }
          className={cn(
            "w-full rounded-2xl p-3 text-left transition-colors",
            n.read ? "bg-[#f6f8fa]" : "bg-brand-soft/50",
            !guest && "hover:bg-[#e8edf3] active:scale-[0.99]"
          )}
        >
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                n.read ? "bg-transparent" : "bg-pink"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm text-navy", n.read ? "font-bold" : "font-extrabold")}>
                {n.title}
              </p>
              <p className="mt-0.5 text-sm font-medium text-navy/80">{n.body}</p>
              <p className="mt-1 text-[11px] font-semibold text-navy-soft">
                {formatDotDateTime(n.created_at)}
                {n.read && n.read_at
                  ? ` · ${t("notifications.readAt", { date: formatDotDateTime(n.read_at) })}`
                  : ""}
              </p>
            </div>
          </div>
        </button>
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
            ? t("common.loading")
            : t("common.loadMore", {
                current: pagination.current,
                total: pagination.total,
              })}
        </Button>
      )}
    </div>
  )
}
