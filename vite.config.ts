import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from a route under a shared GitHub Pages subdomain, so the built
// asset URLs must be prefixed with the repo name. Dev runs from root.
const BASE = process.env.NODE_ENV === 'production' ? '/read-amour/' : '/'

export default defineConfig({
  base: BASE,
  server: {
    port: 8204,
    strictPort: true,
    // Listen on the LAN, not just localhost, so the dev server can be opened on
    // a phone. This app is mobile-first and several of its layout rules — the
    // `dvh` shell, the bottom bar clearing the home indicator — cannot be
    // exercised in a desktop browser at all, because there is no URL bar to
    // collapse. Vite prints the Network URL on startup once this is set.
    host: true,
  },
  preview: {
    port: 8204,
    strictPort: true,
    host: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Read Amour',
        short_name: 'Read Amour',
        description: 'Build a monthly reading poster from your book covers.',
        theme_color: '#1c1a17',
        background_color: '#f7f3ec',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        // Icon paths carry the base prefix explicitly. A bare filename in a
        // manifest resolves against the manifest's own URL, which happens to
        // work here — but an absolute path is unambiguous, and this app is
        // served from a subdirectory where that distinction bites.
        icons: [
          {
            src: `${BASE}icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${BASE}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: `${BASE}icon-512-maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Book covers are stored as blobs in IndexedDB, so the service worker
        // only needs to cache the app shell itself.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
