import { listBooks } from '../storage/db'
import type { Book, CoverSearchResult } from '../types/domain'

/**
 * Search the books already in storage.
 *
 * A CSV import writes every row it parses, so a reader who imported a Goodreads
 * library two years ago has hundreds of books sitting in IndexedDB with their
 * ISBNs, and often their covers. Searching for one of them went to Open Library
 * anyway and came back with a stranger's record of a book the app already had.
 *
 * This is the reuse that justifies keeping unplaced rows rather than refusing to
 * store them: the import stops being a liability and becomes an index. A match
 * here is instant, works offline, and carries the cover that was already fetched
 * for it — so placing a book you imported costs no network at all.
 *
 * The whole library is read and filtered in memory rather than queried through
 * an index. A few hundred records is nothing next to the network call this is
 * replacing, and an index would have to be maintained on a field that changes.
 */

/** Comparable form: lowercase, no punctuation, collapsed whitespace. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether every word of the query appears in the book's title or author.
 *
 * Every word rather than any, so "forsaken prophecy" does not match every book
 * with "prophecy" in it. Prefix-matched per word, so a half-typed word still
 * finds its book — the same rule the catalogue search applies to its trailing
 * fragment, which matters more here: this list is the reader's own books and
 * ought to narrow as fast as they type.
 */
function matches(book: Book, words: readonly string[]): boolean {
  const haystack = `${normalise(book.title)} ${normalise(book.author)}`.split(' ')
  return words.every((word) => haystack.some((part) => part.startsWith(word)))
}

function toResult(book: Book): CoverSearchResult {
  return {
    // Namespaced so a stored book can never collide with a catalogue key.
    key: `library:${book.id}`,
    title: book.title,
    author: book.author,
    coverId: book.coverId,
    isbn13: book.isbn13,
    libraryBookId: book.id,
  }
}

/**
 * Books in the library matching the query, best first.
 *
 * Ordered by how early the match lands in the title: a book whose title *starts*
 * with what was typed is what the reader meant, ahead of one that merely
 * contains the words. Ties go to a book that already has a cover, since it can
 * fill a slot with no further work.
 */
export async function searchLibrary(query: string, limit = 5): Promise<CoverSearchResult[]> {
  const words = normalise(query).split(' ').filter(Boolean)
  if (words.length === 0) return []

  const books = await listBooks()
  const found = books.filter((book) => matches(book, words))
  if (found.length === 0) return []

  const first = words[0]
  const rank = (book: Book): number => {
    const title = normalise(book.title)
    if (title.startsWith(first)) return 0
    if (title.split(' ').some((part) => part.startsWith(first))) return 1
    return 2
  }

  return found
    .sort((a, b) => {
      const gap = rank(a) - rank(b)
      if (gap !== 0) return gap

      const coverGap = Number(Boolean(b.coverBlobKey)) - Number(Boolean(a.coverBlobKey))
      if (coverGap !== 0) return coverGap

      return a.title.localeCompare(b.title)
    })
    .slice(0, limit)
    .map(toResult)
}
