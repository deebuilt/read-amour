import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Popconfirm, Progress, Typography, Upload } from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import {
  parseGoodreadsCsv,
  formatMonth,
  groupByMonth,
  type ImportResult,
} from '../../import/goodreads'
import { resolveCoversForBooks, type BatchProgress } from '../../api/covers'
import { deleteBooks, listUnplacedBooks, markBooksPlaced, saveBooks } from '../../storage/db'
import { color, fontSize } from '../../design/tokens'
import { MAX_GRID_CAPACITY, type Book } from '../../types/domain'
import styles from './ImportPanel.module.css'

/**
 * Goodreads CSV import.
 *
 * Two stages, deliberately separated: parsing is instant and local, while
 * cover resolution is dozens of network calls. Showing the month list straight
 * after the parse means the user picks a month while covers are still
 * arriving, rather than watching a spinner before seeing anything.
 *
 * **Two doors onto one list.** Drop a CSV, or open what is already stored.
 * `ImportResult` used to live only in this component's state, so closing the
 * drawer threw the month list away and the only way back was to find the file
 * and drop it again — an app making the reader re-import a file whose every row
 * it already held. Nothing was ever lost from storage; what died with the
 * drawer was the grouping, and `dateRead` is on every record, so it rebuilds
 * from IndexedDB exactly as it was built from the file.
 *
 * Both doors hand the same `Map<string, Book[]>` to the same rows, and the
 * panel below does not know which one it came through.
 */

interface ImportPanelProps {
  /** Called with the chosen month's books, once their covers are resolved. */
  onUseMonth: (month: string, books: Book[]) => void
  /**
   * Months that already have a saved poster.
   *
   * This is how the panel survives interruption. A full library is worked
   * through one month at a time, and that can span sessions — so rather than
   * tracking progress in state that a closed tab would lose, the list reads
   * the saved posters themselves. Close the tab, come back tomorrow, drop the
   * same CSV: the months you finished are still marked, because their posters
   * are still there.
   */
  usedMonths: ReadonlySet<string>
  /**
   * Create a poster for every month at once, without fetching any covers.
   *
   * Making the posters is instant — they are small records — while covers are
   * one network request per book, which is the entire cost of an import. So
   * this splits the two: the whole reading history becomes posters immediately,
   * and covers are filled in per month, on the months worth making.
   */
  onCreateAll: (months: { month: string; books: Book[] }[]) => Promise<void>
}

export function ImportPanel({ onUseMonth, usedMonths, onCreateAll }: ImportPanelProps) {
  const [isCreatingAll, setIsCreatingAll] = useState(false)
  const [result, setResult] = useState<ImportResult | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [progress, setProgress] = useState<BatchProgress | undefined>()
  const [busyMonth, setBusyMonth] = useState<string | undefined>()
  /**
   * Books sitting in storage that came in on a CSV and were never placed.
   *
   * Read on mount, so the drawer opens showing what is already there rather
   * than an empty dropzone above a library the app is holding.
   */
  const [stored, setStored] = useState<Book[] | undefined>()
  const [isClearing, setIsClearing] = useState(false)

  const readStored = useCallback(async () => {
    setStored(await listUnplacedBooks())
  }, [])

  useEffect(() => {
    void readStored()
  }, [readStored])

  /**
   * The month list, from whichever door supplied it.
   *
   * A fresh parse wins while it is on screen: the reader just dropped that
   * file and the months they expect to see are its months. Otherwise the
   * stored rows are grouped, which is the same list the last drop produced
   * minus whatever has since been placed.
   */
  const months = useMemo(() => {
    if (result) return result.byMonth
    if (!stored) return undefined
    return groupByMonth(stored).byMonth
  }, [result, stored])

  const undatedCount = useMemo(() => {
    if (result) return result.undatedCount
    if (!stored) return 0
    return groupByMonth(stored).undatedCount
  }, [result, stored])

  const totalCount = result ? result.books.length : (stored?.length ?? 0)

  const remainingCount = useMemo(() => {
    if (!months) return 0
    return [...months.keys()].filter((month) => !usedMonths.has(month)).length
  }, [months, usedMonths])

  const handleCreateAll = useCallback(async () => {
    if (!months) return
    setIsCreatingAll(true)
    try {
      await onCreateAll(
        [...months.entries()]
          .filter(([month]) => !usedMonths.has(month))
          .map(([month, books]) => ({ month, books })),
      )
      await readStored()
    } finally {
      setIsCreatingAll(false)
    }
  }, [months, usedMonths, onCreateAll, readStored])

  /**
   * Discard the rows nobody adopted.
   *
   * Scoped to `imported === true` by `listUnplacedBooks`, so it can only ever
   * reach books that arrived in a CSV and never landed on a poster. A book
   * placed and later removed stays unflagged and survives this — the flag is
   * never re-set, precisely so this button cannot delete something the reader
   * chose by hand.
   */
  const handleClearStored = useCallback(async () => {
    if (!stored || stored.length === 0) return
    setIsClearing(true)
    try {
      await deleteBooks(stored.map((book) => book.id))
      setResult(undefined)
      await readStored()
    } finally {
      setIsClearing(false)
    }
  }, [stored, readStored])

  const handleFile = useCallback(async (file: File) => {
    setError(undefined)
    setResult(undefined)
    try {
      const parsed = await parseGoodreadsCsv(file)
      if (parsed.books.length === 0) {
        setError('No finished books found. This importer reads the "read" shelf.')
        return false
      }
      await saveBooks(parsed.books)
      setResult(parsed)
      await readStored()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that file.')
    }
    return false
  }, [readStored])

  const handleMonth = useCallback(
    async (month: string, books: Book[]) => {
      setBusyMonth(month)
      setProgress({ completed: 0, total: books.length, currentTitle: '' })

      const covers = await resolveCoversForBooks(books, setProgress)

      const withCovers = books.map((book) => {
        const coverBlobKey = covers.get(book.id)
        return coverBlobKey ? { ...book, coverBlobKey } : book
      })
      await saveBooks(withCovers)

      // Adopted before the poster is announced, and awaited here rather than
      // left to `onUseMonth`. That prop returns void — App fires it with
      // `void handleUseMonth(...)` — so this component cannot wait on a write
      // made inside it, and refreshing the list first would re-read storage
      // before the flag had been cleared and show the month as still unplaced.
      await markBooksPlaced(withCovers.map((book) => book.id))

      setProgress(undefined)
      setBusyMonth(undefined)
      onUseMonth(month, withCovers)
      await readStored()
    },
    [onUseMonth, readStored],
  )

  return (
    <div className={styles.root}>
      <Typography.Paragraph style={{ fontSize: fontSize.sm, color: color.inkSoft }}>
        Goodreads shut off its API, but you can still export your library.
        On Goodreads, open <b>My Books</b>, then <b>Import and export</b>, then{' '}
        <b>Export Library</b>. Drop the CSV here.
      </Typography.Paragraph>

      <Upload.Dragger accept=".csv" showUploadList={false} beforeUpload={(file) => handleFile(file)}>
        <p className={styles.dragText}>Drop your Goodreads CSV</p>
        <p className={styles.dragHint}>or tap to choose the file</p>
      </Upload.Dragger>

      <Typography.Paragraph style={{ fontSize: fontSize.xs, color: color.inkFaint, margin: 0 }}>
        Pick the books you want on a poster. Anything you don&rsquo;t pick stays
        stored on this device, so you can come back and add it later. Only books
        on a poster count toward your stats.
      </Typography.Paragraph>

      {error && <Alert type="error" message={error} showIcon />}

      {progress && (
        <div className={styles.progress}>
          <Progress
            percent={Math.round((progress.completed / progress.total) * 100)}
            size="small"
            status="active"
          />
          <Typography.Text style={{ fontSize: fontSize.xs, color: color.inkFaint }}>
            Finding covers — {progress.completed} of {progress.total}
          </Typography.Text>
        </div>
      )}

      {months && months.size > 0 && (
        <div className={styles.months}>
          <Typography.Text className={styles.label}>
            {result ? 'In this file' : 'Already imported'}
          </Typography.Text>
          <Typography.Text style={{ fontSize: fontSize.xs, color: color.inkFaint }}>
            {totalCount} {totalCount === 1 ? 'book' : 'books'}
            {undatedCount > 0 && ` · ${undatedCount} with no date`}
            {remainingCount > 0 && ` · ${remainingCount} months to go`}
          </Typography.Text>

          {remainingCount > 1 && (
            <div className={styles.createAll}>
              <Button block loading={isCreatingAll} onClick={() => void handleCreateAll()}>
                Make all {remainingCount} posters
              </Button>
              <Typography.Text style={{ fontSize: fontSize.xs, color: color.inkFaint }}>
                Instant, without cover art — the books go on, then use a month below to
                fetch its covers.
              </Typography.Text>
            </div>
          )}

          {[...months.entries()].map(([month, books]) => {
            const isUsed = usedMonths.has(month)
            // A month with more books than the biggest grid holds cannot fit;
            // saying so here beats silently dropping the overflow on tap.
            const overflow = Math.max(0, books.length - MAX_GRID_CAPACITY)

            return (
              <div key={month} className={styles.month}>
                <div className={styles.monthMeta}>
                  <span className={styles.monthName}>{formatMonth(month)}</span>
                  <span className={styles.monthCount} style={{ color: color.inkFaint }}>
                    {books.length} {books.length === 1 ? 'book' : 'books'}
                    {overflow > 0 && ` · ${overflow} won't fit`}
                  </span>
                </div>
                <Button
                  size="small"
                  type={isUsed ? 'text' : 'default'}
                  icon={isUsed ? <CheckOutlined /> : undefined}
                  onClick={() => void handleMonth(month, books)}
                  loading={busyMonth === month}
                  disabled={busyMonth !== undefined}
                >
                  {isUsed ? 'Again' : 'Use'}
                </Button>
              </div>
            )
          })}

          {stored && stored.length > 0 && (
            <div className={styles.clear}>
              <Popconfirm
                title="Clear stored books"
                description={`Removes ${stored.length} ${
                  stored.length === 1 ? 'book' : 'books'
                } you never put on a poster. Posters keep their books.`}
                okText="Clear"
                cancelText="Keep"
                onConfirm={() => void handleClearStored()}
              >
                <Button block type="text" danger loading={isClearing}>
                  Clear {stored.length} unused {stored.length === 1 ? 'book' : 'books'}
                </Button>
              </Popconfirm>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
