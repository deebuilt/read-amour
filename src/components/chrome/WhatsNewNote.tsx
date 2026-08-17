import { useEffect, useState } from 'react'
import { Button, Modal, Typography } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { APP_VERSION, currentRelease } from '../../design/releases'
import {
  isVersionNews,
  markVersionSeen,
  seedVersionIfNew,
} from '../../storage/lastSeenVersion'
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
 *
 * ## Bar or modal — `PRESENTATION`, and why it is a switch rather than a choice
 *
 * The note began as a bar above the bottom nav, in the slot the old Reload
 * button had used. It never once appeared, because of the mount-time bug
 * described on `isVersionNews` — so when the placement was questioned, **nobody
 * had actually seen it**. Ruthnie: *"It's one thing if the bar actually worked.
 * It's not like I wanna take up so much space, but I just didn't know what it
 * looked like to even know if I like the design."*
 *
 * Swapping a design nobody has evaluated for another one nobody has evaluated is
 * guessing twice. Both are built, the constant below picks one, and the decision
 * waits until there is something to look at. They are genuinely different
 * trade-offs rather than a cosmetic pair:
 *
 *   'bar'   — quiet, never covers the poster, easy to miss at the screen edge.
 *   'modal' — impossible to miss, costs an interruption and a dismissal.
 *
 * Whichever loses should be deleted along with its styles once the call is made.
 * Keeping both indefinitely is how a component grows a mode nobody chose.
 */

/** Which presentation the note uses. See the note above before changing it. */
const PRESENTATION: 'bar' | 'modal' = 'modal'

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
   * Whether this version is news, decided once on mount.
   *
   * Asking only — the recording happens on dismissal. Doing both here is what
   * broke the first version: the update arrives *by reloading the page*, so the
   * new build mounted, marked its own version as seen, and consumed the news
   * before rendering it. The app flickered and said nothing.
   */
  const [isNews, setIsNews] = useState(() => isVersionNews(APP_VERSION))

  /** Bar only — the modal shows its changes open, so it has nothing to toggle. */
  const [isBarOpen, setIsBarOpen] = useState(false)

  /**
   * Lay down a baseline for a first-time reader.
   *
   * Someone with nothing stored is not shown a note — there is no "before" to
   * describe a change against — but their version has to be recorded anyway, or
   * the *next* update also finds no previous version and stays silent too.
   */
  useEffect(() => {
    seedVersionIfNew(APP_VERSION)
  }, [])

  const release = currentRelease()

  /*
   * The running build's own notes, which is now simply correct: this code and
   * these notes shipped together, so `currentRelease()` describes exactly the
   * app the reader is looking at.
   *
   * A build with no entry — internal work, a dependency bump — shows nothing at
   * all, and still records itself as seen through the dismissal path never
   * running. That is handled by the effect below rather than by silently
   * claiming it here.
   */
  const hasNotes = release !== undefined && release.changes.length > 0

  /*
   * A version with nothing to say is still a version the reader has now got, so
   * mark it seen without showing anything. Otherwise the note would appear on
   * the *following* update carrying the wrong build's notes.
   */
  useEffect(() => {
    if (isNews && !hasNotes) {
      markVersionSeen(APP_VERSION)
      setIsNews(false)
    }
  }, [isNews, hasNotes])

  const dismiss = () => {
    markVersionSeen(APP_VERSION)
    setIsNews(false)
  }

  if (!isNews || !hasNotes) return null

  if (PRESENTATION === 'bar') {
    return (
      /*
       * A bar above the action bar, in the shell's flex flow rather than
       * floating over it — so it pushes the layout by its own height instead of
       * covering the poster.
       *
       * `role="status"`: worth announcing once to a screen reader, not worth
       * seizing focus over. The modal below is the opposite trade on purpose.
       */
      <div className={styles.bar} role="status">
        <div className={styles.barRow}>
          <button
            type="button"
            className={styles.barSummary}
            onClick={() => setIsBarOpen((open) => !open)}
            aria-expanded={isBarOpen}
          >
            <Typography.Text className={styles.barText}>{release.headline}</Typography.Text>
            <RightOutlined
              className={isBarOpen ? `${styles.caret} ${styles.caretOpen}` : styles.caret}
              aria-hidden
            />
          </button>

          <Button size="small" type="text" onClick={dismiss}>
            Got it
          </Button>
        </div>

        {isBarOpen && (
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

  return (
    /*
     * A modal in the middle of the screen, not a bar above the nav.
     *
     * It was a bar first, sitting where the old Reload button had been, and it
     * was missable by design — a thin strip at the bottom edge of a screen whose
     * whole subject is the poster above it. Ruthnie updated, saw the app flicker,
     * and found the notes only by opening More → What's new by hand.
     *
     * An update is a once-per-release event that the reader cannot act on
     * elsewhere, so it earns the interruption. Dismissing is one tap and it never
     * returns for that version.
     */
    <Modal
      open
      onCancel={dismiss}
      footer={null}
      centered
      width={340}
      title="What's new"
      // The mask closes it too, and that counts as reading it — anywhere the
      // reader taps to make this go away should mean the same thing.
      maskClosable
      styles={{ wrapper: { overflow: 'hidden' } }}
    >
      <div className={styles.body}>
        <Typography.Text className={styles.headline}>{release.headline}</Typography.Text>

        {/* Open, not behind a caret. The bar hid these because it had one line
            of room; a modal has the space, and a reader who is being interrupted
            should get the answer rather than another thing to tap. */}
        <ul className={styles.changes}>
          {release.changes.map((change) => (
            <li key={change} className={styles.change}>
              {change}
            </li>
          ))}
        </ul>

        <Button type="primary" block onClick={dismiss}>
          Got it
        </Button>
      </div>
    </Modal>
  )
}
