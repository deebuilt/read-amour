import { Typography } from 'antd'
import type { RatingBreakdown } from '../../domain/stats'
import styles from './RatingBars.module.css'

/**
 * How many one-star, two-star, and so on. Five horizontal bars.
 *
 * Horizontal because the labels are stars, and five stars set vertically under a
 * column is either rotated type or an unreadable stack. Along the left edge they
 * read straight down as a scale.
 *
 * Bars are a percentage of the tallest bar, not of the library. Against the
 * library, a reader with 80% five-star books gets one full bar and four slivers
 * so short the counts beside them are the only thing legible — which makes the
 * chart a worse version of the numbers it sits next to.
 *
 * `rating: 0` is never a bar. It is Goodreads' encoding for unrated, the app
 * kept it, and counting it as a zero-star review would turn every book someone
 * simply never got around to rating into a savaging. The unrated count is
 * reported under the chart in words instead.
 */

interface RatingBarsProps {
  ratings: RatingBreakdown
}

export function RatingBars({ ratings }: RatingBarsProps) {
  const peak = Math.max(...ratings.counts.map((entry) => entry.count), 1)

  return (
    <div className={styles.root}>
      <ol className={styles.rows}>
        {/* Five at the top: a rating scale is read downward from best, and the
            shape most readers have is top-heavy, so this puts the mass first. */}
        {[...ratings.counts].reverse().map((entry) => (
          <li key={entry.stars} className={styles.row}>
            <span className={styles.stars} aria-hidden>
              {'★'.repeat(entry.stars)}
            </span>
            <span className={styles.track}>
              <span
                className={entry.count > 0 ? styles.bar : styles.barEmpty}
                style={{ width: `${entry.count === 0 ? 0 : Math.max(2, (entry.count / peak) * 100)}%` }}
              />
            </span>
            <span className={styles.count}>
              <span className={styles.srOnly}>
                {entry.stars} {entry.stars === 1 ? 'star' : 'stars'}:{' '}
              </span>
              {entry.count}
            </span>
          </li>
        ))}
      </ol>

      <div className={styles.footnotes}>
        {ratings.mean !== undefined && (
          <Typography.Text className={styles.mean}>
            {ratings.mean.toFixed(1)} average over {ratings.ratedCount}{' '}
            {ratings.ratedCount === 1 ? 'book' : 'books'}
          </Typography.Text>
        )}
        {ratings.unratedCount > 0 && (
          <Typography.Text className={styles.note}>
            {ratings.unratedCount === 1
              ? 'One book has no rating.'
              : `${ratings.unratedCount} books have no rating.`}
          </Typography.Text>
        )}
      </div>
    </div>
  )
}
