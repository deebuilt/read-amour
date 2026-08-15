import { useCallback, useState } from 'react'
import { Alert, Button, Progress, Typography, Upload } from 'antd'
import { parseGoodreadsCsv, formatMonth, type ImportResult } from '../../import/goodreads'
import { resolveCoversForBooks, type BatchProgress } from '../../api/covers'
import { saveBooks } from '../../storage/db'
import { color, fontSize } from '../../design/tokens'
import type { Book } from '../../types/domain'
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
}

export function ImportPanel({ onUseMonth }: ImportPanelProps) {
  const [result, setResult] = useState<ImportResult | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [progress, setProgress] = useState<BatchProgress | undefined>()
  const [busyMonth, setBusyMonth] = useState<string | undefined>()

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
          </Typography.Text>

          {[...result.byMonth.entries()].map(([month, books]) => (
            <div key={month} className={styles.month}>
              <div className={styles.monthMeta}>
                <span className={styles.monthName}>{formatMonth(month)}</span>
                <span className={styles.monthCount} style={{ color: color.inkFaint }}>
                  {books.length} {books.length === 1 ? 'book' : 'books'}
                </span>
              </div>
              <Button
                size="small"
                onClick={() => void handleMonth(month, books)}
                loading={busyMonth === month}
                disabled={busyMonth !== undefined}
              >
                Use
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
