import type { Book } from '../types/domain'

/**
 * What counts as part of the reader's library.
 *
 * There is one `books` store and everything writes to it, so a row parsed out
 * of a CSV sits beside a book the reader searched for and chose. `imported`
 * separates them: it is set on every row at the file drop and cleared the
 * moment a book is placed on a poster.
 *
 * A book is adopted unless it is explicitly still sitting in import residue.
 * The test is written against `=== true` rather than as a truthiness check so
 * that `undefined` reads as adopted — every book stored before the field
 * existed is either genuinely chosen or has already been decided by
 * `backfillImportedFlag`, and a book added by search or by hand never carries
 * the flag at all.
 *
 * Kept here, in one place, because `useStats` and `useSuggestions` both filter
 * on it and a dashboard that disagreed with the suggestion engine about which
 * books are yours would be worse than either being wrong alone.
 */
export function isAdopted(book: Book): boolean {
  return book.imported !== true
}
