import { cleanIsbn, cleanTitle, parseDate, parseRating } from './shared'
import type { Book } from '../types/domain'

/**
 * Goodreads CSV import.
 *
 * Goodreads killed its public API in December 2020 and issues no new keys, so
 * the CSV export (My Books → Import/Export) is the only way in. The file is
 * well-formed but has one trap: ISBN columns are written as Excel formulas —
 * `="0743271327"` — to stop spreadsheets eating the leading zeros. Parsed
 * naively that string reaches Open Library verbatim and matches nothing.
 *
 * The cleaning and grouping live in `shared.ts` because StoryGraph needs the
 * identical rules; this file is the Goodreads column names and nothing else.
 */

/** Columns this importer reads. Goodreads exports ~24; the rest are ignored. */
export interface GoodreadsRow {
  'Book Id'?: string
  Title?: string
  Author?: string
  ISBN?: string
  ISBN13?: string
  'My Rating'?: string
  'Date Read'?: string
  'Date Added'?: string
  'Exclusive Shelf'?: string
  'Read Count'?: string
}

/**
 * Whether a row is a finished book.
 *
 * Only the `read` shelf. `to-read` and `currently-reading` are not finished
 * books and do not belong in a reading history.
 */
export function isGoodreadsRead(row: GoodreadsRow): boolean {
  return row['Exclusive Shelf']?.trim() === 'read'
}

export function goodreadsRowToBook(row: GoodreadsRow, index: number): Book | undefined {
  const title = row.Title?.trim()
  if (!title) return undefined

  return {
    id: `gr-${row['Book Id']?.trim() || index}`,
    title: cleanTitle(title),
    author: row.Author?.trim() ?? 'Unknown',
    isbn13: cleanIsbn(row.ISBN13),
    isbn10: cleanIsbn(row.ISBN),
    dateRead: parseDate(row['Date Read']),
    rating: parseRating(row['My Rating']),
    source: 'goodreads',
    // Stored, but not yet adopted. Every row in the file is written the moment
    // it parses — before the group list renders — and only the groups the
    // reader actually taps become posters. The flag is what keeps the rest out
    // of the stats and the suggestions until then, and placement clears it.
    imported: true,
  }
}

export { formatMonth, groupByMonth, monthName, type ImportResult } from './shared'
