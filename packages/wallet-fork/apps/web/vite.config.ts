import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// Leashed Wallet — mounted at /wallet/ inside the platform Pages origin
// (leashed-agent-platform.pages.dev). The base path rewrites all asset URLs
// and matches the SPA fallback Pages applies to /wallet/* paths.
const BASE_PATH = "/wallet/";

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), cloudflare()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
    // Same-origin /api in dev too — matches the Workers production layout
    // (wrangler dev from apps/api serves the API on :8787 with the /api
    // prefix intact; no rewrite).
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})