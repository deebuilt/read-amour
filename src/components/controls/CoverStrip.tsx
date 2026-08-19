import { useMemo } from 'react'
import { useCoverUrlsFor } from '../../hooks/useCoverUrlsFor'
import type { Book } from '../../types/domain'
import styles from './CoverStrip.module.css'

/**
 * A row of cover thumbnails, for any list of books.
 *
 * Written once and used by three panels — suggestions, import, and posters —
 * because the answer to "what is in this row?" is the same everywhere: the
 * covers. A row saying "June 2023 · 4 books" is a sentence; a row showing four
 * covers is the thing itself.
 *
 * It resolves its own URLs through `useCoverUrlsFor`, which reads blobs already
 * in IndexedDB and never touches the network. A book whose cover was never
 * fetched renders a blank plate rather than a gap, so the strip keeps its
 * rhythm and rows do not jump when covers arrive.
 */

interface CoverStripProps {
  books: readonly Book[]
  /** How many covers to show before collapsing the rest into a count. */
  limit: number
  /** Thumbnail width in px. Rows with less room use a smaller mark. */
  width?: number
}

export function CoverStrip({ books, limit, width = 30 }: CoverStripProps) {
  const shown = useMemo(() => books.slice(0, limit), [books, limit])
  const hidden = books.length - shown.length

  /*
   * Only the covers actually shown. Resolving the tail of a twenty-book list
   * would read blobs nothing renders.
   */
  const coverKeys = useMemo(() => shown.map((book) => book.coverBlobKey), [shown])
  const coverUrls = useCoverUrlsFor(coverKeys)

  if (books.length === 0) return null

  return (
    <span className={styles.strip} aria-hidden>
      {shown.map((book) => {
        const url = book.coverBlobKey ? coverUrls.get(book.coverBlobKey) : undefined

        return (
          <span key={book.id} className={styles.thumb} style={{ width }}>
            {url ? (
              <img className={styles.cover} src={url} alt="" />
            ) : (
              <span className={styles.blank} />
            )}
          </span>
        )
      })}
      {hidden > 0 && <span className={styles.more}>+{hidden}</span>}
    </span>
  )
}
