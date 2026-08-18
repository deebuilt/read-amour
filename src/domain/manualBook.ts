import { storeUploadedImage } from '../api/covers'
import { saveBook, tagImageOwner } from '../storage/db'
import { newId } from './ids'
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
 *
 * The cover is optional, for the same reason a coverless catalogue hit is worth
 * taking: the title and author are the tedious part to type, and `PosterSlot`
 * already draws a coverless book as a tinted plate carrying its own type. A
 * cover can be added later through `BookDetailsEditor`.
 */

export interface ManualBookInput {
  title: string
  /**
   * Required at the form, not defaulted here.
   *
   * `'Unknown'` is a real sentinel elsewhere — Open Library, Apple and the
   * Goodreads importer all emit it for a record that genuinely has no author,
   * and `stats.ts` and `isConfidentMatch()` both test for it. Defaulting to it
   * here would have manufactured that state from a reader who was sitting right
   * there and could have typed the name, which is why the form asks instead.
   */
  author: string
  /** The user's own file. Optional — a coverless book renders as a tinted plate. */
  coverFile?: File
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
  return `manual-${newId()}`
}

/**
 * Store the cover, then the book. Returns the saved book ready to place.
 *
 * The image is written before the book record so a book never exists pointing
 * at a `coverBlobKey` that was never stored — that combination renders as a
 * permanently empty slot with no way to tell why.
 */
export async function createManualBook(input: ManualBookInput): Promise<Book> {
  const coverBlobKey = input.coverFile
    ? await storeUploadedImage(input.coverFile, 'manual-cover')
    : undefined

  const book: Book = {
    id: manualBookId(),
    title: input.title.trim(),
    author: input.author.trim(),
    isbn13: input.isbn13?.trim() || undefined,
    coverBlobKey,
    dateRead: input.dateRead,
    rating: input.rating,
    source: 'manual',
  }

  await saveBook(book)
  // The image records its owner too, so a hand-uploaded cover can be matched
  // back to its book if the book's own link is ever lost.
  if (coverBlobKey) await tagImageOwner(coverBlobKey, book)
  return book
}
