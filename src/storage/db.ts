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

/** Bulk insert for CSV import — one transaction rather than one per row. */
export async function saveBooks(books: readonly Book[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('books', 'readwrite')
  await Promise.all(books.map((book) => tx.store.put(book)))
  await tx.done
}

/* Images ------------------------------------------------------------------ */

export async function getImage(key: string): Promise<StoredImage | undefined> {
  const db = await getDB()
  return db.get('images', key)
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

export async function deleteImage(key: string): Promise<void> {
  const db = await getDB()
  await db.delete('images', key)
}

/**
 * Drop images no board or book still points at. Uploaded backgrounds and
 * covers otherwise accumulate every time one is swapped out.
 */
export async function pruneOrphanedImages(): Promise<number> {
  const db = await getDB()
  const [boards, books, imageKeys] = await Promise.all([
    db.getAll('boards'),
    db.getAll('books'),
    db.getAllKeys('images'),
  ])

  const referenced = new Set<string>()
  books.forEach((book) => {
    if (book.coverBlobKey) referenced.add(book.coverBlobKey)
  })
  boards.forEach((board) => {
    if (board.background.kind === 'upload') referenced.add(board.background.blobKey)
  })

  const orphans = imageKeys.filter((key) => !referenced.has(key))
  if (orphans.length === 0) return 0

  const tx = db.transaction('images', 'readwrite')
  await Promise.all(orphans.map((key) => tx.store.delete(key)))
  await tx.done
  return orphans.length
}
