import { X } from "lucide-react"
import { useT } from "@/i18n"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { documentHolder } from "@/lib/documents"
import type { SavedDocument } from "@/types/api"

/**
 * The "saved documents" picker above a form that asks for a passport: one
 * chip per document, the number masked. Renders nothing when there is nothing
 * to pick. Tap a chip to fill the form; its × removes the document.
 */
export function SavedDocumentPicker({
  documents,
  selectedId,
  onSelect,
  onRemove,
}: {
  documents: SavedDocument[]
  selectedId: number | null
  onSelect: (document: SavedDocument) => void
  onRemove: (document: SavedDocument) => void
}) {
  const { t } = useT()
  if (documents.length === 0) return null
  const typeLabel = (type: SavedDocument["document_type"]) =>
    t(`documents.type.${type}` as Parameters<typeof t>[0])
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-xs font-bold tracking-wider text-navy-soft uppercase">
        {t("documents.saved")}
      </p>
      <div className="flex flex-wrap gap-2">
        {documents.map((document) => {
          const selected = document.id === selectedId
          return (
            <div key={document.id} className="flex items-center">
              <Button
                type="button"
                variant="outline"
                size="chip"
                aria-pressed={selected}
                onClick={() => onSelect(document)}
                className={cn(
                  "rounded-r-none border-2 pr-2",
                  selected ? "border-mint bg-mint/10" : "border-navy/15",
                )}
              >
                <span className="font-extrabold tracking-wider">{document.number_masked}</span>
                <span className="text-navy-soft">{documentHolder(document, typeLabel)}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="chip"
                aria-label={t("documents.remove")}
                onClick={() => onRemove(document)}
                className={cn(
                  "rounded-l-none border-2 border-l-0 px-2",
                  selected ? "border-mint" : "border-navy/15",
                )}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
