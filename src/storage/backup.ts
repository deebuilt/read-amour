import {
  listBoards,
  listBooks,
  listImages,
  putBoardVerbatim,
  saveBooks,
  saveImage,
  getBoard,
  getImage,
} from './db'
import type { Board, Book, StoredImage } from '../types/domain'

/**
 * Whole-library backup: everything in IndexedDB as one downloadable file.
 *
 * This exists because IndexedDB is partitioned by origin and there is no
 * exception to that. Moving the app from `deebuilt.github.io/read-amour/` to
 * its own domain does not carry the data across — a reader arrives at the new
 * address to an empty app while a year of posters sits, intact and unreachable,
 * under the old one. Nothing is deleted; it is stranded, and the only way off
 * an origin is a file the user carries themselves.
 *
 * So this is a migration tool first. It is a backup second, and that second job
 * is the one that outlives the move: a reading history held only in a browser
 * database is one cleared cache from being gone, and the app has no server to
 * recover it from. Both jobs want the same file.
 *
 * Covers travel as base64 inside the JSON rather than as a zip of loose files.
 * A single file cannot be half-restored, needs no library to read, and survives
 * being emailed to yourself — which is realistically how it will travel between
 * two devices. The cost is roughly a third more bytes than the raw blobs, which
 * for a library of a few hundred covers is tens of megabytes: large for a text
 * file, unremarkable for a download.
 */

/**
 * Bumped only when a reader written for an older file could misread a newer
 * one. Adding an optional field to `Board` does not qualify — an old importer
 * ignores what it does not know, and a new importer reading an old file finds
 * the field absent, which is exactly what an optional field means.
 */
const BACKUP_VERSION = 1

const BACKUP_KIND = 'read-amour-backup'

/** An image with its bytes encoded, since JSON cannot hold a Blob. */
interface EncodedImage {
  key: string
  /** Base64 payload, no data-URL prefix. */
  data: string
  /** Kept so the blob is rebuilt as the type it was stored as. */
  type: string
  bookIds?: string[]
  bookTitle?: string
  sourceUrl?: string
  createdAt: string
}

export interface BackupFile {
  kind: typeof BACKUP_KIND
  version: number
  /** When the file was written, for the reader's benefit rather than the code's. */
  exportedAt: string
  /** Origin it came from — the whole point of the file, and useful in support. */
  exportedFrom: string
  boards: Board[]
  books: Book[]
  images: EncodedImage[]
}

/** What the file contains, for confirming a restore before it happens. */
export interface BackupSummary {
  posters: number
  books: number
  covers: number
  exportedAt: string
  exportedFrom: string
}

/* Encoding ---------------------------------------------------------------- */

/**
 * Blob to base64.
 *
 * `FileReader` rather than a manual pass over the bytes: it is the only path
 * that does not build an intermediate string of the whole file per chunk, and
 * these blobs are megabytes each.
 */
async function encodeBlob(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
  // `data:image/jpeg;base64,<payload>` — the prefix is re-derived on import
  // from the stored type, so only the payload is kept.
  const comma = dataUrl.indexOf(',')
  return comma === -1 ? '' : dataUrl.slice(comma + 1)
}

function decodeBlob(data: string, type: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: type || 'application/octet-stream' })
}

/* Export ------------------------------------------------------------------ */

/**
 * Read the whole database into one file.
 *
 * `onProgress` reports covers encoded out of the total, because this is the
 * slow part and a library's worth of covers on a phone is long enough that a
 * silent button reads as a broken one.
 */
export async function createBackup(
  onProgress?: (done: number, total: number) => void,
): Promise<BackupFile> {
  const [boards, books, images] = await Promise.all([listBoards(), listBooks(), listImages()])

  const encoded: EncodedImage[] = []

  // Sequential, matching `shrinkStoredUploads` and for the same reason: each
  // encode holds the full image in memory, and several at once on the phone
  // this app is built for is a memory spike rather than a speed-up.
  for (const image of images) {
    try {
      encoded.push({
        key: image.key,
        data: await encodeBlob(image.blob),
        type: image.blob.type,
        bookIds: image.bookIds,
        bookTitle: image.bookTitle,
        sourceUrl: image.sourceUrl,
        createdAt: image.createdAt,
      })
    } catch {
      // One unreadable blob must not cost the reader the other several hundred
      // covers and every poster. It is skipped; the book keeps its
      // `coverBlobKey`, and on the new origin that cover simply re-resolves
      // from the catalogue the way it did the first time.
    }
    onProgress?.(encoded.length, images.length)
  }

  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedFrom: window.location.origin + window.location.pathname,
    boards,
    books,
    images: encoded,
  }
}

/* Reading a file back ----------------------------------------------------- */

/**
 * Parse and validate, without writing anything.
 *
 * Split from the restore so the user is told what they are about to merge
 * before it happens, and so a file picked by mistake fails at the point where
 * failing is free.
 */
export function readBackup(text: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not a Read Amour backup — it could not be read as JSON.')
  }

  if (!isBackupFile(parsed)) {
    throw new Error('That file is not a Read Amour backup.')
  }
  if (parsed.version > BACKUP_VERSION) {
    throw new Error(
      'That backup was made by a newer version of Read Amour. Update the app, then try again.',
    )
  }
  return parsed
}

export function summarise(backup: BackupFile): BackupSummary {
  return {
    posters: backup.boards.length,
    books: backup.books.length,
    covers: backup.images.length,
    exportedAt: backup.exportedAt,
    exportedFrom: backup.exportedFrom,
  }
}

/**
 * Structural check only — enough to be sure this is our file and that the
 * fields the restore touches are the types it expects.
 *
 * Deliberately not a field-by-field validation of `Board`: the app already
 * repairs boards on load through `migrateBoard`, and duplicating its knowledge
 * here would mean two places to update every time the shape moves.
 */
function isBackupFile(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.kind === BACKUP_KIND &&
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.boards) &&
    Array.isArray(candidate.books) &&
    Array.isArray(candidate.images)
  )
}

export interface RestoreResult {
  postersAdded: number
  postersSkipped: number
  booksMerged: number
  coversAdded: number
}

/**
 * Merge a backup into whatever is already here.
 *
 * Merge, never replace. A restore that wiped the database first would turn one
 * mis-picked file into the loss this feature exists to prevent, and the merge
 * costs nothing: ids are stable, so restoring the same file twice is a no-op
 * rather than a duplicate library.
 *
 * The order is load-bearing and matches the rest of the app: **images first,
 * then books, then boards.** Every later record points at an earlier one, so a
 * restore interrupted halfway leaves covers with no book — which the orphan
 * sweep already protects (`cover-*` is never swept, uploads have their grace
 * period) — rather than books pointing at covers that never arrived.
 */
export async function restoreBackup(
  backup: BackupFile,
  onProgress?: (done: number, total: number) => void,
): Promise<RestoreResult> {
  const total = backup.images.length + backup.books.length + backup.boards.length
  let done = 0
  const step = () => onProgress?.((done += 1), total)

  /* Images ---------------------------------------------------------------- */

  let coversAdded = 0
  for (const encoded of backup.images) {
    // An image already here is left alone. Cover keys are content-addressed —
    // the same key is by definition the same picture — and a local upload the
    // reader has since shrunk should not be re-inflated by an older file.
    const existing = await getImage(encoded.key)
    if (!existing) {
      try {
        const image: StoredImage = {
          key: encoded.key,
          blob: decodeBlob(encoded.data, encoded.type),
          bookIds: encoded.bookIds,
          bookTitle: encoded.bookTitle,
          sourceUrl: encoded.sourceUrl,
          createdAt: encoded.createdAt,
        }
        await saveImage(image)
        coversAdded += 1
      } catch {
        // A corrupt entry loses one cover, not the restore.
      }
    }
    step()
  }

  /* Books ----------------------------------------------------------------- */

  // `saveBooks` merges field by field and never lets an undefined incoming
  // value clear a stored one — the same guard that keeps a re-dropped Goodreads
  // CSV from stripping every resolved cover. A restore is exactly that shape of
  // write, so it goes through the same door rather than around it.
  await saveBooks(backup.books)
  done += backup.books.length
  onProgress?.(done, total)

  /* Boards ---------------------------------------------------------------- */

  let postersAdded = 0
  let postersSkipped = 0
  for (const board of backup.boards) {
    // A poster that already exists is left as it is. The one on this device has
    // been looked at more recently than the file has, and silently overwriting
    // it would be the destructive case wearing a restore's clothes.
    const existing = await getBoard(board.id)
    if (existing) {
      postersSkipped += 1
    } else {
      // Verbatim, so a restored poster keeps the date it was actually last
      // edited rather than the date it was restored.
      await putBoardVerbatim(board)
      postersAdded += 1
    }
    step()
  }

  return {
    postersAdded,
    postersSkipped,
    booksMerged: backup.books.length,
    coversAdded,
  }
}

/* File in, file out ------------------------------------------------------- */

export function backupFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10)
  return `read-amour-backup-${stamp}.json`
}

/**
 * Write the backup out as a download.
 *
 * The blob is built by streaming the JSON through `Blob` rather than holding a
 * string and a copy — a large library's file is tens of megabytes and the
 * string form is the peak.
 */
export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFilename()
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on the next frame, not immediately: Safari has not always finished
  // reading the blob by the time `click` returns.
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}
