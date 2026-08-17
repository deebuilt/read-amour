import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

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

/*
 * The version the running app reports, read from package.json at build time.
 *
 * Read here rather than imported, because importing package.json into the
 * bundle would pull the whole file — dependency list included — into the
 * shipped JavaScript. This takes the one field and bakes it in as a literal.
 *
 * It has to be baked rather than fetched. The service worker caches the app
 * shell, so anything fetched at runtime is subject to that cache and could
 * report a version other than the one actually running — which is precisely the
 * question this exists to answer. In the bundle it cannot disagree with the code
 * it ships beside.
 */
const APP_VERSION = JSON.parse(readFileSync('./package.json', 'utf-8')).version as string

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
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
       * `autoUpdate`, not `prompt` — updates land on their own.
       *
       * This was `prompt` until 2026-08-17, paired with a banner that announced
       * a waiting build and offered a Reload button. Two things were wrong with
       * that, and only the second was obvious:
       *
       * 1. The button was broken for months. `updateServiceWorker(true)` does
       *    not reload the page, so the banner sat there doing nothing.
       *
       * 2. More importantly, **the banner could never say what was in the
       *    update.** Release notes ship inside the bundle, so a running build
       *    holds its own notes and not the incoming one's. The headline named
       *    the version the reader already had — structurally, not by accident.
       *
       * The fix for (2) is not to fetch the incoming notes. It is to stop
       * announcing an update before taking it. Under `autoUpdate` the new worker
       * activates by itself, and `UpdateBanner` reports afterwards — at which
       * point the app IS the new build, holds its own notes, and can say what
       * changed with no guessing. The awkward part of the old design was created
       * entirely by insisting on speaking first.
       *
       * This is also what readers expect. Ruthnie: *"with most apps, the updates
       * just there... the app just silently reloads, and then a banner pops up
       * after the reload to say, hey, since you've been gone, this is what's
       * there."*
       *
       * `UpdateBanner` handles the one real cost — a reload arriving mid-edit —
       * by deferring activation until the app is not being used. See its notes.
       */
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
