import { useState } from "react"
import { ExternalLink, FileText, Loader2, ShieldAlert, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage } from "@/lib/api"
import { formatDate, formatPrice } from "@/lib/format"
import { useT, type MessageKey } from "@/i18n"
import { durationLabel } from "@/components/order/GreenCardSheet"
import { downloadPolicyDocument, usePolicy } from "@/queries/insurances"
import { cn } from "@/lib/utils"
import type { GreenCardPolicyDetails, Policy, PolicyDocumentType } from "@/types/api"

const STATUS_KEYS: Record<Policy["status"], MessageKey> = {
  created: "greenCard.status.created",
  processing: "greenCard.status.processing",
  issued: "greenCard.status.issued",
  failed: "greenCard.status.failed",
}

const STATUS_CLASS: Record<Policy["status"], string> = {
  created: "bg-neutral-600/70 text-white",
  processing: "bg-amber-400 text-[#4a3200]",
  issued: "bg-mint text-white",
  failed: "bg-pink text-white",
}

/** The product's own fields, when this build knows the product. */
const greenCardDetails = (policy: Policy): GreenCardPolicyDetails | null =>
  policy.product === "green_card" ? (policy.details as GreenCardPolicyDetails) : null

/** What the title says for a product this build predates. */
const productTitle = (t: ReturnType<typeof useT>["t"], product: string) =>
  product === "green_card"
    ? t("greenCard.title")
    : product.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * One insurance policy on an order card: the shared half (status, validity,
 * price, documents, validity link) for every product, the Green Card
 * details when it is one. Polls the policy while the insurer is still
 * writing it (only while the card is expanded).
 */
export function PolicyCard({ policy: initial, enabled }: { policy: Policy; enabled: boolean }) {
  const { t } = useT()
  const { data } = usePolicy(initial, { enabled })
  const policy = data ?? initial
  const [busy, setBusy] = useState<string | null>(null)
  const pending = policy.status === "created" || policy.status === "processing"
  const greenCard = greenCardDetails(policy)

  const openDocument = async (type: PolicyDocumentType) => {
    setBusy(type)
    try {
      const blob = await downloadPolicyDocument(policy.id, type)
      const url = URL.createObjectURL(blob)
      // a new tab shows the PDF natively on every mobile browser; the object
      // URL is revoked once the tab has had time to load it
      window.open(url, "_blank", "noopener")
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error(apiErrorMessage(e, t("greenCard.documentFailed")))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-3 rounded-2xl bg-white/70 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        {policy.status === "failed" ? (
          <ShieldAlert className="size-5 shrink-0 text-pink" />
        ) : (
          <ShieldCheck className="size-5 shrink-0 text-mint-deep" />
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-extrabold text-navy">{productTitle(t, policy.product)}</span>
            <Badge className={cn("rounded-md px-1.5 py-0 text-[11px] font-extrabold", STATUS_CLASS[policy.status])}>
              {pending && <Loader2 className="mr-1 size-3 animate-spin" />}
              {t(STATUS_KEYS[policy.status])}
            </Badge>
          </span>
          <span className="block truncate text-xs font-semibold text-navy-soft">
            {[
              greenCard?.vehicle.plate,
              greenCard ? durationLabel(t, greenCard.duration) : null,
              policy.valid_from && policy.valid_to
                ? `${formatDate(policy.valid_from)} — ${formatDate(policy.valid_to)}`
                : null,
              policy.insurer,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-[14px] font-extrabold whitespace-nowrap text-navy">
          {formatPrice(policy.price_eur, "EUR")}
        </span>
      </div>

      {pending && (
        <p className="mt-1.5 text-xs font-semibold text-navy-soft">{t("greenCard.pendingNote")}</p>
      )}

      {policy.status === "failed" && policy.failure && (
        <p className="mt-1.5 text-xs font-semibold text-pink">
          {policy.failure.retrying ? t("greenCard.failedRetrying") : t("greenCard.failedFinal")}
          {policy.failure.message && !policy.failure.retrying && (
            <span className="block font-normal text-navy-soft">{policy.failure.message}</span>
          )}
        </p>
      )}

      {policy.status === "issued" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {policy.documents.map((doc) => (
            <Button
              key={doc.type}
              variant="outline"
              size="pill"
              disabled={busy !== null}
              onClick={() => openDocument(doc.type)}
              className="h-8 gap-1.5 border-2 border-navy/15 bg-white text-xs font-extrabold text-navy uppercase"
            >
              {busy === doc.type ? <Spinner className="size-3.5" /> : <FileText className="size-3.5" />}
              {t(doc.type === "form" ? "greenCard.documentForm" : "greenCard.documentCertificate")}
            </Button>
          ))}
          {policy.documents.length === 0 && (
            <span className="text-xs font-semibold text-navy-soft">{t("greenCard.documentsSoon")}</span>
          )}
          {policy.verification_url && (
            <a
              href={policy.verification_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-mint/60 bg-white px-3 text-xs font-extrabold text-mint-deep uppercase"
            >
              <ExternalLink className="size-3.5" />
              {t("greenCard.verify")}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
