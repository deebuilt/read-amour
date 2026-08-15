import Papa from 'papaparse'
import type { Book } from '../types/domain'

/**
 * Goodreads CSV import.
 *
 * Goodreads killed its public API in December 2020 and issues no new keys, so
 * the CSV export (My Books → Import/Export) is the only way in. The file is
 * well-formed but has one trap: ISBN columns are written as Excel formulas —
 * `="0743271327"` — to stop spreadsheets eating the leading zeros. Parsed
 * naively that string reaches Open Library verbatim and matches nothing.
 */

/** Columns this importer reads. Goodreads exports ~24; the rest are ignored. */
interface GoodreadsRow {
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

export interface ImportResult {
  books: Book[]
  /** Books with a `Date Read`, grouped by `YYYY-MM`, newest month first. */
  byMonth: Map<string, Book[]>
  /** Finished books with no date — importable, but not month-assignable. */
  undatedCount: number
  skippedCount: number
}

/**
 * Unwrap Goodreads' `="9780307265432"` spreadsheet armour and strip anything
 * that is not an ISBN character. An empty cell exports as `=""`, which reduces
 * to an empty string here.
 */
function cleanIsbn(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const digits = raw.replace(/[^0-9Xx]/g, '').toUpperCase()
  if (digits.length !== 10 && digits.length !== 13) return undefined
  return digits
}

/** Goodreads writes `YYYY/MM/DD`. Convert to ISO, rejecting malformed rows. */
function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(raw.trim())
  if (!match) return undefined
  const [, year, month, day] = match
  return `${year}-${month}-${day}`
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

function parseRating(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const value = Number.parseFloat(raw)
  // Goodreads encodes "unrated" as 0; keep that distinct from a real 1-star.
  if (!Number.isFinite(value) || value <= 0) return undefined
  return value
}

/**
 * Goodreads titles carry series info in parentheses — "The Lion, the Witch and
 * the Wardrobe (Chronicles of Narnia, #1)". On a poster the series tail is
 * noise, so it is trimmed for display while the full title stays searchable.
 */
function cleanTitle(raw: string): string {
  return raw.replace(/\s*\([^)]*#\d+[^)]*\)\s*$/, '').trim()
}

function rowToBook(row: GoodreadsRow, index: number): Book | undefined {
  const title = row.Title?.trim()
  if (!title) return undefined

  const dateRead = parseDate(row['Date Read'])

  return {
    id: `gr-${row['Book Id']?.trim() || index}`,
    title: cleanTitle(title),
    author: row.Author?.trim() ?? 'Unknown',
    isbn13: cleanIsbn(row.ISBN13),
    isbn10: cleanIsbn(row.ISBN),
    dateRead,
    rating: parseRating(row['My Rating']),
    source: 'goodreads',
  }
}

/**
 * Parse an exported library.
 *
 * Only the `read` shelf is imported — `to-read` and `currently-reading` are not
 * finished books and do not belong on a monthly poster.
 */
export function parseGoodreadsCsv(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<GoodreadsRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const books: Book[] = []
        let skippedCount = 0

        results.data.forEach((row, index) => {
          const shelf = row['Exclusive Shelf']?.trim()
          if (shelf !== 'read') {
            skippedCount += 1
            return
          }
          const book = rowToBook(row, index)
          if (book) {
            books.push(book)
          } else {
            skippedCount += 1
          }
        })

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

        resolve({ books, byMonth: sorted, undatedCount, skippedCount })
      },
      error: (error: Error) => reject(error),
    })
  })
}

/** "2026-07" → "July 2026", for month pickers and poster titles. */
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
