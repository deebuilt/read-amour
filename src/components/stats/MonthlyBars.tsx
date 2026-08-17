import { Typography } from 'antd'
import { formatStatsMonth, monthInitial, type MonthCount } from '../../domain/stats'
import styles from './MonthlyBars.module.css'

/**
 * Books finished per month, twelve columns.
 *
 * Hand-built rather than charted. Recharts is around 100KB for what this is —
 * a flat list of labelled magnitudes with no axes to compute, no scales, no
 * interpolation, and no tooltips. Every bar is a div whose height is a
 * percentage of the tallest month, which is the entire calculation.
 *
 * No tooltips deliberately, and for the same reason the bottom bar has none:
 * this sits low in a drawer, so anything that opens on hover opens upward over
 * the content it is describing. The count sits above each bar instead, which is
 * a tooltip that never needed opening.
 *
 * Twelve bars fit at 375px comfortably; twelve *labels* do not, so months are
 * single initials and the full name lives on the column's `title` and in the
 * accessible label. A month with no reading keeps its column at zero height —
 * dropping it would compress the axis and make a three-month gap look like
 * three consecutive weeks.
 */

interface MonthlyBarsProps {
  months: MonthCount[]
  /** Opens that month's poster, when one exists. */
  onSelectMonth?: (month: string) => void
  /** Months that actually have a poster, so only those become buttons. */
  postersByMonth?: Set<string>
}

export function MonthlyBars({ months, onSelectMonth, postersByMonth }: MonthlyBarsProps) {
  const peak = Math.max(...months.map((entry) => entry.count), 1)

  return (
    <div className={styles.chart} role="list">
      {months.map((entry) => {
        const label = formatStatsMonth(entry.month)
        const hasPoster = postersByMonth?.has(entry.month) ?? false
        const canOpen = hasPoster && onSelectMonth !== undefined
        // A zero month still shows a sliver, so the column reads as an empty
        // month rather than as a rendering failure.
        const height = entry.count === 0 ? 2 : Math.max(6, (entry.count / peak) * 100)

        const column = (
          <>
            <span className={styles.count} aria-hidden>
              {entry.count > 0 ? entry.count : ''}
            </span>
            <span className={styles.track}>
              <span
                className={entry.count > 0 ? styles.bar : styles.barEmpty}
                style={{ height: `${height}%` }}
              />
            </span>
            <span className={styles.tick} aria-hidden>
              {monthInitial(entry.month)}
            </span>
          </>
        )

        return (
          <div key={entry.month} className={styles.column} role="listitem">
            {canOpen ? (
              <button
                type="button"
                className={styles.columnButton}
                title={`${label} — open this poster`}
                aria-label={`${label}, ${entry.count} ${entry.count === 1 ? 'book' : 'books'}. Open this poster.`}
                onClick={() => onSelectMonth(entry.month)}
              >
                {column}
              </button>
            ) : (
              <span
                className={styles.columnStatic}
                title={label}
                aria-label={`${label}, ${entry.count} ${entry.count === 1 ? 'book' : 'books'}`}
              >
                {column}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The count of books left off the chart, and the way to fix it.
 *
 * Undated books are excluded from the timeline because they cannot be placed on
 * it, and a reader whose library is half undated is looking at a chart of half
 * their reading. Saying so is the difference between a chart that is partial and
 * one that is quietly wrong.
 *
 * Saying it was not enough on its own. The count is over the whole library while
 * the book list shows one poster, so the reader was told a number and given
 * nowhere to go and see which books it meant — the only way to find them was to
 * open posters one at a time. The count is now the link to `UndatedPanel`, which
 * is the list this sentence is about.
 */
export function UndatedNote({ count, onFix }: { count: number; onFix?: () => void }) {
  if (count === 0) return null

  const sentence =
    count === 1
      ? "One book isn't on this chart — it has no finish date yet."
      : `${count} books aren't on this chart. They have no finish date yet.`

  if (!onFix) {
    return <Typography.Text className={styles.note}>{sentence}</Typography.Text>
  }

  return (
    <Typography.Text className={styles.note}>
      {sentence}{' '}
      <button type="button" className={styles.noteLink} onClick={onFix}>
        {count === 1 ? 'Add it' : 'Add them'}
      </button>
    </Typography.Text>
  )
}
