import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SPA that talks to the slice-2 /agents Hono worker at :8787.
// Override via VITE_API_BASE in `.env.local` when pointing at a deployed worker.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      // Both /api (slice-2/3 authed surface) and /v1 (slice-4 public
      // marketplace discovery) live on the same worker — broaden the
      // proxy instead of splitting so the SPA can hit either prefix
      // with the same `BASE = ""` and rely on Vite to forward.
      "/api": {
        target: process.env.VITE_API_BASE ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/v1": {
        target: process.env.VITE_API_BASE ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});