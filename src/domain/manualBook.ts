import { storeUploadedImage } from '../api/covers'
import { saveBook, tagImageOwner } from '../storage/db'
import type { Book } from '../types/domain'

/**
 * Books entered by hand.
 *
 * Open Library's catalogue thins out for very recent releases — a book
 * published this year may simply not be there, which used to mean it could not
 * go on a poster at all. This is the way in for those.
 *
 * The cover goes through `storeUploadedImage`, the same blob path a search
 * result takes. That matters: the export renders from IndexedDB blobs, so a
 * cover that arrived any other way (a remote URL, a data URI pasted in) would
 * either taint the canvas or bloat the saved board. One path in, one path out.
 */

export interface ManualBookInput {
  title: string
  author: string
  /** The user's own file. Required — a manual book with no cover is a blank slot. */
  coverFile: File
  /** ISO `YYYY-MM-DD`. Optional; a poster does not need it. */
  dateRead?: string
  /** 1–5. Undefined means unrated, matching the Goodreads encoding. */
  rating?: number
  isbn13?: string
}

/**
 * Manual ids are prefixed like every other source (`gr-`, `ol-`) so a book's
 * origin stays legible in storage, and a UUID rather than a slug so two books
 * with the same title never collide.
 */
export function manualBookId(): string {
  return `manual-${crypto.randomUUID()}`
}

/**
 * Store the cover, then the book. Returns the saved book ready to place.
 *
 * The image is written before the book record so a book never exists pointing
 * at a `coverBlobKey` that was never stored — that combination renders as a
 * permanently empty slot with no way to tell why.
 */
export async function createManualBook(input: ManualBookInput): Promise<Book> {
  const coverBlobKey = await storeUploadedImage(input.coverFile, 'manual-cover')

  const book: Book = {
    id: manualBookId(),
    title: input.title.trim(),
    author: input.author.trim() || 'Unknown',
    isbn13: input.isbn13?.trim() || undefined,
    coverBlobKey,
    dateRead: input.dateRead,
    rating: input.rating,
    source: 'manual',
  }

  await saveBook(book)
  // The image records its owner too, so a hand-uploaded cover can be matched
  // back to its book if the book's own link is ever lost.
  await tagImageOwner(coverBlobKey, book)
  return book
}
