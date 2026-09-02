import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

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
