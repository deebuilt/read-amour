import { Button, Popconfirm, Typography } from 'antd'
import { color, fontSize } from '../../design/tokens'
import type { Board, Book } from '../../types/domain'
import styles from './BookList.module.css'

/**
 * The month's books, in slot order, under the poster.
 *
 * Every one of these fields was already being stored and never shown. The
 * poster itself is covers only — deliberately, it is a piece of art — so this
 * is where the title, author, rating and finish date get to exist.
 *
 * The awkward part is that the metadata is uneven by source: a book added by
 * search carries a title and author and nothing else, because Open Library has
 * no idea when *you* read it. A Goodreads row carries the date and the rating
 * too. So no field here is laid out as a column that would sit conspicuously
 * empty; each one appears only if it is known, and a book with nothing but a
 * title still reads as a finished row rather than a broken one.
 */

interface BookListProps {
  board: Board
  books: Map<string, Book>
  coverUrls: Map<string, string>
  onSlotClick: (index: number) => void
  /** Empty every slot on this poster, keeping its design. */
  onClearAll: () => void
}

/** Filled slots only, in reading order, paired with the book each holds. */
function booksInSlotOrder(board: Board, books: Map<string, Book>): { index: number; book: Book }[] {
  return [...board.slots]
    .sort((a, b) => a.index - b.index)
    .flatMap((slot) => {
      const book = slot.bookId ? books.get(slot.bookId) : undefined
      return book ? [{ index: slot.index, book }] : []
    })
}

/** "2026-03-14" → "14 March". The year is already the poster's job. */
function formatDateRead(iso: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return undefined
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return undefined
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })
}

/** Rating as filled/empty stars. Whole stars only — that is all we store. */
function ratingStars(rating: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(filled) + '☆'.repeat(5 - filled)
}

export function BookList({ board, books, coverUrls, onSlotClick, onClearAll }: BookListProps) {
  const entries = booksInSlotOrder(board, books)

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <Typography.Text style={{ fontSize: fontSize.sm, color: color.inkFaint }}>
          Tap a slot on the poster to add your first book.
        </Typography.Text>
      </div>
    )
  }

  return (
    <section className={styles.root} aria-label="Books on this poster">
      <header className={styles.header}>
        <h2 className={styles.heading}>
          {entries.length} {entries.length === 1 ? 'book' : 'books'}
        </h2>
      </header>

      <ol className={styles.list}>
        {entries.map(({ index, book }) => {
          const coverUrl = book.coverBlobKey ? coverUrls.get(book.coverBlobKey) : undefined
          const finished = book.dateRead ? formatDateRead(book.dateRead) : undefined

          return (
            <li key={`${index}-${book.id}`}>
              <button type="button" className={styles.row} onClick={() => onSlotClick(index)}>
                <span className={styles.coverWrap}>
                  {coverUrl && <img className={styles.cover} src={coverUrl} alt="" />}
                </span>

                <span className={styles.meta}>
                  <span className={styles.title}>{book.title}</span>
                  <span className={styles.author} style={{ color: color.inkSoft }}>
                    {book.author}
                  </span>

                  {(book.rating !== undefined || finished) && (
                    <span className={styles.detail} style={{ color: color.inkFaint }}>
                      {book.rating !== undefined && (
                        <span
                          className={styles.rating}
                          aria-label={`Rated ${book.rating} out of 5`}
                        >
                          {ratingStars(book.rating)}
                        </span>
                      )}
                      {finished && <span className={styles.finished}>{finished}</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Emptying the poster belongs with the list of what is on it, rather
          than in the panel of other posters — this is the one you are looking
          at. The design, background and title survive. */}
      <Popconfirm
        title="Clear every slot?"
        description="The background, type and title stay as they are."
        okText="Clear"
        okButtonProps={{ danger: true }}
        cancelText="Cancel"
        onConfirm={onClearAll}
      >
        <Button danger block className={styles.clearAll}>
          Clear this poster
        </Button>
      </Popconfirm>
    </section>
  )
}
