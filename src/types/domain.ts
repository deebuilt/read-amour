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

/**
 * The grid shapes the app offers, and the only ones it offers.
 *
 * Not every columns-by-rows pair fills the poster. The frame is 9:16 and slots
 * are locked to 2:3 so covers never crop, which means a grid taller than it is
 * wide runs out of height before it runs out of width — and the leftover width
 * has nowhere to go, because widening a slot would make it taller again. It
 * falls into the side margins instead. A 2x6 grid uses 30% of the frame width
 * and reads as a narrow column floating in dead air.
 *
 * The rule that falls out of the geometry is exact: **rows may never exceed
 * columns.** Every square-or-wider shape is width-bound and fills the frame at
 * the designed 72px margin; every taller-than-wide shape strands margin.
 *
 * So the shape is not a free choice. Two sliders asked the user to solve a
 * geometry problem in order to answer the question she actually has, which is
 * how many books fit. These nine are the shapes that make a good poster, and
 * the control offers them by capacity.
 *
 * 5x5 (25) is deliberately absent though it is width-bound and legal: slots
 * come out 152px wide on a 1080px poster, which is a postage stamp on a phone
 * and turns the star ratings into specks. Add it if 25-book months are ever
 * actually asked for.
 */
export const GRID_LAYOUTS: readonly GridConfig[] = [
  { columns: 2, rows: 2 }, // 4
  { columns: 3, rows: 2 }, // 6
  { columns: 4, rows: 2 }, // 8
  { columns: 3, rows: 3 }, // 9
  { columns: 5, rows: 2 }, // 10
  { columns: 4, rows: 3 }, // 12
  { columns: 5, rows: 3 }, // 15
  { columns: 4, rows: 4 }, // 16
  { columns: 5, rows: 4 }, // 20
] as const

export function gridCapacity(grid: GridConfig): number {
  return grid.columns * grid.rows
}

/** The most books any offered poster holds. */
export const MAX_GRID_CAPACITY = Math.max(...GRID_LAYOUTS.map(gridCapacity))

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
  /**
   * Whether a rated book shows its stars on the cover.
   *
   * Off by default: the poster has always been covers alone, and turning every
   * book into a review is a different object. Undefined reads as off, so boards
   * saved before this existed keep the look they were made with.
   */
  showRatings?: boolean
  background: Background
  treatment?: BackgroundTreatment
  slots: Slot[]
  createdAt: string
  updatedAt: string
}

/**
 * A cover image held in IndexedDB, keyed by `coverBlobKey`.
 *
 * `bookIds` exists because the link between a book and its cover used to live
 * in exactly one place — `Book.coverBlobKey` — and a single bad write erased it
 * for a whole library. The blobs survived, but nothing recorded which book each
 * belonged to, so they were unrecoverable by inspection: correct images sitting
 * in storage that no code and no human could match back to a title.
 *
 * Recording the owning books here makes the relationship survive damage to
 * either side. It is a list because one cover legitimately serves the same book
 * across several posters, and the same edition across re-imports.
 */
export interface StoredImage {
  key: string
  blob: Blob
  /** Books known to use this image. Repair reads this when a link is lost. */
  bookIds?: string[]
  /** Title at the time of storing, so an orphan is identifiable by eye. */
  bookTitle?: string
  /** Where it came from, for cache reasoning and re-fetching. */
  sourceUrl?: string
  createdAt: string
}

/**
 * A search result before it becomes a `Book`.
 *
 * Carries a cover from either source. `coverId` is Open Library's;
 * `appleArtworkUrl` is a direct image URL from Apple Books, used where Open
 * Library knows the book but has no picture of it. A result may legitimately
 * have neither — a coverless hit is still worth showing, since the reader can
 * add their own cover and the title and author are the tedious part to type.
 */
export interface CoverSearchResult {
  key: string
  title: string
  author: string
  coverId?: number
  /** Full-size Apple artwork URL, already resized. */
  appleArtworkUrl?: string
  isbn13?: string
  firstPublishYear?: number
}
