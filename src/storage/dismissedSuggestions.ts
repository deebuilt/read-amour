/**
 * Suggestions the reader has said no to.
 *
 * localStorage rather than IndexedDB, for the same reason the theme preference
 * and the last-seen version live there: it is a short list of short strings, it
 * is wanted synchronously before the panel paints, and it is not library data.
 * Losing it costs a reader one unwanted row, which is the cheapest possible
 * failure — and the alternative, a store in the library database, would put a
 * UI preference in the file that gets backed up and restored across devices.
 *
 * The ids stored here are the content-stable kind — `five-stars-2026`, never a
 * hash of the books. See `Suggestion.id` for why that distinction is
 * load-bearing: dismissing an idea must not be undone by reading another book.
 */

const STORAGE_KEY = 'read-amour:dismissed-suggestions'

/**
 * Every dismissed id.
 *
 * Wrapped because storage access throws rather than returning null in real
 * situations — Safari's private mode historically, any browser with site data
 * blocked. A reader in that state gets suggestions that will not stay
 * dismissed, which is better than a panel that will not open.
 */
export function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    // A hand-edited or half-written value must not take the panel down with
    // it — anything that is not a list of strings reads as nothing dismissed.
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export function dismissSuggestion(id: string): Set<string> {
  const next = readDismissed()
  next.add(id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    // The row comes back next time. Not worth failing over.
  }
  return next
}

/** Bring every dismissed suggestion back. */
export function clearDismissed(): Set<string> {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do — the caller gets an empty set either way.
  }
  return new Set()
}
