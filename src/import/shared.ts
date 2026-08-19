import type { Book } from '../types/domain'

/**
 * The parts of a CSV import that do not depend on which site exported it.
 *
 * Goodreads and StoryGraph carry the same five things the app needs — title,
 * author, an identifier, a finish date, and a rating — under different column
 * names. So the format-specific part is a row mapper and nothing else; the
 * cleaning, the grouping, and the result shape are shared. Forking the importer
 * would have meant two copies of the ISBN and date rules, which are exactly the
 * rules that have already cost a bug each.
 */

export interface ImportResult {
  books: Book[]
  /** Books with a finish date, grouped by `YYYY-MM`, newest month first. */
  byMonth: Map<string, Book[]>
  /** Finished books with no date — importable, but not month-assignable. */
  undatedCount: number
  skippedCount: number
}

/**
 * Strip an ISBN down to its characters, rejecting anything that is not one.
 *
 * Goodreads writes `="9780307265432"` to stop spreadsheets eating leading
 * zeros, and an empty cell exports as `=""`. StoryGraph writes the digits bare
 * but puts them in a column called `ISBN/UID`, which also holds Amazon ASINs
 * (`B08VS8Z8ZR`) for audiobooks and Kindle editions. Both cases fall out of the
 * length test: an ASIN is ten characters but contains letters beyond `X`, and
 * the digit filter reduces it to something too short to pass.
 */
export function cleanIsbn(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const digits = raw.replace(/[^0-9Xx]/g, '').toUpperCase()
  if (digits.length !== 10 && digits.length !== 13) return undefined
  return digits
}

/**
 * `YYYY/MM/DD` to ISO, rejecting anything malformed.
 *
 * Both exporters write this same format — verified against a real StoryGraph
 * file on 2026-08-18, which was the one detail that could have made a shared
 * importer silently wrong. A rejected date is better than a guessed one: the
 * book still imports, it just lands in the undated list where a reader can fix
 * it.
 */
export function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(raw.trim())
  if (!match) return undefined
  const [, year, month, day] = match
  return `${year}-${month}-${day}`
}

/**
 * A rating, or nothing.
 *
 * Goodreads writes integers and encodes "unrated" as 0. StoryGraph permits half
 * stars (`3.5`), which are rounded to nearest: the rating chart is five bars,
 * and inventing ten to accommodate a format most libraries do not use would
 * change a shipped chart for every existing reader.
 */
export function parseRating(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.min(5, Math.round(value))
}

/**
 * Trim a series tail from a title.
 *
 * Goodreads writes "The Lion, the Witch and the Wardrobe (Chronicles of Narnia,
 * #1)". On a poster the tail is noise.
 */
export function cleanTitle(raw: string): string {
  return raw.replace(/\s*\([^)]*#\d+[^)]*\)\s*$/, '').trim()
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/**
 * How the same book is recognised across two exports.
 *
 * Normalised title plus the author's surname — the same rule `bookSearch`
 * already uses to fold one book's two catalogue records together. Surname
 * alone because the sites write authors differently ("George R.R. Martin",
 * "Martin, George R. R."), and the series tail is already trimmed off the
 * title.
 *
 * **Not the ISBN**, which is the tempting answer and the wrong one: an ISBN
 * identifies an *edition*, so the paperback a reader logged on Goodreads and
 * the ebook they logged on StoryGraph carry different ones and would never
 * match. Five rows in a real StoryGraph export had no ISBN at all, and three
 * more carried an Amazon ASIN.
 *
 * Verified against real exports on 2026-08-18: 52 of 56 StoryGraph books were
 * already present from Goodreads, matched exactly, with no false pairs.
 */
export function bookIdentity(book: Pick<Book, 'title' | 'author'>): string {
  const title = book.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  /*
   * The surname, from either name order.
   *
   * A comma means the name is already surname-first — "Martin, George R. R." —
   * so everything before it is the surname. Otherwise the surname trails:
   * "George R.R. Martin".
   *
   * Two rules that look right and are not, both caught by testing against the
   * real pair of exports. **Last word** breaks on the comma form, reducing
   * "Martin, George R. R." to `r` while Goodreads gives `martin` — which is
   * precisely the case this function exists to match. **Longest word** breaks
   * the other way: "George" outranks "Martin", and "Ursula" outranks "Guin".
   *
   * Initials are dropped before the surname is taken, so "George R.R. Martin"
   * and "George Martin" agree. What survives is the last *substantial* word,
   * which is the surname in every ordering either site writes.
   */
  const words = book.author
    .toLowerCase()
    .replace(/[^a-z0-9,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const surnamePart = words.includes(',') ? words.split(',')[0] : words
  const parts = surnamePart
    .replace(/,/g, ' ')
    .split(' ')
    .filter((word) => word.length > 1)

  const surname = parts[parts.length - 1] ?? ''
  return `${title}|${surname}`
}

/**
 * Bucket books into months, newest first.
 *
 * Exported because the import drawer has two doors onto the same list: a
 * dropped CSV, and the books already in storage that were never placed. Both
 * must produce an identical `Map<string, Book[]>` — the panel cannot tell which
 * door it came through, and regrouping stored books with a second copy of this
 * would be the way the two lists quietly start disagreeing.
 *
 * `dateRead` is sliced, never parsed: `new Date('2026-08-01')` reads as UTC and
 * renders local, which files the book under July everywhere west of Greenwich.
 */
export function groupByMonth(books: readonly Book[]): {
  byMonth: Map<string, Book[]>
  undatedCount: number
} {
  const byMonth = new Map<string, Book[]>()
  let undatedCount = 0

  books.forEach((book) => {
    if (!book.dateRead) {
      undatedCount += 1
      return
    }
    const key = monthKey(book.dateRead)
    const bucket = byMonth.get(key)
    if (bucket) {
      bucket.push(book)
    } else {
      byMonth.set(key, [book])
    }
  })

  // Newest month first, and newest book first inside each month.
  const sorted = new Map(
    [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, value]): [string, Book[]] => [
        key,
        [...value].sort((a, b) => (b.dateRead ?? '').localeCompare(a.dateRead ?? '')),
      ]),
  )

  return { byMonth: sorted, undatedCount }
}

/** "2026-07" → "July 2026", for pickers and poster titles. */
export function formatMonth(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** "2026-07" → "July". */
export function monthName(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long' })
}
