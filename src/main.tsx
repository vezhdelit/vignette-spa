import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { initI18n } from "@/i18n"

// Resolve the language and load its dictionary BEFORE the first paint, so the
// app never renders in English and then flips. A failure inside initI18n
// resolves to English on its own, so this never blocks the app from starting.
await initI18n()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
