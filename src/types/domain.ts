import type { TypefaceId } from '../design/typefaces'

/**
 * Domain model for Read Amour.
 *
 * One `Board` is one month's poster. Boards are independent — editing August
 * never touches July. Cover images are stored separately from boards as blobs
 * so the same cover shared across months is fetched once.
 */

/** A book, as the app knows it. Sources differ; the shape does not. */
export interface Book {
  /** Stable local id. Not the Goodreads or Open Library id. */
  id: string
  title: string
  author: string
  /** Digits only — Goodreads' `="9780307265432"` wrapping is stripped on import. */
  isbn13?: string
  isbn10?: string
  /** Open Library cover id, when the cover came from a search. */
  coverId?: number
  /** Key into the covers store. Absent until a cover has been resolved. */
  coverBlobKey?: string
  /** ISO date the book was finished, when known. Drives month grouping. */
  dateRead?: string
  /** 0 means unrated, matching Goodreads' own encoding. */
  rating?: number
  source: BookSource
}

export type BookSource = 'goodreads' | 'search' | 'manual'

/**
 * Where a poster's background comes from.
 *
 * `builtin` is a generated ground (colour or gradient); `photo` is one of the
 * curated seasonal images shipped with the app; `upload` is the user's own.
 */
export type Background =
  | { kind: 'builtin'; id: string }
  | { kind: 'photo'; id: string }
  | { kind: 'upload'; blobKey: string }
  | { kind: 'color'; value: string }

/**
 * Grid shape. Columns and rows are chosen rather than derived from book count,
 * so a partly-filled grid still reads as deliberate.
 */
export interface GridConfig {
  columns: number
  rows: number
}

export const GRID_LIMITS = {
  minColumns: 2,
  maxColumns: 5,
  minRows: 2,
  maxRows: 6,
} as const

export const DEFAULT_GRID: GridConfig = { columns: 4, rows: 4 }

/**
 * A slot holds at most one book. Slots are addressed by index across the grid
 * in reading order, so resizing the grid preserves which book sits where for
 * as long as the slot still exists.
 */
export interface Slot {
  index: number
  bookId?: string
}

/** Poster text. Kept separate from the grid so either can change alone. */
export interface PosterText {
  title: string
  subtitle: string
  /** Optional handle or note along the bottom edge. */
  caption?: string
  typefaceId: TypefaceId
  /** Poster ink colour. Light backgrounds need dark type. */
  inkColor: string
  /**
   * Opaque panel behind the title block, for backgrounds too busy to read type
   * against directly. Undefined means no panel.
   */
  titlePlate?: TitlePlate
}

export interface TitlePlate {
  /** Fill colour, already including its own alpha. */
  color: string
  /** Rounded corners in export pixels. */
  radius: number
}

/** How a background image fills the frame, when the user overrides the guess. */
export type BackgroundFitOverride = 'cover' | 'tile' | 'contain'

/**
 * How the background image is treated on this board.
 *
 * Separate from the `Background` itself because the same image can be wanted
 * tiled on one poster and cropped on another — and because a curated file's
 * inferred fit is a guess the user must be able to overrule from the UI, not
 * only by renaming the file.
 */
export interface BackgroundTreatment {
  /** Overrides the square/portrait heuristic when set. */
  fit?: BackgroundFitOverride
  /**
   * Wash laid over the image, 0 to 1. Lightens or darkens a busy background so
   * type and covers read against it without editing the source file.
   */
  washOpacity?: number
  /** Whether the wash is white (lighten) or near-black (darken). */
  washTone?: 'light' | 'dark'
}

/** One month's poster, and the unit of persistence. */
export interface Board {
  id: string
  /** `YYYY-MM`, the natural key for a reading month. */
  month: string
  text: PosterText
  grid: GridConfig
  background: Background
  treatment?: BackgroundTreatment
  slots: Slot[]
  createdAt: string
  updatedAt: string
}

/** A cover image held in IndexedDB, keyed by `coverBlobKey`. */
export interface StoredImage {
  key: string
  blob: Blob
  /** Where it came from, for cache reasoning and re-fetching. */
  sourceUrl?: string
  createdAt: string
}

/** A search result before it becomes a `Book`. */
export interface CoverSearchResult {
  key: string
  title: string
  author: string
  coverId?: number
  isbn13?: string
  firstPublishYear?: number
}
