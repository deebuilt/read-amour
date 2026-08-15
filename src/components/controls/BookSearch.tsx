import { useCallback, useEffect, useRef, useState } from 'react'
import { Empty, Input, Spin, Typography } from 'antd'
import { PictureOutlined } from '@ant-design/icons'
import { coverUrl } from '../../api/openLibrary'
import { searchAllBooks } from '../../api/bookSearch'
import { ensureAppleCoverStored, ensureCoverStored } from '../../api/covers'
import { saveBook, tagImageOwner } from '../../storage/db'
import { color, fontSize, space } from '../../design/tokens'
import type { Book, CoverSearchResult } from '../../types/domain'
import styles from './BookSearch.module.css'

/**
 * Search both catalogues and place a cover into a slot.
 *
 * This replaces the manual loop these posters normally require — screenshot a
 * cover, open an editor, drag it into place. Here it is: type, tap, done.
 *
 * Results carry a cover from Open Library, one from Apple Books, or none at
 * all. All three are selectable: a coverless row still saves the title, author
 * and ISBN, which is the tedious part, and the cover can be uploaded from the
 * book's editor afterwards.
 */

const DEBOUNCE_MS = 350

interface BookSearchProps {
  /** Called once the chosen book has been saved with its cover resolved. */
  onSelect: (book: Book) => void
}

export function BookSearch({ onSelect }: BookSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CoverSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const abortRef = useRef<AbortController | undefined>(undefined)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setIsSearching(false)
      return
    }

    const timer = window.setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsSearching(true)
      setError(undefined)

      searchAllBooks(trimmed, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) {
            setResults(found)
            setIsSearching(false)
          }
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return
          setError(cause instanceof Error ? cause.message : 'Search failed.')
          setIsSearching(false)
        })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const handleSelect = useCallback(
    async (result: CoverSearchResult) => {
      setPendingKey(result.key)

      try {
        /*
         * A result may have an Open Library cover, an Apple one, or neither.
         * Neither is still worth taking: the title, author and ISBN are the
         * tedious part, and the reader can add a cover from the book's own
         * editor afterwards. Refusing the row would hide a book the catalogue
         * genuinely has.
         */
        const blobKey =
          result.coverId !== undefined
            ? await ensureCoverStored(result.coverId)
            : result.appleArtworkUrl
              ? await ensureAppleCoverStored(result.appleArtworkUrl)
              : undefined

        const book: Book = {
          // Identity follows whichever catalogue found it, so re-adding the
          // same book reuses one record rather than creating a duplicate.
          id:
            result.coverId !== undefined
              ? `ol-${result.coverId}`
              : result.isbn13
                ? `isbn-${result.isbn13}`
                : `find-${result.key}`,
          title: result.title,
          author: result.author,
          isbn13: result.isbn13,
          coverId: result.coverId,
          coverBlobKey: blobKey,
          source: 'search',
        }
        await saveBook(book)
        // Record the ownership on the image as well, so the cover can be
        // matched back to this book if the book's own link is ever lost.
        if (blobKey) await tagImageOwner(blobKey, book)
        onSelect(book)
        setQuery('')
        setResults([])
      } catch {
        setError('Could not load that cover. Try another edition.')
      } finally {
        setPendingKey(undefined)
      }
    },
    [onSelect],
  )

  return (
    <div className={styles.root}>
      <Input.Search
        placeholder="Search by title or author"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        size="large"
        allowClear
        autoFocus
      />

      <div className={styles.results}>
        {isSearching && (
          <div className={styles.status}>
            <Spin size="small" />
          </div>
        )}

        {!isSearching && error && (
          <Typography.Text type="danger" style={{ fontSize: fontSize.sm }}>
            {error}
          </Typography.Text>
        )}

        {!isSearching && !error && query.trim().length >= 2 && results.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No books found"
            style={{ marginBlock: space.xl }}
          />
        )}

        <div className={styles.grid}>
          {results.map((result) => (
            <button
              key={result.key}
              type="button"
              className={styles.result}
              onClick={() => void handleSelect(result)}
              disabled={pendingKey !== undefined}
            >
              <span className={styles.thumbWrap}>
                {result.coverId !== undefined ? (
                  <img
                    className={styles.thumb}
                    src={coverUrl(result.coverId, 'M')}
                    alt=""
                    loading="lazy"
                  />
                ) : result.appleArtworkUrl ? (
                  <img
                    className={styles.thumb}
                    src={result.appleArtworkUrl}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  // Says plainly that this row carries no picture, so choosing
                  // it is a deliberate "take the details, I'll add the cover".
                  <span className={styles.noCover}>
                    <PictureOutlined />
                    <span className={styles.noCoverText}>Add your own</span>
                  </span>
                )}
                {pendingKey === result.key && (
                  <span className={styles.thumbOverlay}>
                    <Spin size="small" />
                  </span>
                )}
              </span>
              <span className={styles.meta}>
                <span className={styles.title}>{result.title}</span>
                <span className={styles.author} style={{ color: color.inkFaint }}>
                  {result.author}
                  {result.firstPublishYear ? ` · ${result.firstPublishYear}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
