import type { SavedDocument } from "@/types/api"

/** The holder's name for a saved-document chip: Latin first, the local script as a fallback, else the type. */
export function documentHolder(
  document: SavedDocument,
  typeLabel: (type: SavedDocument["document_type"]) => string,
) {
  return (
    [document.first_name, document.last_name].filter(Boolean).join(" ") ||
    [document.first_name_local, document.last_name_local].filter(Boolean).join(" ") ||
    typeLabel(document.document_type)
  )
}
