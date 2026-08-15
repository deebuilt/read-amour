import { DEFAULT_BACKGROUND_ID, getBuiltinBackground } from '../design/backgrounds'
import { DEFAULT_TYPEFACE_ID } from '../design/typefaces'
import { color } from '../design/tokens'
import { monthName } from '../import/goodreads'
import {
  DEFAULT_GRID,
  GRID_LAYOUTS,
  gridCapacity,
  type Board,
  type Book,
  type GridConfig,
  type Slot,
} from '../types/domain'

/**
 * Board construction and mutation.
 *
 * Kept as pure functions rather than methods so the reducer in `useBoard` can
 * stay a thin dispatcher and every transition is independently testable.
 */

/**
 * Repair a board loaded from storage.
 *
 * Early boards were saved with the chrome ink token, which later became a CSS
 * custom property. A `var()` inside the poster cannot be resolved by
 * html-to-image, so such a board would export with no visible title. Boards
 * are cheap to fix and expensive to lose, so this migrates rather than resets.
 */
export function isOfferedGrid(grid: GridConfig): boolean {
  return GRID_LAYOUTS.some(
    (layout) => layout.columns === grid.columns && layout.rows === grid.rows,
  )
}

/**
 * Nearest offered shape to a grid the app no longer offers.
 *
 * Boards were once free to be any shape from 2x2 to 5x6, and the taller ones
 * stranded most of the frame in margin. Those still exist in storage.
 *
 * The one hard rule is that capacity may never shrink: a 2x6 board holds twelve
 * books, and mapping it to anything smaller would drop the overflow off the
 * poster. So this takes the smallest offered layout that still holds everything
 * the old one did — 2x6 becomes 4x3, same twelve slots, full frame width. Ties
 * on capacity go to the shape closest to the original's proportions, so a wide
 * board stays wide.
 *
 * A shape too big for anything offered falls to the largest, which can only
 * happen for 5x5 and 5x6 — both above the 20 the app now tops out at.
 */
export function nearestOfferedGrid(grid: GridConfig): GridConfig {
  if (isOfferedGrid(grid)) return grid

  const wanted = gridCapacity(grid)
  const aspect = grid.columns / grid.rows

  const closestAspect = (a: GridConfig, b: GridConfig): number =>
    Math.abs(a.columns / a.rows - aspect) - Math.abs(b.columns / b.rows - aspect)

  // Everything that still holds the board's books: take the tightest fit.
  const roomy = GRID_LAYOUTS.filter((layout) => gridCapacity(layout) >= wanted)
  if (roomy.length > 0) {
    return [...roomy].sort(
      (a, b) => gridCapacity(a) - gridCapacity(b) || closestAspect(a, b),
    )[0]
  }

  // Nothing holds them all — only 5x5 and 5x6, both above the new ceiling of
  // 20. Take the largest, and accept that the tail is dropped.
  return [...GRID_LAYOUTS].sort(
    (a, b) => gridCapacity(b) - gridCapacity(a) || closestAspect(a, b),
  )[0]
}

export function migrateBoard(board: Board): Board {
  let migrated = board

  // Grids taller than they are wide stranded up to 378px of margin per side.
  // Those boards predate the fixed catalogue of shapes and must be remapped.
  //
  // `resizeGrid` alone is not safe here: it keeps books by slot index, so a
  // board with a gap early on would drop a book off the end while empty slots
  // remained. A migration the user did not ask for must not cost her a book,
  // so the books are read out in order and re-placed from the top. The only
  // boards that still lose one are those holding more than the 20 any offered
  // poster can show, and no remapping can help those.
  if (!isOfferedGrid(migrated.grid)) {
    const books = bookIdsOnBoard(migrated)
    const grid = nearestOfferedGrid(migrated.grid)
    const capacity = gridCapacity(grid)

    migrated = {
      ...migrated,
      grid,
      slots: Array.from({ length: capacity }, (_, index) => ({
        index,
        bookId: books[index],
      })),
    }
  }

  // `linen` was a warm off-white so close to `paper` that the two were the
  // same swatch; it became the cooler `stone`. Boards still naming it would
  // otherwise fall back to `paper` and silently change appearance.
  if (migrated.background.kind === 'builtin' && migrated.background.id === 'linen') {
    migrated = { ...migrated, background: { kind: 'builtin', id: 'stone' } }
  }

  const ink = migrated.text.inkColor
  if (!ink.startsWith('var(')) return migrated

  // The only variable ever written here was the dark chrome ink.
  return { ...migrated, text: { ...migrated.text, inkColor: color.posterInkDark } }
}

export function currentMonthKey(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function emptySlots(grid: GridConfig): Slot[] {
  return Array.from({ length: grid.columns * grid.rows }, (_, index) => ({ index }))
}

/**
 * Create a poster.
 *
 * `month` is not a constraint on what the poster is — nothing in the app
 * enforces one, and a year-in-review or a themed list is just as valid. It
 * survives as the key the Goodreads importer groups rows by, and as the source
 * of the default title. The title is what the user actually sees and renames.
 */
export function createBoard(month: string = currentMonthKey(), title?: string): Board {
  const now = new Date().toISOString()
  const background = getBuiltinBackground(DEFAULT_BACKGROUND_ID)

  return {
    id: crypto.randomUUID(),
    month,
    text: {
      title: title?.trim() || monthName(month),
      subtitle: 'Reading',
      caption: undefined,
      typefaceId: DEFAULT_TYPEFACE_ID,
      inkColor: background.isLight ? color.posterInkDark : color.posterInk,
    },
    grid: DEFAULT_GRID,
    background: { kind: 'builtin', id: DEFAULT_BACKGROUND_ID },
    slots: emptySlots(DEFAULT_GRID),
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Resize the grid, preserving which book sits in which slot wherever the slot
 * still exists. Books in slots that fall outside the new grid are dropped from
 * the poster but remain in the library, so shrinking is not destructive.
 */
export function resizeGrid(board: Board, grid: GridConfig): Board {
  const capacity = grid.columns * grid.rows
  const kept = board.slots.filter((slot) => slot.index < capacity)
  const byIndex = new Map(kept.map((slot) => [slot.index, slot]))

  return {
    ...board,
    grid,
    slots: Array.from({ length: capacity }, (_, index) => byIndex.get(index) ?? { index }),
  }
}

export function setSlotBook(board: Board, index: number, bookId: string | undefined): Board {
  return {
    ...board,
    slots: board.slots.map((slot) => (slot.index === index ? { index, bookId } : slot)),
  }
}

/** Place books into slots in order, starting at the first empty one. */
export function fillSlots(board: Board, books: readonly Book[]): Board {
  const slots = [...board.slots]
  let cursor = 0

  for (const book of books) {
    while (cursor < slots.length && slots[cursor].bookId) cursor += 1
    if (cursor >= slots.length) break
    slots[cursor] = { index: cursor, bookId: book.id }
    cursor += 1
  }

  return { ...board, slots }
}

export function clearSlots(board: Board): Board {
  return { ...board, slots: emptySlots(board.grid) }
}

/** Move a book between slots, swapping if the destination is occupied. */
export function moveSlot(board: Board, from: number, to: number): Board {
  if (from === to) return board

  const fromSlot = board.slots.find((slot) => slot.index === from)
  const toSlot = board.slots.find((slot) => slot.index === to)
  if (!fromSlot) return board

  return {
    ...board,
    slots: board.slots.map((slot) => {
      if (slot.index === from) return { index: from, bookId: toSlot?.bookId }
      if (slot.index === to) return { index: to, bookId: fromSlot.bookId }
      return slot
    }),
  }
}

export function filledCount(board: Board): number {
  return board.slots.filter((slot) => slot.bookId).length
}

export function bookIdsOnBoard(board: Board): string[] {
  return board.slots
    .map((slot) => slot.bookId)
    .filter((id): id is string => id !== undefined)
}

/** Suggested ink for a background, so light grounds get dark type. */
export function inkForBackground(board: Board): string {
  if (board.background.kind === 'builtin') {
    return getBuiltinBackground(board.background.id).isLight
      ? color.posterInkDark
      : color.posterInk
  }
  // Uploads and custom colours are unknowable without sampling; white reads
  // acceptably over most photography and the user can flip it.
  return color.posterInk
}
