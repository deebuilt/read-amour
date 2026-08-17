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
 * Claim the current version as seen, reporting whether it was already claimed.
 *
 * One call rather than a read and a separate write, because the two must not
 * drift: every path that decides to *show* the note must also be the path that
 * records it, or a reader gets the same note on every launch.
 *
 * Returns `true` only when this is genuinely new information for this reader.
 */
export function claimVersionAsSeen(version: string): boolean {
  const previous = readLastSeenVersion()
  if (previous === version) return false

  writeLastSeenVersion(version)
  return previous !== undefined
}
