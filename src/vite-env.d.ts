/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * The app's version, baked in from `package.json` by Vite's `define`.
 *
 * Declared here so it is a real type rather than something reached for through
 * a cast. It is a build-time literal, not a runtime global — nothing sets it on
 * `window`, and reading it in a context Vite does not transform (a test runner,
 * say) will throw rather than return undefined.
 */
declare const __APP_VERSION__: string
