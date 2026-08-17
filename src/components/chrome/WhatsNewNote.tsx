import { useEffect, useState } from 'react'
import { Button, Typography } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { APP_VERSION, currentRelease } from '../../design/releases'
import { claimVersionAsSeen } from '../../storage/lastSeenVersion'
import styles from './WhatsNewNote.module.css'

/**
 * Tell the reader what arrived, after it has already arrived.
 *
 * ## Why this reports rather than asks
 *
 * This component used to announce a *waiting* build and offer a Reload button.
 * That design had a flaw it could not be fixed out of: **release notes ship
 * inside the bundle**, so a running build holds its own notes and never the
 * incoming one's. The headline named the version the reader already had — every
 * time, structurally. Ruthnie watched 0.4.0 deploy and the banner announce
 * 0.3.0.
 *
 * The instinct was to fetch the incoming notes over the network. The better
 * answer was hers: stop speaking first. If the update simply lands, and the
 * banner reports afterwards, then the app *is* the new build when it speaks —
 * it holds its own notes and can describe them exactly. No fetch, no manifest,
 * no guessing. The hard problem was manufactured by the ordering.
 *
 * It is also what people expect. Apps update themselves and tell you what
 * changed the next time you open them; they do not ask permission to become
 * their next version.
 *
 * So: `registerType` is `autoUpdate` in `vite.config.ts`, and this component
 * has no Reload button. The two are a pair, exactly as the old prompt-plus-
 * button pair was — flipping one without the other gives either a silent update
 * nobody hears about, or a banner announcing something that has not happened.
 *
 * ## What decides that there is news
 *
 * Not the service worker. `APP_VERSION` is baked into the bundle, so the running
 * code knows its own version with certainty, and `lastSeenVersion` records what
 * the reader was last told. A difference between those two is the whole
 * condition — which means this works no matter *how* the new build arrived: a
 * worker update, a hard refresh, a cleared cache, or a browser that fetched it
 * fresh. Nothing about it depends on service-worker events firing correctly,
 * which is precisely the machinery that failed before.
 *
 * A reader arriving for the first time has no previous version and gets no note.
 * "Here's what changed" makes no sense to someone with nothing to compare it to.
 *
 * ## The one cost of updating silently
 *
 * `autoUpdate` can activate a new worker while the app is open, and the page
 * reloads under whoever is using it. Posters save continuously so nothing is
 * lost, but a screen that reloads mid-sentence is its own kind of broken.
 *
 * So the reload is deferred to a moment when the reader is demonstrably not
 * working: the app being backgrounded. `onNeedRefresh` fires when a new build is
 * ready, and the reload waits for the next `visibilitychange` into hidden. A
 * reader who never backgrounds the app gets it on their next cold start, which
 * is what would have happened anyway.
 */

export function WhatsNewNote() {
  /**
   * A new build is ready but has not been taken yet.
   *
   * Under `autoUpdate` the plugin activates the worker itself and calls
   * `onNeedRefresh` — the page is then running old code against a new worker
   * until something reloads it. That reload is ours to time.
   */
  const [updatePending, setUpdatePending] = useState(false)

  useRegisterSW({
    onNeedRefresh() {
      setUpdatePending(true)
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return

      /*
       * Check on every return to the foreground.
       *
       * A service worker checks for a new version on page load, and an installed
       * PWA resumed from the home screen frequently resumes the existing page
       * rather than loading it — so there is no load and no check, and updates
       * arrive several reopens late. `visibilitychange` rather than an interval:
       * a timer fires while the app is backgrounded and nobody is there to
       * benefit, whereas this fires at the one moment the answer matters.
       */
      const check = () => {
        if (document.visibilityState === 'visible') void registration.update()
      }

      document.addEventListener('visibilitychange', check)
      check()
    },
  })

  /**
   * Take the update the moment the app stops being looked at.
   *
   * The whole point of deferring: a reload while the reader is placing covers is
   * hostile, and a reload after they have switched away is invisible. By the
   * time they return, the app is simply the new version — and the note below
   * tells them so.
   */
  useEffect(() => {
    if (!updatePending) return

    const reloadWhenHidden = () => {
      if (document.visibilityState === 'hidden') window.location.reload()
    }

    document.addEventListener('visibilitychange', reloadWhenHidden)
    return () => document.removeEventListener('visibilitychange', reloadWhenHidden)
  }, [updatePending])

  /**
   * Whether this launch is the first on a version the reader has not been told
   * about — resolved once, on mount, because it is a fact about arriving here
   * rather than a piece of changing state.
   *
   * `claimVersionAsSeen` both answers and records, in one call, so the decision
   * to show the note and the record of having shown it cannot come apart.
   */
  const [isNews] = useState(() => claimVersionAsSeen(APP_VERSION))
  const [isOpen, setIsOpen] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  if (!isNews || isDismissed) return null

  /*
   * The running build's own notes, which is now simply correct: this code and
   * these notes shipped together, so `currentRelease()` describes exactly the
   * app the reader is looking at.
   *
   * A build with no entry — internal work, a dependency bump — shows nothing at
   * all. That is the honest outcome and the reason the rule in `releases.ts`
   * says to skip such releases rather than padding them: an update the reader
   * cannot see is not news, and a banner claiming otherwise trains people to
   * stop reading these.
   */
  const release = currentRelease()
  if (release === undefined || release.changes.length === 0) return null

  return (
    /*
     * A bar above the action bar, in the shell's flex flow rather than floating
     * over it. Overlaying would put it on top of the poster, which is the one
     * thing on screen worth protecting.
     *
     * `role="status"`: worth announcing once to a screen reader, not worth
     * seizing focus over.
     */
    <div className={styles.banner} role="status">
      <div className={styles.row}>
        {/* Tapping expands rather than navigates — the reader wants to know what
            changed, not to leave the poster they were working on. */}
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

        <div className={styles.actions}>
          {/* Dismissing is final for this version — the note has been read, and
              `claimVersionAsSeen` already recorded it on mount, so it will not
              return on the next launch. The notes stay in What's New. */}
          <Button size="small" type="text" onClick={() => setIsDismissed(true)}>
            Got it
          </Button>
        </div>
      </div>

      {isOpen && (
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
