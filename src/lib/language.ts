/**
 * Kept as the one import path for "what language do we ask the API for", now
 * that the app itself is translated: it is the active UI language
 * (`src/i18n`), never the browser's `Accept-Language`, so the copy the server
 * writes for the plate form arrives in the same language as the field above
 * it. Re-exported rather than inlined so a call site reads as intent.
 */
export { apiLanguage } from "@/i18n"
