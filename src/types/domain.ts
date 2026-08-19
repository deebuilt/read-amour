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
  /**
   * Whether this book arrived in a CSV and has never been placed on a poster.
   *
   * There is one `books` store and everything writes to it, so a row parsed out
   * of a four-hundred-book export is otherwise indistinguishable from a book the
   * reader searched for and chose. `saveBooks(parsed.books)` runs on the file
   * drop — before the month list renders, before a single month is tapped — so
   * every month in the file is stored and only the tapped ones become posters.
   * The rest are residue, and without this flag they counted: stats totalled
   * them and the suggestion engine built posters out of them, which is how a
   * reader was offered June 2023 for a month she never selected.
   *
   * Set on the file drop, cleared the moment the book lands on a poster by any
   * path. Books added by search or by hand never carry it.
   *
   * **Never re-set once cleared.** A book taken off every poster stays
   * unflagged, which is the safe direction — it was deliberately placed once,
   * and re-flagging it would let the cleanup delete something the reader chose
   * by hand.
   */
  imported?: boolean
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
 * how many books fit. These are the shapes that make a good poster, and the
 * control offers them by capacity.
 *
 * 5x5 (25) is deliberately absent though it is width-bound and legal: slots
 * come out 152px wide on a 1080px poster, which is a postage stamp on a phone
 * and turns the star ratings into specks. Add it if 25-book months are ever
 * actually asked for.
 *
 * 1x1 and 2x1 sit below what used to be the floor. Four slots was the smallest
 * poster on offer, which forced a reader with one book she loved into a grid
 * with three empty rectangles. Both satisfy rows <= columns, so the geometry
 * rule holds.
 *
 * 1x1 was expected to be the exception — a single 2:3 slot at full width is
 * 1404px tall, which is more vertical space than the frame has between the
 * title and the bottom margin, so it looked like it would come out height-bound
 * and strand margin. It does not. `layoutGrid` lets a tall grid claim the bottom
 * clearance down to `gridBottomMin`, and at one row that is enough: the slot
 * lands at the full 936px, width-bound, at the designed 72px margin like every
 * other shape here. The one case that does go height-bound is a caption WITH a
 * title plate, which drops it to 852px and 114px side margins — a mild
 * stranding on the poster least likely to be crowded.
 */
export const GRID_LAYOUTS: readonly GridConfig[] = [
  { columns: 1, rows: 1 }, // 1
  { columns: 2, rows: 1 }, // 2
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

/**
 * Whether this shape can run its covers edge to edge without wrecking them.
 *
 * Cover bleed drops the margins and the gap, so each slot becomes exactly
 * `1080/columns` by `1920/rows` and the cover crops to fill it. How much of the
 * cover survives is entirely decided by how far that slot's aspect sits from
 * the 2:3 a cover actually is — and the answer is not close for most shapes:
 *
 *     2x2, 3x3, 4x4 →  16% cropped   (a trim off the top and bottom)
 *     5x4           →  32%
 *     4x3           →  37%
 *     3x2           →  44%
 *     5x3           →  49%
 *     2x1, 4x2      →  58%
 *     5x2           →  66%           (two thirds of every cover gone)
 *
 * The pattern is exact rather than coincidental: the frame is 9:16, so a grid
 * whose columns-to-rows ratio equals the frame's own gives slots that are
 * themselves 9:16, and every such shape lands on the same 16%. Those are the
 * square grids, and 1x1 with them.
 *
 * So bleed is not a flag that can ride on any layout. Offered on a 5x2 it would
 * quietly destroy the artwork the app exists to show, which is worse than not
 * offering it — the reader would have no way to know that the shape, not the
 * mode, was the problem.
 */
export function supportsCoverBleed(grid: GridConfig): boolean {
  return grid.columns === grid.rows
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
  /**
   * The one book this poster is making a case for, marked on its cover.
   *
   * On the board, not the book. `Book` is shared across every poster that holds
   * it, and the same book can be the month's favourite in August and simply
   * present in September — a flag on the book would make it a favourite
   * everywhere at once.
   *
   * Cleared by `domain/board.ts` whenever the book it names leaves the poster.
   * A dangling id renders nothing, which looks like the mark silently breaking.
   */
  favouriteBookId?: string
  /**
   * Run the covers edge to edge, with no margin, no gap, and no title band.
   *
   * A completely different poster: it says "this is about the books" without
   * any words at all, which is the counterweight to the typographic default.
   *
   * Undefined reads as off, matching `showRatings`, so every board saved before
   * this existed keeps the look it was made with.
   *
   * Only offered on shapes where it does not destroy the covers — see
   * `supportsCoverBleed`. A board carrying the flag onto an unsupported shape
   * renders normally rather than badly; the flag survives so that returning to
   * a square grid restores the mode.
   */
  coverBleed?: boolean
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
