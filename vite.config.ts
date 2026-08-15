import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/*
 * Served from the root of its own domain — readamour.com.
 *
 * This was `/read-amour/` while the app lived at a route under
 * deebuilt.github.io, where the built asset URLs had to carry the repo name.
 * On an apex domain the app IS the site, so the prefix would send every asset
 * to readamour.com/read-amour/… and the page would come up blank.
 *
 * One constant, because it is not only the asset prefix: the PWA `start_url`,
 * `scope`, and all three icon paths are built from it below. Moving the app
 * again means changing this line and nothing else.
 */
const BASE = '/'

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
      /*
       * `prompt`, not `autoUpdate`.
       *
       * Under autoUpdate the worker skips waiting on its own and a new build
       * activates on some later load with nothing said. That is why pulling to
       * refresh worked only sometimes: it depended on whether the worker had
       * happened to finish, and installed to a home screen there is no address
       * bar either, so the gesture was the only lever and it was a guess.
       *
       * With `prompt` the new worker waits, `useRegisterSW` reports it, and
       * `UpdateBanner` offers the reload. A banner under autoUpdate would be
       * announcing something that had already happened.
       */
      registerType: 'prompt',
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
