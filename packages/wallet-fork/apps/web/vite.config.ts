import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// Port 5174: 3000 is squatted by OrbStack on this machine and 5173 by another
// local app — pin the dev server where the API's CORS_ORIGIN expects it.
export default defineConfig({
  plugins: [react(), cloudflare()],
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
      '/line-callback': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})