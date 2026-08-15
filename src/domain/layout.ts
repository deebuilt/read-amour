import { POSTER, poster as tokens } from '../design/tokens'
import { getTypeface } from '../design/typefaces'
import type { GridConfig, PosterText } from '../types/domain'

/**
 * Grid geometry for the poster.
 *
 * The grid is fitted to the space between the title band and the bottom
 * margin, rather than being drawn at a fixed slot size and hoping it lands
 * inside the canvas. Slots are constrained by BOTH the available width and the
 * available height, and the smaller constraint wins — that is what stops a
 * 5-row grid running off the bottom edge.
 *
 * The whole block is then centred in the space it was given, so a short grid
 * sits balanced instead of hugging the title.
 */

export interface GridLayout {
  slotWidth: number
  slotHeight: number
  /** Distance from the top of the canvas to the first row. */
  gridTop: number
  /** Total width of the grid block, for horizontal centring. */
  gridWidth: number
  gridHeight: number
}

/**
 * Height the title block actually occupies.
 *
 * Measured rather than assumed: the script face sets 24% larger than the
 * editorial one, and switching a title plate on adds its padding top and
 * bottom. A fixed band guessed for bare text puts the grid straight through
 * the bottom of a plated title — which is exactly what a fixed 190 did.
 */
export function titleBlockHeight(text: PosterText): number {
  const typeface = getTypeface(text.typefaceId)

  // Line-height is 1 on both, so the set size is the rendered height.
  const titleHeight = tokens.titleSize * typeface.titleScale
  const subtitleHeight = text.subtitle ? tokens.titleGap + tokens.subtitleSize : 0
  const plateHeight = text.titlePlate ? tokens.platePaddingY * 2 : 0

  return titleHeight + subtitleHeight + plateHeight
}

/** Clear space between the title block and the first row of covers. */
const TITLE_TO_GRID_GAP = 72

/**
 * Clear space between the last row of covers and the caption.
 *
 * Wider than it first needs to be. 24 was genuine clearance and still read as a
 * collision on the square grids — the handle sat directly under the last row
 * with a hairline between them, which looks like a mistake whatever the
 * arithmetic says. This is the gap that makes the caption look placed rather
 * than pushed against the grid, and it is close to the 72 between the title and
 * the first row, which is the poster's own precedent for separating a band of
 * type from the covers.
 */
const GRID_TO_CAPTION_GAP = 64

/**
 * Bottom space the grid may not claim, given what is actually printed there.
 *
 * `gridBottomMin` is the floor a tall grid may shrink the bottom margin to, and
 * it was set for a poster whose bottom edge held at most a line of small type.
 * A caption with a plate is taller than that allowance assumed: the plate adds
 * its padding top and bottom, and on the square grids — 2x2, 3x3, 4x4, which
 * are the shapes that claim the generous height — that pushed the last row
 * about 2px into the handle.
 *
 * Two pixels is invisible in a preview and reads as tight spacing rather than a
 * bug, so this is the kind of thing that ships and turns up later as covers
 * touching the handle. The floor is therefore derived from what is below it
 * rather than being a constant that has to be remembered.
 */
function bottomReserve(text?: PosterText): number {
  if (!text?.caption) return tokens.gridBottomMin

  const plateHeight = text.titlePlate ? tokens.captionPlatePaddingY * 2 : 0
  const captionBlock = tokens.captionSize + plateHeight

  return Math.max(
    tokens.gridBottomMin,
    tokens.captionBottom + captionBlock + GRID_TO_CAPTION_GAP,
  )
}

/**
 * Cover-bleed geometry: the frame, divided.
 *
 * Nothing is fitted here and nothing is centred, because there is no leftover
 * space to distribute — the slots tile the canvas exactly. The 2:3 lock does
 * not apply either: slots take whatever aspect the grid demands and the covers
 * crop into them.
 *
 * That deliberately breaks the app's oldest promise, the one written into
 * `tokens.slotAspectRatio` — "slots match 2:3 so covers never crop". Cropping
 * is the entire point of a bleed layout, so for this mode only it is correct.
 * `supportsCoverBleed` is what keeps it honest: it restricts the mode to the
 * shapes where the crop is a 16% trim rather than a mutilation.
 */
function bleedLayout(grid: GridConfig): GridLayout {
  const slotWidth = POSTER.width / grid.columns
  const slotHeight = POSTER.height / grid.rows

  return {
    slotWidth,
    slotHeight,
    gridTop: 0,
    gridWidth: POSTER.width,
    gridHeight: POSTER.height,
  }
}

export function layoutGrid(
  grid: GridConfig,
  text?: PosterText,
  coverBleed = false,
): GridLayout {
  if (coverBleed) return bleedLayout(grid)

  const { columns, rows } = grid
  const gap = tokens.gridGap

  const availableWidth = POSTER.width - tokens.marginX * 2
  // Falls back to the nominal band when no text is supplied, so callers that
  // only care about slot size need not thread it through.
  const measured = text ? titleBlockHeight(text) + TITLE_TO_GRID_GAP : tokens.titleBand
  const bandTop = tokens.titleTop + measured

  // A tall grid may claim part of the bottom clearance rather than shrinking
  // sideways and stranding wide empty margins. The title band is never
  // encroached on — the month has to breathe — but the bottom reserve can
  // give back down to its floor. That floor is only as low as whatever is
  // printed along the bottom edge allows: a plated caption needs more room
  // than a bare one, and more than a poster with no caption at all.
  const generousHeight = POSTER.height - bandTop - bottomReserve(text)
  const comfortableHeight = POSTER.height - bandTop - tokens.gridBottom

  const widthConstrained = (availableWidth - gap * (columns - 1)) / columns

  const fitsHeight = (height: number): number =>
    ((height - gap * (rows - 1)) / rows) * tokens.slotAspectRatio

  // Prefer the comfortable bottom margin; fall back to the generous height
  // only when doing so keeps more of the frame's width in use.
  const comfortable = Math.min(widthConstrained, fitsHeight(comfortableHeight))
  const generous = Math.min(widthConstrained, fitsHeight(generousHeight))

  const slotWidth = generous > comfortable ? generous : comfortable
  const slotHeight = slotWidth / tokens.slotAspectRatio

  const gridWidth = slotWidth * columns + gap * (columns - 1)
  const gridHeight = slotHeight * rows + gap * (rows - 1)

  // Centre in whichever band was actually used, so leftover space is shared
  // above and below rather than all falling to the bottom.
  const usedHeight = slotWidth === generous ? generousHeight : comfortableHeight
  const gridTop = bandTop + (usedHeight - gridHeight) / 2

  return { slotWidth, slotHeight, gridTop, gridWidth, gridHeight }
}
