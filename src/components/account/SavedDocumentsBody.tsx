import { IdCard, Trash2 } from "lucide-react"
import { useT } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage } from "@/lib/api"
import { useDeleteDocument, useSavedDocuments } from "@/queries/documents"
import { documentHolder } from "@/lib/documents"
import type { SavedDocument } from "@/types/api"

/** The Account section's icon, so the page imports one name. */
export const SavedDocumentsIcon = IdCard

/**
 * Account → Saved documents: the passports the account saved from the
 * Moldova and Green Card forms, with the numbers masked, and a way to delete
 * one. Nothing is added here: a document is saved by the form it is typed
 * into, when the order or policy is submitted.
 */
export function SavedDocumentsBody() {
  const { t } = useT()
  const query = useSavedDocuments()
  const remove = useDeleteDocument()
  const typeLabel = (type: SavedDocument["document_type"]) =>
    t(`documents.type.${type}` as Parameters<typeof t>[0])

  if (query.isPending) {
    return (
      <div className="flex justify-center py-3">
        <Spinner />
      </div>
    )
  }
  if (query.isError) {
    return (
      <p className="px-1 text-[13px] font-semibold text-pink">{apiErrorMessage(query.error)}</p>
    )
  }
  if (query.data.length === 0) {
    return <p className="px-1 text-sm text-navy-soft">{t("documents.empty")}</p>
  }
  return (
    <div className="space-y-2">
      {query.data.map((document) => {
        const busy = remove.isPending && remove.variables === document.id
        return (
          <div
            key={document.id}
            className="flex items-center justify-between gap-3 rounded-2xl bg-brand-tint/40 px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <p className="font-extrabold tracking-wider text-navy">{document.number_masked}</p>
              <p className="truncate text-xs font-semibold text-navy-soft">
                {typeLabel(document.document_type)} · {documentHolder(document, typeLabel)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="chip"
              disabled={busy}
              aria-label={t("documents.remove")}
              onClick={() => remove.mutate(document.id)}
              className="shrink-0 border-2 border-pink/50 px-2.5 text-pink hover:text-pink"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
