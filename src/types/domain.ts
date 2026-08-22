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

/**
 * Where a book came from.
 *
 * Worth showing the reader rather than keeping as bookkeeping: someone who has
 * used both Goodreads and StoryGraph will have the same book from both exports,
 * and the source is the only field that explains why a title appears twice.
 */
export type BookSource = 'goodreads' | 'storygraph' | 'search' | 'manual'

/** How a source is named on screen. */
export const SOURCE_LABEL: Record<BookSource, string> = {
  goodreads: 'Goodreads',
  storygraph: 'StoryGraph',
  search: 'Search',
  manual: 'Added by hand',
}

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
 * How tightly a poster packs its covers.
 *
 * Every value is in export pixels against the 1080x1920 canvas, and every one
 * of them was a fixed token before it turned out to be the only thing between
 * the covers and the edge.
 */
export interface PosterDensity {
  /** Side margin for the grid. 0 runs the covers to the poster edge. */
  gridMarginX: number
  /** Space between covers. 0 makes them touch. */
  gridGap: number
  /** Blank space above the title. Nothing overlays the top of a Story. */
  titleTop: number
}

/**
 * The tightest each value can go, and why the poster stops there.
 *
 * `gridMarginX` and `gridGap` bottom out at 0 because that is a real edge —
 * covers touching the frame and each other. `titleTop` bottoms out at 0 for the
 * same reason. Nothing here is a taste limit; the poster is allowed to look bad
 * so it can be seen looking bad.
 */
export const DENSITY_RANGE = {
  gridMarginX: { min: 0, max: 96 },
  gridGap: { min: 0, max: 40 },
  titleTop: { min: 0, max: 200 },
} as const

/**
 * Grid shape. Columns and rows are chosen rather than derived from book count,
 * so a partly-filled grid still reads as deliberate.
 */
export interface GridConfig {
  columns: number
  rows: number
}

/**
 * The grid shapes the app offers.
 *
 * Two per capacity wherever both read as a poster — a wide one and its tall
 * transpose — with the wide one first, because after the frame was tightened it
 * gives the larger cover at every capacity. The squares have no transpose and
 * stand alone.
 *
 * ## Why rearranging cannot make a cover bigger, and what can
 *
 * This is the finding the catalogue kept relearning, so it is written down.
 *
 * Slots are locked to 2:3 so covers never crop, which means a slot cannot get
 * wider without getting 1.5x taller. The frame is 9:16 and has no spare height.
 * So a grid taller than it is wide runs out of height first, its leftover width
 * has nowhere to go, and that width falls into the side margins: 2x4 uses 45% of
 * the frame's width and can spend none of the rest.
 *
 * The consequence is exact and was missed twice. **Moving rows and columns
 * around redistributes the same-size boxes.** A catalogue swapped wholesale from
 * wide shapes to tall ones — which happened on 2026-08-22 — produces posters
 * whose covers are identical in size and whose margins are worse. Ruthnie put it
 * plainly on seeing it: "you gave me new layout, same grid."
 *
 * What actually reaches the covers is the frame itself. Every wide shape is
 * width-bound, so its slot size is set by exactly one number — the side margin —
 * and 4x2, 3x3, 4x4 and 5x4 were each pressed flat against it. Taking the grid's
 * margin from 72 to 40 and the gap from 20 to 12 is what handed that space over:
 * 4x4 gained 7.5%, 3x3 6.0%, 2x2 4.5%. See `gridMarginX` in `tokens.ts`.
 *
 * The tall shapes gained almost nothing from it (2x4: 1.7%) because margin was
 * never their constraint — height is. Which is why, after tightening, the wide
 * orientation gives the bigger cover at every single capacity.
 *
 * ## So why offer the tall ones at all
 *
 * Because cover size is not the only thing a poster is judged on, and the shape
 * of the block is a real preference — a tall stack reads differently from a wide
 * band, whatever the arithmetic says. The wide one leads because it is bigger;
 * the tall one is there because someone may want it. `GridPicker` cycles between
 * them on a second tap rather than listing both, so the choice stays "how many
 * books" first.
 *
 * 5x5 (25) is left out: 152px slots on a 1080px poster are a postage stamp on a
 * phone and turn the star ratings into specks. 1x1 and its pair sit below what
 * was once a floor of four, which forced a reader with one book she loved into a
 * grid holding three empty rectangles.
 *
 * 1x1 is the shape that proves the height mechanism. A single 2:3 slot at full
 * width is 1448px tall, more than the frame has between the title and the bottom
 * margin, so it reads as certain to strand margin. It does not: `layoutGrid` lets
 * a tall grid claim the bottom clearance down to `gridBottomMin`, and at one row
 * that is enough to land width-bound at 965px.
 */
export const GRID_LAYOUTS: readonly GridConfig[] = [
  { columns: 1, rows: 1 }, // 1
  { columns: 2, rows: 1 }, // 2
  { columns: 1, rows: 2 },
  { columns: 2, rows: 2 }, // 4
  { columns: 3, rows: 2 }, // 6
  { columns: 2, rows: 3 },
  { columns: 4, rows: 2 }, // 8
  { columns: 2, rows: 4 },
  { columns: 3, rows: 3 }, // 9
  { columns: 5, rows: 2 }, // 10
  { columns: 2, rows: 5 },
  { columns: 4, rows: 3 }, // 12
  { columns: 3, rows: 4 },
  { columns: 5, rows: 3 }, // 15
  { columns: 3, rows: 5 },
  { columns: 4, rows: 4 }, // 16
  { columns: 5, rows: 4 }, // 20
  { columns: 4, rows: 5 },
] as const

/**
 * The orientations offered at a capacity, widest first.
 *
 * `GridPicker` shows one card per capacity and cycles through this on tap, so
 * the reader chooses a book count and then, if she wants, a shape. Order is the
 * catalogue's order, which puts the larger-cover shape first.
 */
export function orientationsFor(capacity: number): GridConfig[] {
  return GRID_LAYOUTS.filter((grid) => gridCapacity(grid) === capacity)
}

/** The capacities on offer, each appearing once, in ascending order. */
export const GRID_CAPACITIES: readonly number[] = [
  ...new Set(GRID_LAYOUTS.map(gridCapacity)),
].sort((a, b) => a - b)

export function gridCapacity(grid: GridConfig): number {
  return grid.columns * grid.rows
}

/**
 * Every shape can run its covers edge to edge. This is kept only to say so.
 *
 * It used to return `columns === rows`, and the reasoning was that a bleed slot
 * takes whatever aspect the grid demands, so a shape far from 2:3 crops its
 * covers hard — 66% off a 5x2. True, and it produced a rule that was wrong on
 * its own terms: the test was for squareness, not for cropping, and the two are
 * not the same thing. Measured across the catalogue:
 *
 *     4x5   5% cropped        2x3  21%        2x4  41%
 *     3x4  11%                3x5  29%        3x2  44%
 *     squares 16%             5x4  32%        2x5  53%
 *
 * 4x5 and 3x4 crop LESS than the squares and were blocked; 2x3 crops 21% and
 * was blocked, while a square at 16% was allowed. The rule was letting one
 * number stand in for another because they agreed under an older catalogue.
 *
 * The deeper mistake was deciding on the reader's behalf. A poster that fills
 * the frame corner to corner is a look someone may want at any shape, and 21%
 * off a cover is a crop, not a mutilation. Ruthnie, looking at a 2x3 that could
 * obviously tile the frame and being refused: "we're being too conservative,
 * and it's annoying. Let it get squishy. Let it get uncomfortable. Some people
 * might like that."
 *
 * So the switch is always available and the poster is allowed to look bad. What
 * a reader cannot do is find out why a control is missing, which is the failure
 * this replaces.
 */
export function supportsCoverBleed(_grid: GridConfig): boolean {
  return true
}

/**
 * How much of each cover a bleed layout crops away, as a fraction.
 *
 * Reported next to the switch rather than used to forbid anything. The number
 * is the honest version of what the old rule was guessing at, and it lets the
 * reader decide whether 53% is a look or a mistake.
 */
export function coverBleedCrop(grid: GridConfig): number {
  const slotAspect = POSTER_ASPECT.width / grid.columns / (POSTER_ASPECT.height / grid.rows)
  const coverAspect = 2 / 3

  return slotAspect > coverAspect
    ? 1 - coverAspect / slotAspect
    : 1 - slotAspect / coverAspect
}

/** The canvas, for the crop arithmetic above. Mirrors `POSTER` in `tokens.ts`. */
const POSTER_ASPECT = { width: 1080, height: 1920 } as const


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
   * Offered on every shape. It was once restricted to square grids; that rule
   * tested for squareness while claiming to protect against cropping, and the
   * two are not the same — see `supportsCoverBleed`.
   */
  coverBleed?: boolean
  /**
   * How tightly the covers are packed into the frame.
   *
   * Three numbers that were fixed tokens until they turned out to be the only
   * thing standing between the covers and the edge of the poster. Rearranging
   * rows and columns cannot make a cover bigger — slots are locked to 2:3, so a
   * slot cannot widen without growing 1.5x taller, and the frame has no spare
   * height. The frame itself is the only lever.
   *
   * The real ceiling is the canvas: 1080px across three columns is 360px a slot
   * and no arrangement beats it. Everything between the current size and that
   * ceiling is margin and gap, which are choices rather than constraints.
   *
   * Undefined reads as the defaults in `tokens.ts`, so boards saved before this
   * existed keep the look they were made with.
   */
  density?: PosterDensity
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
  /**
   * The reader's own copy of this book, when the library already holds it.
   *
   * A CSV import writes every row to storage, so a book imported two years ago
   * is sitting there with its ISBN and often its cover — and searching for it
   * used to go to Open Library anyway and hand back a stranger's record of the
   * same book. Matching the stored one instead is instant, works offline, and
   * keeps the cover already fetched for it.
   */
  libraryBookId?: string
}
