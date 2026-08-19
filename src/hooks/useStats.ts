import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeStats, type ReadingStats } from '../domain/stats'
import { isAdopted } from '../domain/library'
import { ensureImportedFlagBackfilled, listBooks } from '../storage/db'
import type { Book } from '../types/domain'

/**
 * The whole library, read once, and the dashboard computed from it.
 *
 * Every other panel in the app works from the active board's books, which is a
 * poster's worth. This one is the exception on purpose: a reading history is the
 * whole library or it is nothing, and a chart of "books on the poster you happen
 * to have open" would be a stat about the poster.
 *
 * Read on mount rather than subscribed to. The dashboard is a place someone
 * arrives at, looks at, and leaves — it does not need to track an edit made
 * behind it, and re-reading every book on each keystroke elsewhere in the app
 * would be real work for no visible gain. Closing and reopening the panel
 * re-reads.
 *
 * Rows that arrived in a CSV and were never placed on a poster are filtered
 * out here, at this one boundary, rather than inside each statistic. A book
 * nobody adopted is not part of a reading history — counting the whole file the
 * moment it parsed is what made the dashboard total four hundred books after an
 * import of three months.
 *
 * The clock is captured once per read for the same reason `computeStats` takes
 * `now` as a parameter: a component that called `new Date()` while rendering
 * would produce a different timeline on every render, and the memo below would
 * never hold.
 */

interface UseStatsResult {
  stats: ReadingStats | undefined
  isLoading: boolean
  /**
   * Re-read the library and recompute.
   *
   * Needed because dating a book from `UndatedPanel` writes straight to
   * IndexedDB, which this hook has no way to notice — without a reload the
   * charts keep showing the numbers they were built with, which looks exactly
   * like the date not having saved.
   */
  reload: () => void
}

export function useStats(): UseStatsResult {
  const [books, setBooks] = useState<Book[] | undefined>()
  const [now, setNow] = useState<Date | undefined>()

  /**
   * Which read is the current one.
   *
   * A plain `cancelled` flag per call is enough for a mount effect and not
   * enough here, because `reload` can fire while an earlier read is still in
   * flight — dating several books in a row does exactly that. Two overlapping
   * reads of IndexedDB can settle in either order, so without a generation the
   * older result can land last and put the stale numbers back on screen.
   *
   * A ref rather than state: bumping it must not itself cause a render, and the
   * settling promise needs to see the latest value rather than the one captured
   * when it started.
   */
  const generation = useRef(0)

  const read = useCallback(() => {
    generation.current += 1
    const mine = generation.current

    // Same migration gate `useSuggestions` waits on. The dashboard is usually
    // opened long after startup, so this read would win the race in practice —
    // but "usually" is not a guarantee, and a stats screen that counted the
    // library differently depending on how fast a panel was opened would be
    // the worst version of this bug to chase.
    void ensureImportedFlagBackfilled()
      .then(listBooks)
      .then((all) => {
        // A newer read has started, or the component has gone away.
        if (mine !== generation.current) return
        setBooks(all.filter(isAdopted))
        setNow(new Date())
      })
  }, [])

  useEffect(() => {
    read()
    return () => {
      // Invalidate whatever is in flight, so an unmount cannot set state.
      generation.current += 1
    }
  }, [read])

  const stats = useMemo(
    () => (books && now ? computeStats(books, now) : undefined),
    [books, now],
  )

  return { stats, isLoading: stats === undefined, reload: read }
}
