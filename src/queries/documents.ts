/**
 * The account's saved travel documents (vignette.id docs/documents/README.md).
 *
 *   GET    /public/me/documents            the list, newest use first
 *   POST   /public/me/documents            save one (the same number updates)
 *   POST   /public/me/documents/:id/use    a checkout picked it
 *   DELETE /public/me/documents/:id
 *
 * Signed-in accounts only: a guest has no account for a document to belong
 * to (403 guest_not_allowed), so the query stays disabled for one. The forms
 * save the typed passport on submit, like a vehicle or a company.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiResult } from "@/lib/api"
import { useSessionScope } from "@/queries/session"
import type { SavedDocument, SavedDocumentInput, SavedDocumentType } from "@/types/api"

export const documentKeys = {
  all: (scope: string) => ["documents", scope] as const,
}

export function useSavedDocuments() {
  const { scope, ready, guest, userId } = useSessionScope()
  return useQuery({
    queryKey: documentKeys.all(scope),
    queryFn: () => apiResult<SavedDocument[]>("/public/me/documents"),
    enabled: ready && userId !== null && !guest,
    staleTime: 5 * 60_000,
  })
}

/** The saved documents a form can use, by type — e.g. Moldova takes foreign passports. */
export function useSavedDocumentsOf(types: SavedDocumentType[]) {
  const query = useSavedDocuments()
  return {
    ...query,
    documents: (query.data ?? []).filter((document) => types.includes(document.document_type)),
  }
}

export function useSaveDocument() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (document: SavedDocumentInput) =>
      apiResult<SavedDocument>("/public/me/documents", {
        method: "POST",
        body: document,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentKeys.all(scope) }),
  })
}

export function useUseDocument() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (id: number) =>
      apiResult<SavedDocument>(`/public/me/documents/${id}/use`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentKeys.all(scope) }),
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  const { scope } = useSessionScope()
  return useMutation({
    mutationFn: (id: number) =>
      apiResult<{ deleted: number }>(`/public/me/documents/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentKeys.all(scope) }),
  })
}
