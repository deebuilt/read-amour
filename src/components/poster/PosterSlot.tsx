import { isLightInk } from '../../design/inkColors'
import type { Book } from '../../types/domain'
import styles from './PosterSlot.module.css'

/**
 * One cell of the grid.
 *
 * Empty slots render as the translucent rectangles these reading templates
 * use — they are part of the artwork, not a placeholder, so they stay in the
 * exported PNG. What does not export is the interaction affordance, which is
 * why `isExporting` exists.
 */

interface PosterSlotProps {
  index: number
  book?: Book
  coverUrl?: string
  /** The poster's ink colour, which the empty-slot fill is derived from. */
  inkColor: string
  /** The poster's typeface, so a coverless book is set in the poster's own type. */
  fontFamily: string
  /** Whether a rated book shows its stars over the cover. */
  showRating: boolean
  /**
   * This slot's width in export pixels. Stars are sized from it — a fixed size
   * looks right at one grid shape and wrong at every other, and a 2x2 grid has
   * slots nearly three times the width of a 5x6's.
   */
  slotWidth: number
  isExporting: boolean
  onClick?: (index: number) => void
}

/**
 * Empty slots are tinted with the poster's own ink at low alpha rather than a
 * fixed white. A flat white wash reads as a solid grey block on a dark ground —
 * which is exactly what it looked like before this was derived.
 *
 * Keyed on the ink's luminance rather than an equality check, so any custom
 * colour picked out of a background image still produces a sensible slot.
 */
/**
 * Star height as a fraction of slot width. Tuned so five stars sit a little
 * over half the slot across, which holds at every grid shape.
 */
const STAR_WIDTH_RATIO = 0.13

/**
 * Star gold, and its shadow.
 *
 * Fixed hex, never a token — these end up inside the exported PNG, where a CSS
 * custom property cannot be resolved. Warm enough to read as gold against cover
 * art without going orange on a warm-toned cover.
 */
const STAR_GOLD = '#f0b429'
const STAR_SHADOW = 'rgba(12, 10, 9, 0.55)'

function emptyFill(inkColor: string): { background: string; line: string } {
  return isLightInk(inkColor)
    ? { background: 'rgba(255, 255, 255, 0.16)', line: 'rgba(255, 255, 255, 0.30)' }
    : { background: 'rgba(28, 26, 23, 0.13)', line: 'rgba(28, 26, 23, 0.22)' }
}

export function PosterSlot({
  index,
  book,
  coverUrl,
  inkColor,
  fontFamily,
  showRating,
  slotWidth,
  isExporting,
  onClick,
}: PosterSlotProps) {
  const isFilled = Boolean(coverUrl)
  /**
   * A book with no cover art is a distinct state from an empty slot, and used
   * to be indistinguishable from one — Open Library simply has no image for
   * some editions, so the slot rendered blank and the book looked lost.
   *
   * It gets a typeset panel instead: the title, and the author if there is
   * room. That reads as a deliberate part of the poster rather than a hole,
   * and it exports as one, since it is real DOM at the export size like
   * everything else here.
   */
  const isCoverless = Boolean(book) && !coverUrl
  const fill = emptyFill(inkColor)

  /**
   * Filled stars only, so a 3-star book shows three marks rather than three
   * bright and two dim — the dim ones read as artefacts at poster scale. An
   * unrated book shows nothing at all, which is the honest representation of
   * "no rating" and keeps the grid from implying a zero.
   */
  const ratedStars =
    book?.rating !== undefined && book.rating > 0
      ? '★'.repeat(Math.min(5, Math.round(book.rating)))
      : undefined

  /**
   * Stars are a fraction of the slot, not a fixed size.
   *
   * Five stars plus their tracking occupy a little over half the slot's width
   * at this ratio, which reads as deliberate at every grid shape — a 2x2 poster
   * has slots close to three times the width of a 5x6's, and a fixed size that
   * suits one looks like a typo on the other.
   */
  const starSize = Math.round(slotWidth * STAR_WIDTH_RATIO)
  const bandPadding = Math.round(starSize * 0.42)

  return (
    <div
      className={styles.slot}
      style={{
        // A coverless book keeps the tinted plate an empty slot has: its type
        // needs a ground to sit on, or it floats directly on the photograph.
        background: isFilled ? 'transparent' : fill.background,
        boxShadow: isFilled ? 'none' : `inset 0 0 0 1.5px ${fill.line}`,
        cursor: isExporting ? 'default' : 'pointer',
      }}
      onClick={isExporting ? undefined : () => onClick?.(index)}
      role={isExporting ? undefined : 'button'}
      tabIndex={isExporting ? undefined : 0}
      onKeyDown={
        isExporting
          ? undefined
          : (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick?.(index)
              }
            }
      }
      aria-label={book ? `${book.title} by ${book.author}` : `Empty slot ${index + 1}`}
    >
      {coverUrl && (
        <img
          className={styles.cover}
          src={coverUrl}
          alt={book ? `${book.title} cover` : ''}
          draggable={false}
        />
      )}

      {/*
        Stars sit in a gradient band across the foot of the cover rather than
        floating on the art: cover design is unpredictable, and white stars on a
        pale cover vanish. The scrim guarantees contrast on any image.

        Fixed hex throughout — this ends up inside the exported PNG, and
        html-to-image cannot resolve a CSS variable.
      */}
      {showRating && ratedStars !== undefined && (
        <div
          className={styles.ratingBand}
          style={{
            paddingTop: isCoverless ? bandPadding : bandPadding * 2,
            paddingBottom: bandPadding,
            // Over cover art the scrim earns its place. Over the tinted plate
            // of a coverless book there is nothing to scrim, and a dark wash on
            // a light poster would read as a smudge.
            background: isCoverless ? 'none' : undefined,
          }}
        >
          <span
            className={styles.ratingStars}
            style={{
              fontSize: starSize,
              letterSpacing: Math.round(starSize * 0.08),
              // A coverless book's stars take the poster ink, since they sit on
              // the tinted plate rather than on art that needs contrast.
              color: isCoverless ? inkColor : STAR_GOLD,
              textShadow: isCoverless ? 'none' : `0 ${Math.round(starSize * 0.06)}px ${Math.round(starSize * 0.14)}px ${STAR_SHADOW}`,
            }}
            aria-hidden="true"
          >
            {ratedStars}
          </span>
        </div>
      )}

      {isCoverless && book && (
        <div
          className={styles.fallback}
          style={{
            color: inkColor,
            fontFamily,
            // Clear the star band when one is showing, so the title does not
            // sit under it on a book with no cover art.
            paddingBottom:
              showRating && ratedStars !== undefined ? starSize + bandPadding * 2 : undefined,
          }}
        >
          <span className={styles.fallbackTitle}>{book.title}</span>
          <span className={styles.fallbackAuthor}>{book.author}</span>
        </div>
      )}
    </div>
  )
}
