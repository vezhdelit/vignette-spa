import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { readFileSync } from "node:fs"

// X-App-Version / X-App-Build on every API call (src/lib/api.ts): the
// version is package.json's, the build the build's date and time in UTC
// ("20261124.1530": dotted numbers, as the API parses builds, and always
// rising). An explicit VITE_APP_BUILD wins (CI).
const pkg = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8")
) as { version: string }
const stamp = new Date().toISOString()
process.env.VITE_APP_VERSION = pkg.version
process.env.VITE_APP_BUILD ||= `${stamp.slice(0, 10).replace(/-/g, "")}.${stamp
  .slice(11, 16)
  .replace(":", "")}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3300,
    proxy: {
      // Avoid CORS during local dev: /api/* -> vignette.id backend
      // (only used when VITE_VIGNETTE_API_BASE is unset, i.e. base "/api")
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "https://vignette.id",
        changeOrigin: true,
      },
    },
  },
})
