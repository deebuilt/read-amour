import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Board, Book, StoredImage } from '../types/domain'

/**
 * Local persistence.
 *
 * IndexedDB rather than localStorage because covers are stored as blobs —
 * localStorage caps around 5MB and only holds strings, which a dozen cover
 * images would blow straight through.
 *
 * Images live in their own store keyed by a content-derived key, so a cover
 * shared between months is fetched and stored once.
 */

const DB_NAME = 'read-amour'
const DB_VERSION = 1

interface ReadAmourDB extends DBSchema {
  boards: {
    key: string
    value: Board
    indexes: { 'by-month': string }
  }
  books: {
    key: string
    value: Book
  }
  images: {
    key: string
    value: StoredImage
  }
}

let dbPromise: Promise<IDBPDatabase<ReadAmourDB>> | undefined

function getDB(): Promise<IDBPDatabase<ReadAmourDB>> {
  dbPromise ??= openDB<ReadAmourDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const boards = db.createObjectStore('boards', { keyPath: 'id' })
      boards.createIndex('by-month', 'month')
      db.createObjectStore('books', { keyPath: 'id' })
      db.createObjectStore('images', { keyPath: 'key' })
    },
  })
  return dbPromise
}

/* Boards ------------------------------------------------------------------ */

export async function listBoards(): Promise<Board[]> {
  const db = await getDB()
  const boards = await db.getAll('boards')
  // Newest reading month first — the one being worked on is almost always
  // the most recent.
  return boards.sort((a, b) => b.month.localeCompare(a.month))
}

export async function getBoard(id: string): Promise<Board | undefined> {
  const db = await getDB()
  return db.get('boards', id)
}

export async function getBoardByMonth(month: string): Promise<Board | undefined> {
  const db = await getDB()
  return db.getFromIndex('boards', 'by-month', month)
}

export async function saveBoard(board: Board): Promise<void> {
  const db = await getDB()
  await db.put('boards', { ...board, updatedAt: new Date().toISOString() })
}

/**
 * Write a board exactly as given, timestamps included.
 *
 * `saveBoard` stamps `updatedAt` with the current time, which is right for
 * every edit the user makes and wrong for a restore: it would re-date a year of
 * posters to the moment the backup was read, destroying the only record of when
 * each was actually last worked on. The file holds the true value and nothing
 * else does, so a restore must preserve it rather than re-derive it.
 *
 * Only the backup restore should use this. An edit that skips the stamp leaves
 * the board claiming it has not changed since whenever it was last restored.
 */
export async function putBoardVerbatim(board: Board): Promise<void> {
  const db = await getDB()
  await db.put('boards', board)
}

export async function deleteBoard(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('boards', id)
}

/* Books ------------------------------------------------------------------- */

export async function listBooks(): Promise<Book[]> {
  const db = await getDB()
  return db.getAll('books')
}

export async function getBook(id: string): Promise<Book | undefined> {
  const db = await getDB()
  return db.get('books', id)
}

export async function getBooks(ids: readonly string[]): Promise<Map<string, Book>> {
  const db = await getDB()
  const tx = db.transaction('books')
  const found = await Promise.all(ids.map((id) => tx.store.get(id)))
  await tx.done
  const map = new Map<string, Book>()
  found.forEach((book) => {
    if (book) map.set(book.id, book)
  })
  return map
}

export async function saveBook(book: Book): Promise<void> {
  const db = await getDB()
  await db.put('books', book)
}

/**
 * Bulk insert for CSV import — one transaction rather than one per row.
 *
 * Fields the incoming record leaves undefined are kept from the stored one.
 * This matters most for `coverBlobKey`: a Goodreads CSV has no such column, so
 * a plain `put` of a re-parsed library silently strips the resolved cover from
 * every book already imported. The blobs survive in the images store, but
 * nothing points at them any more and every previously-filled poster goes
 * blank at once.
 *
 * That happened on 2026-08-14, on the second drop of the same CSV. It looked
 * exactly like data loss and was not: re-dropping the file to import one new
 * month unlinked the covers of every month imported before it.
 */
export async function saveBooks(books: readonly Book[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('books', 'readwrite')

  await Promise.all(
    books.map(async (book) => {
      const existing = await tx.store.get(book.id)
      if (!existing) return tx.store.put(book)

      // A field the incoming record actually sets always wins, so this stays a
      // merge and never blocks a real edit. Written out rather than filtered
      // generically so adding a field to `Book` forces a decision here.
      const merged: Book = {
        ...existing,
        title: book.title,
        author: book.author,
        source: book.source,
        isbn13: book.isbn13 ?? existing.isbn13,
        isbn10: book.isbn10 ?? existing.isbn10,
        coverId: book.coverId ?? existing.coverId,
        coverBlobKey: book.coverBlobKey ?? existing.coverBlobKey,
        dateRead: book.dateRead ?? existing.dateRead,
        rating: book.rating ?? existing.rating,
        // The one field where the incoming record does NOT simply win, because
        // the two directions are not symmetric: a clearing must stick forever,
        // a flagging must never undo one.
        //
        // So `false` on EITHER side wins, and otherwise the incoming value
        // fills in. Placement clears the flag, but book objects keep circulating
        // afterwards — the preview cover-save re-saves books it fetched art for,
        // and a re-dropped CSV re-parses rows that have since been placed. Both
        // would re-flag an adopted book if `true` could win.
        //
        // Reading `existing.imported === false` matters as much as the incoming
        // one: without it a cover-save, which sets no flag at all, would erase a
        // clearing back to `undefined`. And the fallback must be `??` rather
        // than `&&` — with `&&`, a fresh CSV row landing on a book stored before
        // this field existed collapsed `true` to `undefined`, which left every
        // row of a re-dropped file counting as adopted. Both were caught by
        // running the eight real merge cases rather than by reading this.
        imported:
          book.imported === false || existing.imported === false
            ? false
            : (book.imported ?? existing.imported),
      }
      return tx.store.put(merged)
    }),
  )

  await tx.done
}

/**
 * Clear the imported flag on books that have just been placed on a poster.
 *
 * Placement is what "adopting" a book means, so it is the one event that turns
 * a parsed row into part of the reader's library. Every path that puts a book
 * into a slot calls this — the month import, "make all posters", keeping a
 * suggestion, and choosing a book for a slot by hand.
 *
 * Only ever clears. A book that is already unflagged is skipped rather than
 * rewritten, so this is a no-op on a library built entirely by search, and it
 * can never re-flag anything.
 */
export async function markBooksPlaced(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDB()
  const tx = db.transaction('books', 'readwrite')

  await Promise.all(
    ids.map(async (id) => {
      const book = await tx.store.get(id)
      if (!book?.imported) return
      return tx.store.put({ ...book, imported: false })
    }),
  )

  await tx.done
}

/**
 * Books that came in on a CSV and were never put on a poster.
 *
 * The index of the library that has not been adopted yet — what the import
 * drawer lists under "already in your library", and what the cleanup clears.
 */
export async function listUnplacedBooks(): Promise<Book[]> {
  const db = await getDB()
  const books = await db.getAll('books')
  return books.filter((book) => book.imported === true)
}

/** Delete books by id. Used by the cleanup, which passes unplaced rows only. */
export async function deleteBooks(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDB()
  const tx = db.transaction('books', 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

/**
 * Decide what the existing library means, now that `imported` exists.
 *
 * Every book already in storage predates the field, so this migration is the
 * only thing that can say which of them were adopted. It runs in the safe
 * direction and the direction matters more than anything else here: a book is
 * flagged only when it is on **no poster at all**. Defaulting the field to
 * `true`, or getting the test backwards, means the first cleanup deletes books
 * that are sitting on posters the reader made.
 *
 * It also keys on `source === 'goodreads'`, so a searched or hand-added book
 * that happens to be on no poster is never touched. That is a real state — a
 * book deliberately added and later removed from every poster — and it is not
 * import residue.
 *
 * Runs at startup beside `repairCoverLinks()` and is a no-op once done: a book
 * that already carries the field either way is left alone, so this never
 * re-flags a book that placement has since cleared.
 */
let backfillPromise: Promise<number> | undefined

/**
 * The migration, run once and awaitable by anyone who reads books.
 *
 * `useBoard` starts it, but it is not the only hook that reads the library —
 * `useSuggestions` and `useStats` both do, on their own mounts, and React gives
 * no ordering between sibling effects. So `useSuggestions` called `listBooks()`
 * while the migration was still writing, got the library as it was before any
 * flag existed, and offered a poster for a month whose books were about to be
 * reclassified as unplaced. It looked like a stale suggestion and was a race.
 *
 * Memoising the promise rather than a boolean is what makes this safe: a second
 * caller arriving mid-migration waits for the same run instead of starting its
 * own or skipping ahead of one in flight.
 */
export function ensureImportedFlagBackfilled(): Promise<number> {
  backfillPromise ??= backfillImportedFlag()
  return backfillPromise
}

export async function backfillImportedFlag(): Promise<number> {
  const db = await getDB()
  const [books, boards] = await Promise.all([db.getAll('books'), db.getAll('boards')])

  const undecided = books.filter(
    (book) => book.imported === undefined && book.source === 'goodreads',
  )
  if (undecided.length === 0) return 0

  // Every book id sitting in a slot on any poster.
  const placed = new Set<string>()
  boards.forEach((board) => {
    board.slots.forEach((slot) => {
      if (slot.bookId) placed.add(slot.bookId)
    })
  })

  const tx = db.transaction('books', 'readwrite')
  await Promise.all(
    undecided.map((book) => tx.store.put({ ...book, imported: !placed.has(book.id) })),
  )
  await tx.done

  return undecided.filter((book) => !placed.has(book.id)).length
}

/* Images ------------------------------------------------------------------ */

export async function getImage(key: string): Promise<StoredImage | undefined> {
  const db = await getDB()
  return db.get('images', key)
}

/**
 * Every stored image, blobs included.
 *
 * Only the backup has a use for this. The app itself always reaches for a
 * specific key, and the maintenance passes above read the store internally —
 * pulling every blob into memory at once is a cost worth paying exactly when
 * the user has asked for a file containing all of them.
 */
export async function listImages(): Promise<StoredImage[]> {
  const db = await getDB()
  return db.getAll('images')
}

export async function hasImage(key: string): Promise<boolean> {
  const db = await getDB()
  const count = await db.count('images', key)
  return count > 0
}

export async function saveImage(image: StoredImage): Promise<void> {
  const db = await getDB()
  await db.put('images', image)
}

/**
 * Record that a book uses an image, on the image itself.
 *
 * The book-to-cover link lived only in `Book.coverBlobKey`, so one bad write
 * severed every cover in the library with no way back — the blobs were intact
 * and anonymous. Writing the owner here gives the relationship a second copy,
 * which `repairCoverLinks` reads to rebuild the first.
 */
export async function tagImageOwner(key: string, book: Book): Promise<void> {
  const db = await getDB()
  const stored = await db.get('images', key)
  if (!stored) return

  const owners = new Set(stored.bookIds ?? [])
  if (owners.has(book.id) && stored.bookTitle) return

  owners.add(book.id)
  await db.put('images', {
    ...stored,
    bookIds: [...owners],
    bookTitle: stored.bookTitle ?? book.title,
  })
}

/**
 * Restore `coverBlobKey` on books whose link was lost but whose image remains.
 *
 * Runs at startup and is a no-op once everything is consistent. It only ever
 * fills a missing field — it never overwrites a cover a book already has.
 */
export async function repairCoverLinks(): Promise<number> {
  const db = await getDB()
  const [books, images] = await Promise.all([db.getAll('books'), db.getAll('images')])

  // Every book id any stored image claims as an owner.
  const ownerToKey = new Map<string, string>()
  images.forEach((image) => {
    image.bookIds?.forEach((id) => ownerToKey.set(id, image.key))
  })
  if (ownerToKey.size === 0) return 0

  const broken = books.filter((book) => !book.coverBlobKey && ownerToKey.has(book.id))
  if (broken.length === 0) return 0

  const tx = db.transaction('books', 'readwrite')
  await Promise.all(
    broken.map((book) => tx.store.put({ ...book, coverBlobKey: ownerToKey.get(book.id) })),
  )
  await tx.done
  return broken.length
}

export async function deleteImage(key: string): Promise<void> {
  const db = await getDB()
  await db.delete('images', key)
}

/**
 * Shrink oversized uploads already sitting in storage.
 *
 * `storeUploadedImage` downscales on the way in, but that only helps uploads
 * made after it existed. A background saved off Unsplash before then is still
 * held at full camera size — 4000px or more for a 1080px poster — and the
 * browser rescales every one of those pixels on each repaint, which is felt as
 * a stuttering drawer and a lagging wash slider.
 *
 * Refreshing does not fix it: the shrink runs at upload time and deploying new
 * code does not touch stored bytes. So the existing blobs have to be rewritten
 * once, which is what this does.
 *
 * Runs at startup beside `repairCoverLinks` and is a no-op once everything has
 * been through it — the size test is on the stored blob, so a shrunk image is
 * never re-encoded and quality does not compound over runs.
 *
 * Only user uploads are touched. Catalogue covers arrive from Open Library and
 * Apple already sized for display, and they are content-addressed and shared
 * across posters — rewriting those bytes would re-encode an image several
 * boards point at to no benefit.
 */
export async function shrinkStoredUploads(
  shrink: (blob: Blob) => Promise<Blob>,
): Promise<number> {
  const db = await getDB()
  const images = await db.getAll('images')

  const candidates = images.filter(
    (image) => isUpload(image.key) && image.blob.size > UPLOAD_SHRINK_FLOOR_BYTES,
  )
  if (candidates.length === 0) return 0

  let rewritten = 0

  // Sequential rather than parallel: each shrink decodes a full-size bitmap,
  // and doing several at once on a phone is how a startup pass turns into a
  // memory spike on the one device this app is built for.
  for (const image of candidates) {
    try {
      const blob = await shrink(image.blob)
      // `shrinkForStorage` returns the original when it cannot improve on it.
      if (blob.size >= image.blob.size) continue

      await db.put('images', { ...image, blob })
      rewritten += 1
    } catch {
      // A blob that will not decode keeps its original bytes. The cost is
      // performance on one image, which is strictly better than losing it.
    }
  }

  return rewritten
}

/**
 * Uploads are the only images this rewrites — see `shrinkStoredUploads`.
 * Keyed off the prefixes `storeUploadedImage` writes.
 */
function isUpload(key: string): boolean {
  return key.startsWith('bg-') || key.startsWith('manual-cover-')
}

/**
 * Below this, an upload is not worth decoding to check. Matches the floor in
 * `shrinkForStorage`, so the two passes agree on what counts as oversized.
 */
const UPLOAD_SHRINK_FLOOR_BYTES = 400 * 1024

/**
 * Images that are stored before anything references them.
 *
 * `ensureCoverStored` writes a cover blob and only then hands its key back to
 * the caller, which saves the book pointing at it — and the CSV import waits
 * until an entire month has resolved before saving any of them. For that whole
 * window the blob is referenced by nothing, and a sweep that treats
 * "unreferenced" as "orphaned" deletes covers that are actively being fetched.
 *
 * That is not hypothetical: it wiped a month of already-resolved covers during
 * this app's first real use, because a prune ran while an import was still in
 * flight. Cover blobs are content-addressed by Open Library id, so they are
 * never garbage in the way a replaced upload is — they are either in use or
 * about to be. Only user uploads, whose keys are per-instance UUIDs and so
 * genuinely leak on replacement, are swept.
 */
function isSweepable(key: string): boolean {
  if (key.startsWith('cover-')) return false
  // A hand-uploaded cover has the same gap, just a shorter one: the blob is
  // written, then the book that points at it. A grace period covers it without
  // making these blobs permanently unsweepable the way covers are.
  return true
}

/**
 * How long an image is protected from sweeping after it is written.
 *
 * Long enough to outlast a slow import on a poor connection; short enough that
 * a genuinely orphaned upload is reclaimed on the next sweep rather than
 * lingering for the session.
 */
const SWEEP_GRACE_MS = 10 * 60 * 1000

function isWithinGracePeriod(createdAt: string, now: number): boolean {
  const written = Date.parse(createdAt)
  if (Number.isNaN(written)) return false
  return now - written < SWEEP_GRACE_MS
}

/**
 * Drop uploaded images no board or book still points at.
 *
 * Uploaded backgrounds and hand-added covers otherwise accumulate every time
 * one is swapped out — each gets a fresh UUID key, so the old blob is
 * unreachable but still occupying space.
 */
export async function pruneOrphanedImages(): Promise<number> {
  const db = await getDB()
  const [boards, books, images] = await Promise.all([
    db.getAll('boards'),
    db.getAll('books'),
    db.getAll('images'),
  ])

  const referenced = new Set<string>()
  books.forEach((book) => {
    if (book.coverBlobKey) referenced.add(book.coverBlobKey)
  })
  boards.forEach((board) => {
    if (board.background.kind === 'upload') referenced.add(board.background.blobKey)
  })

  const now = Date.now()
  const orphans = images
    .filter(
      (image) =>
        isSweepable(image.key) &&
        !referenced.has(image.key) &&
        !isWithinGracePeriod(image.createdAt, now),
    )
    .map((image) => image.key)
  if (orphans.length === 0) return 0

  const tx = db.transaction('images', 'readwrite')
  await Promise.all(orphans.map((key) => tx.store.delete(key)))
  await tx.done
  return orphans.length
}
