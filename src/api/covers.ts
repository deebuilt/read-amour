import { coverBlobKey, fetchCoverBlob, searchByIsbn } from './openLibrary'
import { getBook, getImage, hasImage, saveBook, saveImage, tagImageOwner } from '../storage/db'
import type { Book } from '../types/domain'

/**
 * Cover resolution.
 *
 * Turns a book into a stored image blob, going through IndexedDB first so a
 * cover is fetched at most once no matter how many months it appears in.
 *
 * Storing blobs rather than hotlinking is what makes the PNG export possible —
 * see the note in `openLibrary.ts`.
 */

/** Object URLs are cached per key so a re-render does not leak a new one. */
const objectUrlCache = new Map<string, string>()

export async function ensureCoverStored(coverId: number): Promise<string | undefined> {
  const key = coverBlobKey(coverId)
  if (await hasImage(key)) return key

  const blob = await fetchCoverBlob(coverId)
  if (!blob) return undefined

  await saveImage({
    key,
    blob,
    sourceUrl: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
    createdAt: new Date().toISOString(),
  })
  return key
}

/**
 * Resolve a cover for a book that has none yet.
 *
 * ISBN first because it is exact — the CSV import path almost always has one,
 * and a title search would return five editions with three different covers.
 * Books without an ISBN (older classics, some reprints) fall back to the
 * caller's manual search.
 */
export async function resolveCoverForBook(book: Book): Promise<string | undefined> {
  if (book.coverBlobKey && (await hasImage(book.coverBlobKey))) {
    await tagImageOwner(book.coverBlobKey, book)
    return book.coverBlobKey
  }

  /*
   * Fall back to the STORED copy of this book before going to the network.
   *
   * The CSV importer resolves covers for book objects parsed straight out of
   * the file, and those carry no `coverBlobKey` and no `coverId` — the CSV has
   * no such columns. Without this lookup, every re-import of an already
   * resolved month ignores the blob sitting in IndexedDB and re-fetches it
   * from Open Library, which is why previously filled posters looked
   * permanently broken and "unrecoverable" when the images had never left.
   */
  const stored = await getBook(book.id)
  if (stored?.coverBlobKey && (await hasImage(stored.coverBlobKey))) {
    await tagImageOwner(stored.coverBlobKey, book)
    return stored.coverBlobKey
  }

  const coverId = book.coverId ?? stored?.coverId
  if (coverId !== undefined) {
    const key = await ensureCoverStored(coverId)
    if (key) await tagImageOwner(key, book)
    return key
  }

  const isbn = book.isbn13 ?? book.isbn10
  if (!isbn) return undefined

  const match = await searchByIsbn(isbn)
  if (match?.coverId === undefined) return undefined

  const key = await ensureCoverStored(match.coverId)
  // Remember which cover this ISBN resolved to, so the search is not repeated
  // on every future import of the same book — and record the ownership on the
  // image too, so the link survives damage to the book record.
  if (key) {
    const current = stored ?? book
    await saveBook({ ...current, coverId: match.coverId, coverBlobKey: key })
    await tagImageOwner(key, book)
  }
  return key
}

/**
 * Object URL for a stored cover, for use in `<img src>`.
 *
 * URLs are cached rather than revoked per render: revoking on unmount races
 * with React re-mounting the same image and blanks the poster mid-export.
 * The cache is bounded by the number of distinct covers a user owns, which is
 * small, and cleared wholesale on `releaseAllObjectUrls`.
 */
export async function getCoverObjectUrl(key: string): Promise<string | undefined> {
  const cached = objectUrlCache.get(key)
  if (cached) return cached

  const stored = await getImage(key)
  if (!stored) return undefined

  const url = URL.createObjectURL(stored.blob)
  objectUrlCache.set(key, url)
  return url
}

export function releaseObjectUrl(key: string): void {
  const url = objectUrlCache.get(key)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrlCache.delete(key)
  }
}

export function releaseAllObjectUrls(): void {
  objectUrlCache.forEach((url) => URL.revokeObjectURL(url))
  objectUrlCache.clear()
}

/** Store a user-uploaded image (background or cover) and return its key. */
export async function storeUploadedImage(file: File, prefix: string): Promise<string> {
  const key = `${prefix}-${crypto.randomUUID()}`
  await saveImage({
    key,
    blob: file,
    createdAt: new Date().toISOString(),
  })
  return key
}

export interface BatchProgress {
  completed: number
  total: number
  currentTitle: string
}

/**
 * Resolve covers for many books, a few at a time.
 *
 * Open Library is a free service with no key; hammering it with 100 parallel
 * requests is both rude and slower in practice than a small concurrency
 * window. Failures are non-fatal — one missing cover leaves an empty slot
 * rather than failing the whole import.
 */
export async function resolveCoversForBooks(
  books: readonly Book[],
  onProgress?: (progress: BatchProgress) => void,
  concurrency = 4,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  let completed = 0

  const queue = [...books]

  async function worker(): Promise<void> {
    for (;;) {
      const book = queue.shift()
      if (!book) return

      try {
        const key = await resolveCoverForBook(book)
        if (key) resolved.set(book.id, key)
      } catch {
        // A single unreachable cover must not abort the batch.
      }

      completed += 1
      onProgress?.({ completed, total: books.length, currentTitle: book.title })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, books.length) }, () => worker()),
  )

  return resolved
}
