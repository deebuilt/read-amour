import { cleanIsbn, cleanTitle, parseDate, parseRating } from './shared'
import type { Book } from '../types/domain'

/**
 * StoryGraph CSV import.
 *
 * StoryGraph has no public API and is not going to get one soon — the request
 * has sat on their own roadmap as "Long-term" since March 2021, and the founder
 * described a team of one. The unofficial scrapers are all server-side because
 * a browser hitting thestorygraph.com is blocked by CORS, which is the same
 * wall that killed Google Books. This app has no server. So the CSV is the only
 * door, exactly as it is for Goodreads.
 *
 * Verified against a real export on 2026-08-18, which settled the details that
 * would otherwise have been guesses:
 *
 * - `Last Date Read` is `YYYY/MM/DD`, the same as Goodreads. A different format
 *   here would have produced an import where every book was silently undated.
 * - `Star Rating` is written `4.0`, and permits halves. `parseRating` rounds.
 * - `ISBN/UID` holds bare digits, no `="..."` armour — but also Amazon ASINs
 *   for audio and Kindle rows, which `cleanIsbn` rejects on length.
 * - `Dates Read` can hold a range (`2023/06/30-2023/07/02`), so it is ignored
 *   in favour of `Last Date Read`. A re-read is not a case the app models.
 */

/** Columns this importer reads. StoryGraph exports 23; the rest are ignored. */
export interface StoryGraphRow {
  Title?: string
  Authors?: string
  'ISBN/UID'?: string
  'Read Status'?: string
  'Last Date Read'?: string
  'Star Rating'?: string
  Format?: string
}

/**
 * Which rows become books.
 *
 * `read` only. The export also carries `to-read`, `currently-reading` and
 * `did-not-finish` — four states where the plan assumed three. None of the
 * other three is a finished book, and `Book` has no field to record what they
 * are, so importing them would put unread titles into the reading history. When
 * `Book.status` lands, this is the line that changes: StoryGraph can populate a
 * to-read shelf for free, where a Goodreads export cannot.
 */
const READ_STATUS = 'read'

/**
 * StoryGraph writes several authors into one cell, comma-separated, with
 * illustrators and translators in a separate `Contributors` column. The first
 * name is the author the reader means.
 */
function primaryAuthor(raw: string | undefined): string {
  const first = raw?.split(',')[0]?.trim()
  return first || 'Unknown'
}

export function storyGraphRowToBook(row: StoryGraphRow, index: number): Book | undefined {
  const title = row.Title?.trim()
  if (!title) return undefined

  const isbn = cleanIsbn(row['ISBN/UID'])

  return {
    // No stable id column, unlike Goodreads' `Book Id`. The ISBN is the best
    // identifier the file carries; the row index is the fallback, which is
    // stable within one import and no further.
    id: `sg-${isbn ?? index}`,
    title: cleanTitle(title),
    author: primaryAuthor(row.Authors),
    isbn13: isbn?.length === 13 ? isbn : undefined,
    isbn10: isbn?.length === 10 ? isbn : undefined,
    dateRead: parseDate(row['Last Date Read']),
    rating: parseRating(row['Star Rating']),
    source: 'storygraph',
    imported: true,
  }
}

/** Whether a row is a finished book worth importing. */
export function isStoryGraphRead(row: StoryGraphRow): boolean {
  return row['Read Status']?.trim() === READ_STATUS
}
