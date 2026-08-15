import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Progress, Typography, Upload } from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import { parseGoodreadsCsv, formatMonth, type ImportResult } from '../../import/goodreads'
import { resolveCoversForBooks, type BatchProgress } from '../../api/covers'
import { saveBooks } from '../../storage/db'
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

  const remainingCount = useMemo(() => {
    if (!result) return 0
    return [...result.byMonth.keys()].filter((month) => !usedMonths.has(month)).length
  }, [result, usedMonths])

  const handleCreateAll = useCallback(async () => {
    if (!result) return
    setIsCreatingAll(true)
    try {
      await onCreateAll(
        [...result.byMonth.entries()]
          .filter(([month]) => !usedMonths.has(month))
          .map(([month, books]) => ({ month, books })),
      )
    } finally {
      setIsCreatingAll(false)
    }
  }, [result, usedMonths, onCreateAll])

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that file.')
    }
    return false
  }, [])

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

      setProgress(undefined)
      setBusyMonth(undefined)
      onUseMonth(month, withCovers)
    },
    [onUseMonth],
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

      {result && (
        <div className={styles.months}>
          <Typography.Text className={styles.label}>
            {result.books.length} books read
            {result.undatedCount > 0 && ` · ${result.undatedCount} with no date`}
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

          {[...result.byMonth.entries()].map(([month, books]) => {
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
        </div>
      )}
    </div>
  )
}
