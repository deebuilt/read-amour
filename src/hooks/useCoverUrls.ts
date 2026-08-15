import { useCallback, useEffect, useState } from 'react'
import { getCoverObjectUrl } from '../api/covers'
import { getBooks } from '../storage/db'
import { bookIdsOnBoard } from '../domain/board'
import type { Board, Book } from '../types/domain'

/**
 * Resolves the books and cover object URLs a board needs to render.
 *
 * Keyed on the board's slot contents rather than the board object, so moving a
 * slider or retitling the poster does not re-read every blob from IndexedDB.
 */

interface UseCoverUrlsResult {
  books: Map<string, Book>
  coverUrls: Map<string, string>
  isLoading: boolean
  /**
   * Replace one book in the map after it was edited in place.
   *
   * Editing a rating changes the book but not which books are on the board, so
   * the signature this hook keys on is unchanged and no reload fires. Rather
   * than widen that key — which would re-read every blob on every keystroke —
   * the caller hands back the book it just saved.
   */
  replaceBook: (book: Book) => void
}

export function useCoverUrls(board: Board | undefined): UseCoverUrlsResult {
  const [books, setBooks] = useState<Map<string, Book>>(new Map())
  const [coverUrls, setCoverUrls] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(false)

  const bookIds = board ? bookIdsOnBoard(board) : []
  // A stable dependency: the same books in the same slots produce the same key.
  const signature = bookIds.join(',')

  useEffect(() => {
    if (!board || bookIds.length === 0) {
      setBooks(new Map())
      setCoverUrls(new Map())
      return
    }

    let cancelled = false
    setIsLoading(true)

    async function load(): Promise<void> {
      const loaded = await getBooks(signature.split(','))
      if (cancelled) return
      setBooks(loaded)

      const urls = new Map<string, string>()
      await Promise.all(
        [...loaded.values()].map(async (book) => {
          if (!book.coverBlobKey) return
          const url = await getCoverObjectUrl(book.coverBlobKey)
          if (url) urls.set(book.coverBlobKey, url)
        }),
      )
      if (cancelled) return

      setCoverUrls(urls)
      setIsLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const replaceBook = useCallback((book: Book) => {
    setBooks((current) => new Map(current).set(book.id, book))

    // A replaced cover is a new blob key with no object URL yet, so resolve it
    // here — the effect above will not re-run, since which books are on the
    // board has not changed.
    const key = book.coverBlobKey
    if (!key) return
    void getCoverObjectUrl(key).then((url) => {
      if (url) setCoverUrls((current) => new Map(current).set(key, url))
    })
  }, [])

  return { books, coverUrls, isLoading, replaceBook }
}
