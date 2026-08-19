import { useEffect, useMemo, useState } from 'react'
import { ensureImportedFlagBackfilled, getBooks } from '../storage/db'
import { bookIdsOnBoard } from '../domain/board'
import type { Board, Book } from '../types/domain'

/**
 * The books sitting on each of several boards, keyed by board id.
 *
 * The posters drawer holds `Board` records, which carry book *ids* rather than
 * book records — so a row could say "4 books" and never show which four. This
 * resolves them in one read for every board at once, rather than a lookup per
 * row, since a library of thirty posters would otherwise open thirty
 * transactions to draw one list.
 *
 * Books are returned in slot order, so a strip matches the poster it describes.
 */
export function useBoardCovers(boards: readonly Board[]): Map<string, Book[]> {
  const [books, setBooks] = useState<Map<string, Book>>(new Map())

  /**
   * A stable dependency: the set of ids across every board, sorted. Re-reads
   * when the books on a poster change, not on every render of the drawer.
   */
  const signature = useMemo(
    () => [...new Set(boards.flatMap(bookIdsOnBoard))].sort().join(','),
    [boards],
  )

  useEffect(() => {
    if (signature.length === 0) {
      setBooks(new Map())
      return
    }

    let cancelled = false

    async function load(): Promise<void> {
      // The same migration gate the other library readers wait on, so a row
      // never renders from records the backfill is still rewriting.
      await ensureImportedFlagBackfilled()
      const found = await getBooks(signature.split(','))
      if (cancelled) return
      setBooks(found)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [signature])

  return useMemo(() => {
    const byBoard = new Map<string, Book[]>()
    boards.forEach((board) => {
      const found = bookIdsOnBoard(board)
        .map((id) => books.get(id))
        .filter((book): book is Book => book !== undefined)
      byBoard.set(board.id, found)
    })
    return byBoard
  }, [boards, books])
}
