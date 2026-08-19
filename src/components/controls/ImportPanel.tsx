import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Popconfirm, Progress, Typography, Upload } from 'antd'
import { CheckOutlined, DeleteOutlined, DownOutlined } from '@ant-design/icons'
import { formatMonth, groupByMonth } from '../../import/goodreads'
import { parseLibraryCsv, type ParseOutcome } from '../../import/parse'
import { resolveCoversForBooks, type BatchProgress } from '../../api/covers'
import {
  deleteBooks,
  listUnplacedBooks,
  markBooksPlaced,
  mergeImportedBooks,
  saveBooks,
} from '../../storage/db'
import { color, fontSize } from '../../design/tokens'
import { MAX_GRID_CAPACITY, SOURCE_LABEL, type Book } from '../../types/domain'
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
  const [result, setResult] = useState<ParseOutcome | undefined>()
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
  /** What the last drop added, and what it folded into books already held. */
  const [merge, setMerge] = useState<{ added: number; merged: number } | undefined>()
  /**
   * Which list is showing its titles.
   *
   * One at a time. These lists run to a dozen books and the drawer is a phone
   * screen — several open at once turns a scannable list into a wall, and the
   * reader is answering "what is in this one?" about one list at a time.
   */
  const [openList, setOpenList] = useState<string | undefined>()
  const [isClearing, setIsClearing] = useState(false)

  const readStored = useCallback(async () => {
    setStored(await listUnplacedBooks())
  }, [])

  useEffect(() => {
    void readStored()
  }, [readStored])

  /**
   * Everything waiting to be placed, however it got here.
   *
   * Grouped from the stored set rather than from the parse, and the difference
   * is not cosmetic. Showing `result.byMonth` after a drop displayed only the
   * file just read, while the clear button counted every unplaced book in
   * storage — so importing a StoryGraph file over an existing Goodreads
   * library listed 56 books above a button offering to clear 132, and the
   * Goodreads books were nowhere on screen. Nothing had been overwritten; the
   * list and the button were reading different things.
   *
   * The parse still feeds this, one step earlier: `handleFile` writes the rows
   * and then re-reads storage, so a dropped file arrives here through the same
   * door as everything else.
   */
  const grouped = useMemo(() => groupByMonth(stored ?? []), [stored])
  const months = stored ? grouped.byMonth : undefined
  const undatedCount = grouped.undatedCount
  const totalCount = stored?.length ?? 0

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
  /**
   * Which of a group's books are still unplaced.
   *
   * A group listed here can hold books that have since gone onto a poster —
   * "Again" refills a group whose books are already placed — so the count on
   * the clear has to be the books it would actually delete, not the row's
   * total. Reads the stored set rather than the book records, since those are
   * the ones the flag was refreshed on.
   */
  const unplacedIds = useMemo(
    () => new Set((stored ?? []).map((book) => book.id)),
    [stored],
  )

  const unplacedIn = useCallback(
    (books: readonly Book[]) => books.filter((book) => unplacedIds.has(book.id)),
    [unplacedIds],
  )

  /** Discard one group's unplaced books, leaving anything already on a poster. */
  const handleClearGroup = useCallback(
    async (books: readonly Book[]) => {
      const doomed = books.filter((book) => unplacedIds.has(book.id))
      if (doomed.length === 0) return
      await deleteBooks(doomed.map((book) => book.id))
      setResult(undefined)
      await readStored()
    },
    [unplacedIds, readStored],
  )

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
      const parsed = await parseLibraryCsv(file)
      if (parsed.books.length === 0) {
        setError('No finished books found in that file. Only books you have marked read are imported.')
        return false
      }
      // Folds rows the library already holds under another site's id, rather
      // than writing a second record for the same book.
      const outcome = await mergeImportedBooks(parsed.books)
      setResult(parsed)
      setMerge(outcome)
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
        Bring your books from Goodreads or StoryGraph. On Goodreads, open{' '}
        <b>My Books</b>, then <b>Import and export</b>, then <b>Export Library</b>.
        On StoryGraph, open <b>Manage Account</b>, then <b>Export StoryGraph Library</b>.
      </Typography.Paragraph>

      <Upload.Dragger accept=".csv" showUploadList={false} beforeUpload={(file) => handleFile(file)}>
        <p className={styles.dragText}>Drop your CSV</p>
        <p className={styles.dragHint}>or tap to choose the file</p>
      </Upload.Dragger>

      <Typography.Paragraph style={{ fontSize: fontSize.xs, color: color.inkFaint, margin: 0 }}>
        Pick the books you want on a poster. Anything you don&rsquo;t pick stays
        stored on this device, so you can come back and add it later. Only books
        on a poster count toward your stats.
      </Typography.Paragraph>

      {error && <Alert type="error" message={error} showIcon />}

      {/* What the last drop actually added. The list below shows everything
          waiting, from every import, so without this a reader who just dropped
          a file has no way to tell what it contributed. */}
      {result && (
        <Alert
          type="success"
          showIcon
          message={`Read ${result.books.length} ${
            result.books.length === 1 ? 'book' : 'books'
          } from ${SOURCE_LABEL[result.format]}`}
          description={
            <>
              {merge && merge.merged > 0 && (
                <div>
                  {merge.added} new, {merge.merged} you already had.
                </div>
              )}
              {result.skippedCount > 0 && (
                <div>
                  {result.skippedCount} rows skipped — only books you have marked read
                  are imported.
                </div>
              )}
            </>
          }
        />
      )}

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
            Waiting to be placed
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

            // Which exports these books came from. Usually one, but a reader
            // who has used both Goodreads and StoryGraph can have the same
            // group built from either — and then the source is the only thing
            // explaining why a title shows up twice.
            const isOpen = openList === month
            const sources = [...new Set(books.map((book) => book.source))]
              .map((source) => SOURCE_LABEL[source])
              .join(' · ')

            return (
              <div key={month} className={styles.month}>
                <div className={styles.monthTop}>
                  {/* The whole meta block is the toggle. Covers cannot answer
                      "what is in this list?" here — they are fetched when a
                      list is used, so an unused list has none by definition —
                      and the titles are the next best answer and cost nothing. */}
                  <button
                    type="button"
                    className={styles.monthMeta}
                    onClick={() => setOpenList(isOpen ? undefined : month)}
                    aria-expanded={isOpen}
                  >
                    <span className={styles.monthName}>
                      {formatMonth(month)}
                      <DownOutlined
                        className={isOpen ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
                      />
                    </span>
                    <span className={styles.monthCount} style={{ color: color.inkFaint }}>
                      {books.length} {books.length === 1 ? 'book' : 'books'} · {sources}
                      {overflow > 0 && ` · ${overflow} won't fit`}
                    </span>
                  </button>
                  <div className={styles.monthActions}>
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
                    {/* Clearing one group, where the button at the foot clears
                        every group at once. Only offered on books still in
                        storage — a group already on a poster has nothing here
                        to discard. */}
                    {unplacedIn(books).length > 0 && (
                      <Popconfirm
                        title="Clear stored books"
                        description={`Removes ${unplacedIn(books).length} ${
                          unplacedIn(books).length === 1 ? 'book' : 'books'
                        } you never put on a poster. Posters keep their books.`}
                        okText="Clear"
                        cancelText="Keep"
                        onConfirm={() => void handleClearGroup(books)}
                      >
                        <Button
                          size="small"
                          type="text"
                          aria-label={`Clear ${formatMonth(month)}`}
                          icon={<DeleteOutlined />}
                          disabled={busyMonth !== undefined}
                        />
                      </Popconfirm>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <ul className={styles.titles}>
                    {books.map((book) => (
                      <li key={book.id} className={styles.title}>
                        <span className={styles.titleName}>{book.title}</span>
                        <span className={styles.titleAuthor}>{book.author}</span>
                      </li>
                    ))}
                  </ul>
                )}
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
