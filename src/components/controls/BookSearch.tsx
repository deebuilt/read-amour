import { useCallback, useEffect, useRef, useState } from 'react'
import { Empty, Input, Spin, Typography } from 'antd'
import { coverUrl, searchBooks } from '../../api/openLibrary'
import { ensureCoverStored } from '../../api/covers'
import { saveBook } from '../../storage/db'
import { color, fontSize, space } from '../../design/tokens'
import type { Book, CoverSearchResult } from '../../types/domain'
import styles from './BookSearch.module.css'

/**
 * Search Open Library and place a cover into a slot.
 *
 * This replaces the manual loop these posters normally require — screenshot a
 * cover, open an editor, drag it into place. Here it is: type, tap, done.
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

      searchBooks(trimmed, controller.signal)
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
      if (result.coverId === undefined) return
      setPendingKey(result.key)

      try {
        const blobKey = await ensureCoverStored(result.coverId)
        const book: Book = {
          id: `ol-${result.coverId}`,
          title: result.title,
          author: result.author,
          isbn13: result.isbn13,
          coverId: result.coverId,
          coverBlobKey: blobKey,
          source: 'search',
        }
        await saveBook(book)
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
            description="No covers found"
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
                {result.coverId !== undefined && (
                  <img
                    className={styles.thumb}
                    src={coverUrl(result.coverId, 'M')}
                    alt=""
                    loading="lazy"
                  />
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
