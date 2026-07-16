import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // In production builds, strip the dev-only CSP tokens that Vite HMR requires:
    //   'unsafe-eval'  — needed by Vite's module runner, not by the built bundle
    //   ws:// origins  — Vite HMR WebSocket; the packaged app has no HMR
    mode === 'production' && {
      name: 'production-csp',
      transformIndexHtml(html) {
        return html
          .replace(" 'unsafe-eval'", '')
          .replace(' ws://127.0.0.1:5174 ws://localhost:5174', '')
      },
    },
  ].filter(Boolean),
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}))
