import { CheckCheck, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage } from "@/lib/api"
import { formatDotDateTime } from "@/lib/format"
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
        <Spinner /> Loading…
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
            {guest
              ? "Alerts are kept on an account — sign in to get payment and vignette updates here."
              : "Nothing here yet — payment and vignette updates will show up here."}
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
          {unreadCount > 0 ? `${unreadCount} unread · ${totalCount} total` : `${totalCount} total`}
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
                    r.updated_count ? `Marked ${r.updated_count} as read` : "Already all read"
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
            Mark all read
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
          title={guest ? undefined : n.read ? "Mark as unread" : "Mark as read"}
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
                {n.read && n.read_at ? ` · read ${formatDotDateTime(n.read_at)}` : ""}
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
            ? "Loading…"
            : `Load more (${pagination.current}/${pagination.total})`}
        </Button>
      )}
    </div>
  )
}
