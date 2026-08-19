import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { suggestPosters, type Suggestion } from '../domain/suggestions'
import { dismissSuggestion, readDismissed } from '../storage/dismissedSuggestions'
import { listBooks } from '../storage/db'
import type { Board, Book } from '../types/domain'

/**
 * Posters the app can offer, computed from the whole library.
 *
 * The whole library rather than the open board, for the same reason `useStats`
 * reads everything: a suggestion drawn from "the books on the poster you happen
 * to have open" would be a suggestion about that poster. Five-star reads cut
 * across every month there has ever been.
 *
 * Read on mount and re-read on demand. The count is wanted in the header
 * permanently, so this hook mounts with the app rather than with a panel — but
 * it is still a read rather than a subscription, and `reload` is what a caller
 * uses after writing a poster the suggestions should notice.
 */

interface UseSuggestionsResult {
  suggestions: Suggestion[]
  isLoading: boolean
  /** Say no to one. It stays gone across launches. */
  dismiss: (id: string) => void
  /** Re-read the library and recompute, after books or boards changed. */
  reload: () => void
}

export function useSuggestions(boards: readonly Board[]): UseSuggestionsResult {
  const [books, setBooks] = useState<Book[] | undefined>()
  const [now, setNow] = useState<Date | undefined>()
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => readDismissed())

  /**
   * Which read is the current one.
   *
   * The same guard `useStats` needs, and for the same reason: `reload` can fire
   * while an earlier read is in flight, and two overlapping reads of IndexedDB
   * settle in either order. Without a generation, the older result can land last
   * and put stale suggestions back on screen.
   */
  const generation = useRef(0)

  const read = useCallback(() => {
    generation.current += 1
    const mine = generation.current

    void listBooks().then((all) => {
      if (mine !== generation.current) return
      setBooks(all)
      setNow(new Date())
    })
  }, [])

  useEffect(() => {
    read()
    return () => {
      generation.current += 1
    }
  }, [read])

  /**
   * Months that already have a poster, so the best-month suggestion does not
   * offer to build something the reader already built.
   *
   * Derived from the boards the app already holds in state rather than read
   * again from storage — `useBoard` keeps that list current, including after a
   * suggestion is kept.
   */
  const monthsWithPosters = useMemo(
    () => new Set(boards.map((board) => board.month)),
    [boards],
  )

  const suggestions = useMemo(() => {
    if (!books || !now) return []
    return suggestPosters(books, now, { monthsWithPosters }, dismissed)
  }, [books, now, monthsWithPosters, dismissed])

  const dismiss = useCallback((id: string) => {
    setDismissed(dismissSuggestion(id))
  }, [])

  return { suggestions, isLoading: books === undefined, dismiss, reload: read }
}
