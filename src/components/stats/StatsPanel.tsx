import { useMemo, useState } from 'react'
import { Button, Spin, Typography } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import { MonthlyBars, UndatedNote } from './MonthlyBars'
import { RatingBars } from './RatingBars'
import { UndatedPanel } from './UndatedPanel'
import { useStats } from '../../hooks/useStats'
import { MIN_DATED_FOR_CHARTS, MIN_RATED_FOR_DISTRIBUTION } from '../../domain/stats'
import type { Board } from '../../types/domain'
import styles from './StatsPanel.module.css'

/**
 * The reading dashboard.
 *
 * Type carries this, not decoration. No card grid — three cards in a row is
 * named in the global visual rules as the clearest AI tell, and a stats page is
 * where that temptation is strongest. What is here instead is a typographic
 * list: a big number in the display face, a quiet label beside it, and two
 * charts drawn in the app's own accent.
 *
 * ## The empty states are the hard part
 *
 * Most readers open this with a thin library, and the failure mode is a page of
 * zeroes and empty axes reading "there is nothing here" when the truth is "keep
 * going and this fills in." So there are three distinct empty states rather than
 * one, because they have three different answers:
 *
 *   - no books at all      → the library is empty, and importing fills it
 *   - books, but no dates  → the books exist and the dates do not, which is the
 *                            likely case for anyone who built posters by search
 *   - too few dated books  → name what unlocks the charts, do not draw an axis
 *
 * The undated case is worth its own message. `dateRead` has only ever been
 * needed for grouping an import, so a reader who searched her way to a full
 * library has every book and an empty dashboard. This is the first feature that
 * gives the date a second reason to exist, so the page asks for it where it is
 * missing.
 */

interface StatsPanelProps {
  /** Every saved poster, so a timeline bar can open the month it belongs to. */
  boards: Board[]
  /** Switch to the poster for a month. */
  onOpenMonth: (month: string) => void
  /** Send the reader to the Goodreads import, from the empty state. */
  onImport: () => void
  /** Send the reader to the book list, where a finish date is set. */
  onOpenBooks: () => void
}

export function StatsPanel({ boards, onOpenMonth, onImport, onOpenBooks }: StatsPanelProps) {
  const { stats, isLoading, reload } = useStats()
  /**
   * The undated list is a mode of this panel, not a separate drawer.
   *
   * The reader got here by tapping a sentence under the chart — they are
   * answering a question the chart asked, and sending them to a different
   * destination would lose that thread. Coming back lands on the dashboard with
   * the new dates already in it.
   */
  const [isFixingDates, setIsFixingDates] = useState(false)

  /**
   * Months that have a poster, and the board to open for each.
   *
   * Two posters may legitimately share a month — a month poster and a
   * year-in-review can both sit in December — so this keeps the first, which is
   * the newest by `listBoards`' own ordering.
   */
  const postersByMonth = useMemo(() => {
    const map = new Map<string, string>()
    boards.forEach((board) => {
      if (!map.has(board.month)) map.set(board.month, board.id)
    })
    return map
  }, [boards])

  const monthsWithPosters = useMemo(
    () => new Set(postersByMonth.keys()),
    [postersByMonth],
  )

  if (isFixingDates) {
    return (
      <div className={styles.root}>
        <Button
          type="text"
          size="small"
          icon={<LeftOutlined />}
          className={styles.back}
          onClick={() => setIsFixingDates(false)}
        >
          Stats
        </Button>
        <UndatedPanel onDated={reload} />
      </div>
    )
  }

  if (isLoading || !stats) {
    return (
      <div className={styles.loading}>
        <Spin />
      </div>
    )
  }

  if (stats.totalBooks === 0) {
    return (
      <div className={styles.empty}>
        <Typography.Paragraph className={styles.emptyLead}>
          Nothing to count yet.
        </Typography.Paragraph>
        <Typography.Paragraph className={styles.emptyBody}>
          Add books to a poster, or bring your whole history over from Goodreads.{' '}
          <button type="button" className={styles.link} onClick={onImport}>
            Import a CSV
          </button>
          .
        </Typography.Paragraph>
      </div>
    )
  }

  const hasCharts = stats.datedCount >= MIN_DATED_FOR_CHARTS
  const hasRatings = stats.ratings.ratedCount >= MIN_RATED_FOR_DISTRIBUTION

  return (
    <div className={styles.root}>
      {stats.lines.length > 0 && (
        <section className={styles.section}>
          <dl className={styles.numbers}>
            {stats.lines.map((line) => (
              <div key={line.key} className={styles.numberRow}>
                <dt className={styles.numberLabel}>{line.label}</dt>
                <dd className={styles.numberValue}>{line.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {stats.timeline && (
        <section className={styles.section}>
          <Typography.Text className={styles.heading}>Books a month</Typography.Text>
          <MonthlyBars
            months={stats.timeline}
            postersByMonth={monthsWithPosters}
            onSelectMonth={(month) => {
              const id = postersByMonth.get(month)
              if (id) onOpenMonth(id)
            }}
          />
          <UndatedNote
            count={stats.undatedCount}
            onFix={() => setIsFixingDates(true)}
          />
        </section>
      )}

      {hasRatings && (
        <section className={styles.section}>
          <Typography.Text className={styles.heading}>How you rate</Typography.Text>
          <RatingBars ratings={stats.ratings} />
        </section>
      )}

      {stats.observations.length > 0 && (
        <section className={styles.section}>
          <Typography.Text className={styles.heading}>What that adds up to</Typography.Text>
          <ul className={styles.observations}>
            {stats.observations.map((observation) => (
              <li key={observation.key} className={styles.observation}>
                {observation.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        The books exist; their finish dates do not. Distinct from having too few
        books, and it has a different answer — the reader is not short of
        reading, she is short of dates, and the place to add one is two taps
        away in the book list.
      */}
      {!hasCharts && stats.undatedCount > 0 && (
        <section className={styles.section}>
          <Typography.Paragraph className={styles.emptyBody}>
            {stats.datedCount === 0
              ? `None of your ${stats.totalBooks} books have a finish date yet, so there is nothing to chart over time.`
              : `Only ${stats.datedCount} of your ${stats.totalBooks} books have a finish date, so the charts stay hidden until there are ${MIN_DATED_FOR_CHARTS}.`}{' '}
            <button
              type="button"
              className={styles.link}
              onClick={() => setIsFixingDates(true)}
            >
              Add the missing dates
            </button>
            , or set one on a single book from{' '}
            <button type="button" className={styles.link} onClick={onOpenBooks}>
              the book list
            </button>
            .
          </Typography.Paragraph>
        </section>
      )}

      {!hasCharts && stats.undatedCount === 0 && (
        <section className={styles.section}>
          <Typography.Paragraph className={styles.emptyBody}>
            Charts turn on at {MIN_DATED_FOR_CHARTS} finished books. You have{' '}
            {stats.datedCount}.
          </Typography.Paragraph>
        </section>
      )}
    </div>
  )
}
