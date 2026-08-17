import { useEffect, useState } from 'react'
import { Button, Typography } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { currentRelease } from '../../design/releases'
import styles from './UpdateBanner.module.css'

/**
 * Tell the reader when a new build is waiting, say what is in it, and take it on
 * one tap.
 *
 * The app is a PWA, so a new version is fetched in the background and then sits
 * there. Under the old `autoUpdate` registration it activated silently on some
 * later load, which is why pulling to refresh worked only sometimes — it
 * depended on whether the worker had happened to finish, and there was no way
 * to tell from the outside. Installed to a home screen there is not even an
 * address bar, so the gesture was the only lever available and it was a guess.
 *
 * `registerType` is `prompt` in `vite.config.ts`, which is what makes this
 * component honest: the waiting worker really is waiting, and the button really
 * does activate it. The two settings are a pair — under `autoUpdate` this banner
 * would be announcing something that had already happened.
 *
 * ## Why the update used to arrive three reopens late
 *
 * A service worker checks for a new version **on page load**. An installed PWA
 * reopened from the home screen frequently resumes the existing page rather than
 * loading it fresh — so there is no load, and therefore no check. The reader
 * ends up waiting for a cold start to coincide with a reopen, which takes a few
 * tries and looks exactly like the update being slow.
 *
 * `onRegisteredSW` below fixes that by checking whenever the app returns to the
 * foreground. `visibilitychange` rather than an interval, deliberately: a timer
 * fires while the app is backgrounded and the reader is not there to see the
 * result, whereas this fires at the one moment the answer matters. It is a
 * single request against a small manifest.
 *
 * None of this can be exercised on the dev server. Service workers only behave
 * realistically against a built, served app: `npm run build` then `npm run
 * preview`, or the deployed Pages site.
 */

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return

      const check = () => {
        if (document.visibilityState === 'visible') void registration.update()
      }

      document.addEventListener('visibilitychange', check)
      // Also once now: the app may have been opened cold, in which case this is
      // the moment it became visible and no event will fire for it.
      check()
    },
  })

  /** Whether the reader has expanded the banner to read the full notes. */
  const [isOpen, setIsOpen] = useState(false)

  // Collapse whenever the banner goes away, so a later update does not appear
  // pre-expanded because of a choice made about a previous one.
  useEffect(() => {
    if (!needRefresh) setIsOpen(false)
  }, [needRefresh])

  if (!needRefresh) return null

  /*
   * The notes describe the build that is WAITING, and this code is the build
   * currently RUNNING — so strictly it cannot read them. It shows the running
   * build's notes, which is wrong for exactly one release: the one that
   * introduced this component. From the next update onward the waiting build's
   * notes are what the reader sees after reloading, in About.
   *
   * The honest fix would be fetching the incoming build's manifest, which is a
   * network request in an offline-first app to save one line of copy. Not worth
   * it. The banner leads with the reload either way, and the notes are
   * permanently available once the update lands.
   */
  const release = currentRelease()
  const hasNotes = release !== undefined && release.changes.length > 0

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
      <div className={styles.row}>
        {/*
          Tapping expands rather than navigates. The reader asked what changed —
          not to leave the poster they were working on.
        */}
        {hasNotes ? (
          <button
            type="button"
            className={styles.summary}
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
          >
            <Typography.Text className={styles.text}>{release.headline}</Typography.Text>
            <RightOutlined
              className={isOpen ? `${styles.caret} ${styles.caretOpen}` : styles.caret}
              aria-hidden
            />
          </button>
        ) : (
          /* No notes for this build, which is the honest fallback for a release
             of internal work rather than a padded list. */
          <Typography.Text className={styles.text}>A new version is ready.</Typography.Text>
        )}

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

      {isOpen && hasNotes && (
        <ul className={styles.changes}>
          {release.changes.map((change) => (
            <li key={change} className={styles.change}>
              {change}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
