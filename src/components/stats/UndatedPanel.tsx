import { useCallback, useEffect, useState } from 'react'
import { DatePicker, Spin, Typography } from 'antd'
import dayjs from 'dayjs'
import { undatedBooks } from '../../domain/stats'
import { listBooks, saveBook } from '../../storage/db'
import type { Book } from '../../types/domain'
import styles from './UndatedPanel.module.css'

/**
 * Every book in the library with no finish date, and a date picker on each row.
 *
 * The stats footnote could always say *how many* books were missing a date. It
 * could not say *which*, and there was nowhere to go and find out: the book list
 * shows one poster, while the footnote counts the whole library. So a reader was
 * told eight books were missing and left to open posters one at a time hunting
 * for them — which is the app naming a problem and then making someone else do
 * the search.
 *
 * This is the answer to that footnote. It reads the whole library rather than a
 * board, for the same reason `useStats` does: a reading history is the library
 * or it is nothing.
 *
 * Rows disappear as they are dated. That is the point — the list is a queue that
 * empties, so its own length is the progress bar and finishing it is a visible
 * event rather than something the reader has to go and verify on the chart.
 */

const DATE_FORMAT = 'YYYY-MM-DD'

interface UndatedPanelProps {
  /**
   * Re-read the dashboard after dates change. Without it the charts keep showing
   * the numbers they were built with, which looks exactly like the dates not
   * having saved.
   */
  onDated: () => void
}

export function UndatedPanel({ onDated }: UndatedPanelProps) {
  const [books, setBooks] = useState<Book[] | undefined>()
  /**
   * Books dated during this visit, kept out of the list without re-reading it.
   *
   * Re-reading would drop the row instantly and re-sort everything under the
   * reader's thumb. Holding the id here lets the row leave on its own while the
   * rest of the list stays exactly where it was.
   */
  const [dated, setDated] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    void listBooks().then((all) => {
      if (!cancelled) setBooks(undatedBooks(all))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDate = useCallback(
    async (book: Book, iso: string | undefined) => {
      if (!iso) return
      await saveBook({ ...book, dateRead: iso })
      setDated((current) => new Set(current).add(book.id))
      onDated()
    },
    [onDated],
  )

  if (!books) {
    return (
      <div className={styles.loading}>
        <Spin />
      </div>
    )
  }

  const remaining = books.filter((book) => !dated.has(book.id))

  if (books.length === 0) {
    return (
      <div className={styles.done}>
        <Typography.Paragraph className={styles.doneLead}>
          Every book has a finish date.
        </Typography.Paragraph>
      </div>
    )
  }

  if (remaining.length === 0) {
    return (
      <div className={styles.done}>
        <Typography.Paragraph className={styles.doneLead}>
          That's all of them dated.
        </Typography.Paragraph>
        <Typography.Paragraph className={styles.doneBody}>
          Your charts now cover your whole library.
        </Typography.Paragraph>
      </div>
    )
  }

  return (
    <section className={styles.root}>
      <Typography.Paragraph className={styles.lead}>
        {remaining.length === 1
          ? 'One book has no finish date, so it stays off your charts.'
          : `${remaining.length} books have no finish date, so they stay off your charts.`}{' '}
        A rough date is worth more than none — the charts work by month.
      </Typography.Paragraph>

      <ol className={styles.list}>
        {remaining.map((book) => (
          <li key={book.id} className={styles.row}>
            <span className={styles.meta}>
              <span className={styles.title}>{book.title}</span>
              <span className={styles.author}>{book.author}</span>
            </span>
            <DatePicker
              // A book finished before the app existed is the normal case here,
              // so the picker opens on the month it is most likely to want.
              value={book.dateRead ? dayjs(book.dateRead, DATE_FORMAT) : null}
              onChange={(value) =>
                void handleDate(book, value ? value.format(DATE_FORMAT) : undefined)
              }
              format="D MMM YYYY"
              placeholder="Finished"
              className={styles.picker}
              inputReadOnly
            />
          </li>
        ))}
      </ol>
    </section>
  )
}
