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
  isExporting,
  onClick,
}: PosterSlotProps) {
  const isFilled = Boolean(coverUrl)
  const fill = emptyFill(inkColor)

  return (
    <div
      className={styles.slot}
      style={{
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
    </div>
  )
}
