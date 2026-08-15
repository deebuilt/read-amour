import { Button, Typography } from 'antd'
import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './UpdateBanner.module.css'

/**
 * Tell the reader when a new build is waiting, and take it on one tap.
 *
 * The app is a PWA, so a new version is fetched in the background and then sits
 * there. Under the old `autoUpdate` registration it activated silently on some
 * later load, which is why pulling to refresh worked only sometimes — it
 * depended on whether the worker had happened to finish, and there was no way
 * to tell from the outside. Installed to a home screen there is not even an
 * address bar, so the gesture was the only lever available and it was a guess.
 *
 * `registerType` is now `prompt` in `vite.config.ts`, which is what makes this
 * component honest: the waiting worker really is waiting, and the button really
 * does activate it. The two settings are a pair — under `autoUpdate` this banner
 * would be announcing something that had already happened.
 *
 * None of this can be exercised on the dev server. Service workers only behave
 * realistically against a built, served app: `npm run build` then `npm run
 * preview`, or the deployed Pages site.
 */

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    /*
     * A bar above the action bar, not a modal. A new version is not worth
     * interrupting for, and the poster is the whole screen — anything covering
     * it is covering the thing the app is for.
     *
     * `role="status"` rather than an alert: this is worth announcing to a screen
     * reader once, not worth seizing focus over.
     */
    <div className={styles.banner} role="status">
      <Typography.Text className={styles.text}>A new version is ready.</Typography.Text>
      <div className={styles.actions}>
        {/* Dismissing only hides the bar. The worker stays waiting and takes
            over on the next natural reload, so "Later" is a real choice rather
            than a way to get stuck on an old build. */}
        <Button size="small" type="text" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
        <Button size="small" type="primary" onClick={() => void updateServiceWorker(true)}>
          Reload
        </Button>
      </div>
    </div>
  )
}
