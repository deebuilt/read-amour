import Papa from 'papaparse'
import { goodreadsRowToBook, isGoodreadsRead, type GoodreadsRow } from './goodreads'
import { isStoryGraphRead, storyGraphRowToBook, type StoryGraphRow } from './storygraph'
import { groupByMonth, type ImportResult } from './shared'
import type { Book } from '../types/domain'

/**
 * One door for both exports.
 *
 * The format is detected from the header row rather than asked about. Someone
 * who just exported a file knows where it came from and should not have to tell
 * the app — and a wrong answer from a picker would produce an import where
 * every column missed.
 */

export type ImportFormat = 'goodreads' | 'storygraph'

/**
 * Which site wrote this file.
 *
 * Keyed on columns unique to each: `Read Status` and `Moods` are StoryGraph's,
 * `Exclusive Shelf` and `Book Id` are Goodreads'. Both are checked rather than
 * one, so a file missing a single column still lands. Returns undefined when
 * neither matches, which the panel reports rather than guessing at.
 */
export function detectFormat(headers: readonly string[]): ImportFormat | undefined {
  const has = (name: string): boolean => headers.some((header) => header.trim() === name)

  if (has('Read Status') || has('Moods')) return 'storygraph'
  if (has('Exclusive Shelf') || has('Book Id')) return 'goodreads'
  return undefined
}

export interface ParseOutcome extends ImportResult {
  format: ImportFormat
}

/**
 * Parse an exported library from either site.
 *
 * Only finished books are imported. The other shelves — to-read,
 * currently-reading, and StoryGraph's did-not-finish — are not finished books,
 * and `Book` has nowhere to record what they are, so importing them would put
 * unread titles into the reading history.
 */
export function parseLibraryCsv(file: File): Promise<ParseOutcome> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string | undefined>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const format = detectFormat(results.meta.fields ?? [])
        if (!format) {
          reject(
            new Error(
              'That does not look like a Goodreads or StoryGraph export. Both are exported as CSV from your account settings.',
            ),
          )
          return
        }

        const books: Book[] = []
        let skippedCount = 0

        results.data.forEach((row, index) => {
          const kept =
            format === 'storygraph'
              ? isStoryGraphRead(row as StoryGraphRow)
                ? storyGraphRowToBook(row as StoryGraphRow, index)
                : undefined
              : isGoodreadsRead(row as GoodreadsRow)
                ? goodreadsRowToBook(row as GoodreadsRow, index)
                : undefined

          if (kept) {
            books.push(kept)
          } else {
            skippedCount += 1
          }
        })

        const { byMonth, undatedCount } = groupByMonth(books)
        resolve({ books, byMonth, undatedCount, skippedCount, format })
      },
      error: (error: Error) => reject(error),
    })
  })
}
