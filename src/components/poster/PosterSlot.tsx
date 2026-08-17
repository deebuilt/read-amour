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
  /** Whether this is the poster's favourite, and takes the mark. */
  isFavourite: boolean
  /**
   * Cover-bleed mode: slots tile the frame edge to edge, so this one is no
   * longer 2:3 and its cover crops to fill rather than fitting.
   */
  isBleeding: boolean
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

/**
 * The crown, drawn rather than typed.
 *
 * A glyph would be at the mercy of whatever font resolved it: the Unicode crown
 * is emoji-presentation on most platforms, so it would arrive full-colour on
 * one device, monochrome on another, and as tofu where no font has it. That is
 * unacceptable for something baked into an exported PNG — the export must look
 * the same everywhere, and this is the one mark that cannot be allowed to
 * silently become a box.
 *
 * Five points and a band, on a 24x24 viewBox. Drawn flat, with no gradient or
 * inner detail, because at 4x4 the whole mark is 44px wide on the export canvas
 * and any interior line closes up into a smudge.
 */
function CrownMark({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 8.5l3.6 2.9L12 4l5.4 7.4L21 8.5l-1.7 9.6H4.7L3 8.5z"
        fill={color}
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The favourite mark: a crown in the top corner of the cover.
 *
 * Two wrong marks preceded it, and both failures are worth keeping.
 *
 * It was a **gold rule** across the foot first, argued for on the grounds that
 * a badge reads as UI chrome while a rule reads as artwork. Both true, and
 * still wrong: a horizontal line does not *mean* anything. It reads as a design
 * element, and on a busy cover it was not visible at all.
 *
 * So it became a **gold star** — which fixed the meaning and broke something
 * else. The poster already draws gold stars for ratings, so a favourite that
 * was also rated showed a gold star in the corner and four more along the foot:
 * same glyph, same colour, two unrelated meanings on one cover. A mark cannot
 * be the same symbol as the thing it must be distinguished from.
 *
 * A crown says "best of these" with no legend, and the app uses it nowhere
 * else — so it cannot be confused with a rating however many stars sit below
 * it. It also does not need to be gold to be understood, which frees the colour
 * to be the poster's own ink rather than a second accent.
 *
 * The chrome a badge risks is still avoided the same way: a soft radial glow
 * rather than a pill. A hard edge reads as UI stuck onto the art; a fade reads
 * as emphasis printed into it.
 *
 * Every value is a fraction of slot width, never fixed px — a mark tuned at 4x4
 * is a speck at 2x2. Same trap as `STAR_WIDTH_RATIO`, which has caught this
 * project twice.
 */
const FAVOURITE_MARK_RATIO = 0.2
const FAVOURITE_INSET_RATIO = 0.06

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
  isFavourite,
  isBleeding,
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

  /**
   * The favourite star.
   *
   * Top corner, which is the one part of a cover that is reliably quiet —
   * titles and author names sit centre and low, and the rating band already
   * owns the foot. Putting the two marks at opposite ends means a book that is
   * both rated and the favourite shows both without either being moved.
   */
  const favouriteSize = Math.round(slotWidth * FAVOURITE_MARK_RATIO)
  const favouriteInset = Math.round(slotWidth * FAVOURITE_INSET_RATIO)

  /**
   * In bleed mode the mark moves to the bottom corner.
   *
   * The poster's title overlays the covers there, sitting in a scrim 560px deep
   * — on a 2x2 bleed poster that is more than half of the top row, so a star in
   * the top corner would be dimmed by the scrim and crowded by the title. The
   * foot of the slot is free instead, because bleed forces the rating band off.
   *
   * Bottom-left rather than bottom-right, so the marks on the two lower slots
   * of a 2x2 do not collide with the caption running across the middle.
   */
  const favouriteAtFoot = isBleeding

  return (
    <div
      className={styles.slot}
      style={{
        // A coverless book keeps the tinted plate an empty slot has: its type
        // needs a ground to sit on, or it floats directly on the photograph.
        background: isFilled ? 'transparent' : fill.background,
        // No inset rule in bleed mode. The rules are what separate slots when
        // there are margins between them; with the covers meeting edge to edge
        // they would draw a grid over an image that is meant to read as one
        // surface. An empty slot still tints, so a gap is visible as absence
        // rather than as a framed hole.
        boxShadow: isFilled || isBleeding ? 'none' : `inset 0 0 0 1.5px ${fill.line}`,
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
      aria-label={
        book
          ? `${book.title} by ${book.author}${isFavourite ? '. Favourite of this poster' : ''}`
          : `Empty slot ${index + 1}`
      }
    >
      {coverUrl && (
        <img
          className={styles.cover}
          src={coverUrl}
          alt={book ? `${book.title} cover` : ''}
          draggable={false}
          /* Marks this as per-book artwork so the animation export can capture
             the poster once with no books placed — the ground its reveal
             composites against. See `Poster.module.css`.

             Every element in this slot drawn FROM A BOOK carries this, not only
             the cover image: the stars, the crown and the coverless fallback
             plate are all things that should be absent from an empty poster.
             Marking only the image left stars sitting in empty slots, and every
             arriving cover painted a second set on top of them. */
          data-ra-cover="true"
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
          data-ra-cover="true"
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

      {/*
        The favourite mark.

        White rather than gold, and that is the whole point of the change. Gold
        is the rating colour, so a gold mark on a rated book put the same colour
        and the same glyph in two places on one cover meaning two different
        things. A white crown on a dark scrim cannot be mistaken for a score.

        The glow is not decoration. Cover art is unpredictable by definition, so
        a mark of any single colour will land on a cover that swallows it — this
        is the problem the rating band solves with a scrim, at a size where a
        full band would be absurd. A radial fade gives the crown its own ground
        without an edge that would read as a badge stuck onto the artwork.

        Fixed hex throughout, like every colour that ends up inside the PNG.
      */}
      {isFavourite && (
        <div
          className={styles.favouriteMark}
          data-ra-cover="true"
          style={{
            top: favouriteAtFoot ? undefined : favouriteInset,
            bottom: favouriteAtFoot ? favouriteInset : undefined,
            left: favouriteAtFoot ? favouriteInset : undefined,
            right: favouriteAtFoot ? undefined : favouriteInset,
            width: favouriteSize,
            height: favouriteSize,
            // Sized from the mark so the fade stays in proportion at every grid
            // shape, and reaches past the crown rather than stopping at it.
            background: isCoverless
              ? 'none'
              : `radial-gradient(circle, rgba(12, 10, 9, 0.62) 0%, rgba(12, 10, 9, 0.42) 48%, rgba(12, 10, 9, 0) 74%)`,
          }}
        >
          {/* Over a coverless book's tinted plate there is no scrim, so the
              crown takes the poster's ink the way that book's type already
              does — a white mark would float on a pale poster. */}
          <CrownMark
            size={Math.round(favouriteSize * 0.62)}
            color={isCoverless ? inkColor : '#ffffff'}
          />
        </div>
      )}

      {isCoverless && book && (
        <div
          className={styles.fallback}
          data-ra-cover="true"
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
