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

export function layoutGrid(grid: GridConfig, text?: PosterText): GridLayout {
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
  // give back down to its floor.
  const generousHeight = POSTER.height - bandTop - tokens.gridBottomMin
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
