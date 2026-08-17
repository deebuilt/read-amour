/**
 * The last app version the reader was shown notes for.
 *
 * localStorage rather than IndexedDB, for the same reason the theme preference
 * lives there: it is one short string, it is needed synchronously on first
 * paint, and it is not library data. Losing it costs a reader one redundant
 * "what's new" note, which is the cheapest possible failure.
 *
 * It is deliberately NOT "the version that is running" — that is
 * `APP_VERSION`, and the app knows it without asking. This records what the
 * reader has actually been *told about*, which is the only thing that can
 * decide whether there is news to deliver.
 */

const STORAGE_KEY = 'read-amour:last-seen-version'

/**
 * What the reader last saw, or `undefined` for someone arriving fresh.
 *
 * Wrapped because storage access throws rather than returning null in a few
 * real situations — Safari's private mode historically, and any browser with
 * site data blocked. A reader with storage disabled should get an app that
 * works and no update notes, not a blank screen.
 */
export function readLastSeenVersion(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function writeLastSeenVersion(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // A reader who cannot persist this sees the note once per launch rather
    // than once per update. Mildly annoying, not worth failing over.
  }
}

/**
 * Whether this version is news for this reader — asked without recording it.
 *
 * **Asking and recording must stay separate**, and merging them was a real bug.
 * The first version of this file did both in one `claimVersionAsSeen()` call,
 * which the component ran on mount. The update arrives by reloading the page, so
 * the new build mounted, claimed its own version as seen, and marked the news
 * read before a single pixel of it was rendered. Ruthnie saw the app flicker and
 * nothing else; the notes were sitting in What's New, already considered
 * delivered.
 *
 * So: this answers the question, and `markVersionSeen()` is called only once the
 * reader has actually been shown something and dismissed it. A reader who closes
 * the app without dismissing sees the note again next time, which is the correct
 * failure direction — the point is that they find out.
 *
 * A reader with no stored version is new here and gets nothing: "what changed"
 * needs a before.
 */
export function isVersionNews(version: string): boolean {
  const previous = readLastSeenVersion()
  return previous !== undefined && previous !== version
}

/**
 * Record that the reader has been told about this version.
 *
 * Called on dismissal, not on mount. See `isVersionNews` for why that
 * distinction is load-bearing.
 */
export function markVersionSeen(version: string): void {
  writeLastSeenVersion(version)
}

/**
 * Record the running version *without* it counting as news — for a reader
 * arriving for the first time.
 *
 * Without this, someone's first launch stores nothing, and the next update finds
 * no previous version and stays silent too. They would have to receive two
 * updates before the feature ever spoke to them. This lays down the baseline on
 * first run so the very next update is news.
 */
export function seedVersionIfNew(version: string): void {
  if (readLastSeenVersion() === undefined) writeLastSeenVersion(version)
}
