import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { initI18n } from "@/i18n"
import { startPushCatalog } from "@/lib/push-catalog"

// Resolve the language and load its dictionary BEFORE the first paint, so the
// app never renders in English and then flips. A failure inside initI18n
// resolves to English on its own, so this never blocks the app from starting.
await initI18n()

// The push-copy catalog for that language (inbox rows + the service worker's
// banners) — refreshed in the background and on every language switch, never
// awaited: a push arriving before it lands simply shows its English.
startPushCatalog()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
