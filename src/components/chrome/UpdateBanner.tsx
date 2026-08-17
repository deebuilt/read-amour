import { useEffect } from 'react'
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
 *
 * ## Why Reload does the reloading itself
 *
 * `updateServiceWorker(true)` does **not** reload the page, despite the
 * argument. Read the plugin's own `registerSW`: the parameter is named
 * `_reloadPage` and never used. All the call does is post `SKIP_WAITING` to the
 * waiting worker. The actual reload comes from a `controlling` listener that the
 * plugin attaches **only inside its `waiting` handler** — so the reload works if
 * and only if the banner was raised by a `waiting` event fired while this page
 * was open.
 *
 * That is not how this app finds its updates. `onRegisteredSW` calls
 * `registration.update()` every time the app comes to the foreground, and an
 * installed PWA resumed from the home screen commonly has a worker that has been
 * **waiting since a previous session**. Workbox does not re-fire `waiting` for a
 * worker that was already waiting when it registered, so that listener is never
 * attached — the message goes out, the new worker activates, and nothing
 * navigates. The banner stays on screen too, because its state was never told
 * anything happened.
 *
 * Ruthnie hit exactly this on the first real update: 0.4.0 deployed and served
 * correctly, Reload did nothing however many times it was tapped, and the app
 * kept running 0.3.0 — which is also why the banner showed 0.3.0's headline (see
 * the note further down: the running build can only read its own notes).
 *
 * So the reload is owned here rather than inferred from the plugin's internals:
 * listen for `controllerchange` — the one event that means "a different worker
 * is now in charge of this page" — and reload on it, whichever path raised the
 * banner. `location.reload()` re-requests the document, and the fresh worker
 * serves the new precached shell.
 *
 * ## Why an ignored banner does not strand the reader forever
 *
 * A fair question, and the answer used to be "it does." Under `prompt` the new
 * worker waits indefinitely, and if the only way to activate it is a button that
 * does not work, a reader who never taps it never updates — which is precisely
 * what happened.
 *
 * With the reload fixed there are now three independent paths off an old build,
 * and only one of them needs a decision:
 *
 *   1. Tapping Reload.
 *   2. Every browser tab or PWA window of the app being closed, which lets the
 *      waiting worker activate on the next launch. This is the ordinary path for
 *      a phone, and it is why "Later" is a real choice rather than a trap.
 *   3. Another tab taking the update, which fires `controllerchange` here.
 *
 * `autoUpdate` would collapse all of that into "it just happens", and was
 * deliberately not chosen: it reloads the page underneath someone who may be
 * mid-edit on a poster. The posters save continuously, so nothing would be lost
 * — but a screen that reloads itself unbidden while you are working is its own
 * kind of broken. The prompt keeps the choice with the reader; the bug was that
 * the choice did not work.
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

  /**
   * Reload when a new worker takes control, no matter how the banner was raised.
   *
   * `controllerchange` fires once the waiting worker has activated and claimed
   * the page. Guarded against firing twice: the spec allows it, and a second
   * `reload()` mid-navigation is a wasted request at best.
   *
   * Registered unconditionally rather than inside the click handler, because the
   * worker can also be activated from another tab of the same app — in which
   * case this page is running stale code and should follow.
   */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  /**
   * Take the waiting build.
   *
   * Two steps, because either one alone has a hole. `updateServiceWorker` posts
   * the skip-waiting message, and the `controllerchange` listener above reloads
   * once the new worker claims the page — that is the normal path.
   *
   * The fallback exists for the case where there is nothing to claim: a worker
   * that already activated (because a previous tap sent the message, or another
   * tab took the update) leaves this page running stale code with no further
   * event coming. `controllerchange` has already fired and been missed, so
   * waiting on it is waiting forever. After a short grace period, reload
   * regardless — the request goes to the active worker, which serves the new
   * shell.
   *
   * 1.5s is long enough for a local skip-waiting round trip and short enough
   * that a reader who tapped a button does not sit looking at an unchanged
   * screen wondering whether it registered.
   */
  const handleReload = async () => {
    window.setTimeout(() => window.location.reload(), 1_500)
    await updateServiceWorker(true)
  }

  if (!needRefresh) return null

  /*
   * The banner cannot name what is in the update, and says so.
   *
   * This code is the build currently RUNNING; the notes worth reading belong to
   * the build WAITING. A bundled `RELEASES` array can only ever contain the
   * former, so `currentRelease()` here returns the notes for the version the
   * reader already has.
   *
   * That used to be shown as the headline, with a comment claiming it was wrong
   * "for exactly one release: the one that introduced this component." The
   * comment was wrong. It is wrong for **every** release, because the running
   * build is always the old one — so the banner permanently advertised the
   * version you were already on. Ruthnie, on the first real update: 0.4.0
   * deployed, and the banner announced 0.3.0's headline.
   *
   * Fetching the incoming build's notes would mean a network request in an
   * offline-first app, and it would have to be re-fetched past the very cache
   * this update is replacing. Not worth it to fill in one line.
   *
   * So the banner promises nothing about contents. It says a new version is
   * ready, and the notes are one tap away in What's New once it lands — which is
   * the honest version of what this component can know.
   */

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
        <Typography.Text className={styles.text}>A new version is ready.</Typography.Text>

        <div className={styles.actions}>
          {/* Dismissing only hides the bar. The worker stays waiting and takes
              over on the next natural reload, so "Later" is a real choice rather
              than a way to get stuck on an old build. */}
          <Button size="small" type="text" onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
          <Button size="small" type="primary" onClick={() => void handleReload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  )
}
