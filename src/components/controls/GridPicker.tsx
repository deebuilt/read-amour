import { Typography } from 'antd'
import { GRID_LAYOUTS, gridCapacity, type GridConfig } from '../../types/domain'
import styles from './GridPicker.module.css'

/**
 * Poster layout picker.
 *
 * This replaced a pair of columns/rows sliders, and the reason is worth
 * keeping. The sliders let the user reach any shape from 2x2 to 5x6, but only
 * the square-or-wider ones fill the poster — the rest strand the frame in
 * margin (see `GRID_LAYOUTS`). So the sliders asked her to solve a geometry
 * problem in order to answer the question she actually had, which is how many
 * books fit.
 *
 * The offered shapes all fill the frame, so the choice is safe whichever way
 * she goes. Each is labelled by capacity first, because that is how the
 * decision is made, with the shape underneath because on a poster the
 * arrangement is a real preference and not just an implementation detail.
 */

interface GridPickerProps {
  value: GridConfig
  onChange: (grid: GridConfig) => void
  /** Books currently on the poster, to flag layouts that would drop some. */
  filled: number
}

export function GridPicker({ value, onChange, filled }: GridPickerProps) {
  return (
    <div className={styles.options}>
      {GRID_LAYOUTS.map((layout) => {
        const capacity = gridCapacity(layout)
        const isActive = layout.columns === value.columns && layout.rows === value.rows
        const drops = Math.max(0, filled - capacity)

        return (
          <button
            key={`${layout.columns}x${layout.rows}`}
            type="button"
            className={isActive ? styles.optionActive : styles.option}
            onClick={() => onChange(layout)}
            aria-pressed={isActive}
            aria-label={
              `${capacity} book${capacity === 1 ? '' : 's'}, ` +
              `${layout.columns} across by ${layout.rows} down` +
              (drops > 0 ? `. Drops ${drops} from the poster` : '')
            }
            title={drops > 0 ? `${drops} book${drops === 1 ? '' : 's'} would come off` : undefined}
          >
            <span
              className={styles.preview}
              style={{ gridTemplateColumns: `repeat(${layout.columns}, 1fr)` }}
              aria-hidden
            >
              {Array.from({ length: capacity }, (_, index) => (
                <span key={index} className={styles.cell} />
              ))}
            </span>

            <span className={styles.count}>{capacity}</span>
            <Typography.Text className={styles.shape}>
              {layout.columns} × {layout.rows}
            </Typography.Text>
          </button>
        )
      })}
    </div>
  )
}
