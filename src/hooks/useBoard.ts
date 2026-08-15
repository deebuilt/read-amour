import { useCallback, useEffect, useRef, useState } from 'react'
import { clearSlots, createBoard, migrateBoard } from '../domain/board'
import {
  deleteBoard,
  getBoard,
  listBoards,
  pruneOrphanedImages,
  repairCoverLinks,
  saveBoard,
} from '../storage/db'
import type { Board } from '../types/domain'

/**
 * The active board, persisted to IndexedDB.
 *
 * Writes are debounced: dragging a grid-size slider or typing a title fires
 * many updates a second, and each one would otherwise be its own transaction.
 * State is the source of truth in-session; IndexedDB catches up behind it.
 */

const SAVE_DEBOUNCE_MS = 400

interface UseBoardResult {
  board: Board | undefined
  /** Every saved poster, newest month first. Drives the poster switcher. */
  boards: Board[]
  isLoading: boolean
  updateBoard: (next: Board) => void
  switchBoard: (id: string) => Promise<void>
  startNewBoard: (month?: string, title?: string) => Promise<Board>
  /** Retitle a saved poster that is not the active one. */
  renameBoard: (id: string, title: string) => Promise<void>
  /** Re-read the poster list, after boards were written outside this hook. */
  refreshBoards: () => Promise<void>
  /** Empty every slot on the active board, keeping its design. */
  resetBoard: () => Promise<void>
  /** Delete a month outright. Deleting the active one falls back to another. */
  removeBoard: (id: string) => Promise<void>
}

export function useBoard(): UseBoardResult {
  const [board, setBoard] = useState<Board | undefined>()
  const [boards, setBoards] = useState<Board[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const saveTimer = useRef<number | undefined>(undefined)
  /**
   * The board a pending debounced write belongs to. A switch or a delete has to
   * be able to cancel that write — otherwise the old board's state lands in
   * IndexedDB after the swap and silently resurrects what the user just left.
   */
  const pendingSave = useRef<Board | undefined>(undefined)

  /** Flush a queued write immediately, so a switch cannot lose the last edit. */
  const flushSave = useCallback(async () => {
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    const queued = pendingSave.current
    pendingSave.current = undefined
    if (queued) await saveBoard(queued)
  }, [])

  const refreshBoards = useCallback(async () => {
    setBoards(await listBoards())
  }, [])

  // Open the most recent board, or create the current month's on first run.
  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      // Rebuild any book-to-cover links that were lost, before reading boards.
      // A no-op once storage is consistent; it only fills a missing key from
      // the ownership recorded on the image, never overwrites a live one.
      await repairCoverLinks()

      const boards = await listBoards()
      if (cancelled) return

      if (boards.length > 0) {
        const repaired = migrateBoard(boards[0])
        if (repaired !== boards[0]) await saveBoard(repaired)
        if (cancelled) return
        setBoard(repaired)
        setBoards(boards.map((saved) => (saved.id === repaired.id ? repaired : saved)))
      } else {
        const fresh = createBoard()
        await saveBoard(fresh)
        if (cancelled) return
        setBoard(fresh)
        setBoards([fresh])
      }
      setIsLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const updateBoard = useCallback((next: Board) => {
    setBoard(next)
    // Keep the switcher's copy in step, so its titles and counts do not lag
    // behind the poster being edited.
    setBoards((current) => current.map((saved) => (saved.id === next.id ? next : saved)))

    pendingSave.current = next
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current)
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined
      pendingSave.current = undefined
      void saveBoard(next)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  // A pending debounce would be lost if the tab closed mid-edit.
  useEffect(() => {
    return () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current)
        // Not awaited: the component is going away either way, and an
        // unawaited put still reaches IndexedDB on a normal unmount.
        if (pendingSave.current) void saveBoard(pendingSave.current)
      }
    }
  }, [])

  const switchBoard = useCallback(
    async (id: string) => {
      await flushSave()
      const next = await getBoard(id)
      if (!next) return
      const repaired = migrateBoard(next)
      setBoard(repaired)
      await refreshBoards()
    },
    [flushSave, refreshBoards],
  )

  /**
   * Start a poster.
   *
   * Two posters may share a month — a month poster and a year-in-review can
   * both sit in December, and the app has never enforced otherwise. They are
   * told apart by their titles, which is what the switcher lists.
   */
  const startNewBoard = useCallback(
    async (month?: string, title?: string) => {
      await flushSave()

      const fresh = createBoard(month, title)
      await saveBoard(fresh)
      setBoard(fresh)
      await refreshBoards()
      return fresh
    },
    [flushSave, refreshBoards],
  )

  /**
   * Rename a poster that is not the active one.
   *
   * The active poster is renamed through `updateBoard` instead, so the change
   * shows on the artwork straight away. This path exists for the others, which
   * are not mounted and so have to be written directly.
   */
  const renameBoard = useCallback(
    async (id: string, title: string) => {
      const target = await getBoard(id)
      if (!target) return
      const renamed = { ...target, text: { ...target.text, title } }
      await saveBoard(renamed)
      await refreshBoards()
    },
    [refreshBoards],
  )

  /**
   * Empty the active board's slots, keeping its background, type and title.
   *
   * The covers those slots pointed at may now be referenced by nothing, so the
   * orphan sweep runs after — otherwise every reset leaks its images and the
   * database grows without bound.
   */
  const resetBoard = useCallback(async () => {
    if (!board) return
    const cleared = clearSlots(board)
    setBoard(cleared)
    setBoards((current) => current.map((saved) => (saved.id === cleared.id ? cleared : saved)))

    // Cancel any queued write of the pre-reset state before saving the cleared
    // one, or the debounce would put the books straight back.
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    pendingSave.current = undefined

    await saveBoard(cleared)
    await pruneOrphanedImages()
  }, [board])

  const removeBoard = useCallback(
    async (id: string) => {
      // Drop any queued write for the board being deleted; flushing it would
      // write the record back out moments after the delete removed it.
      if (pendingSave.current?.id === id) {
        if (saveTimer.current !== undefined) {
          window.clearTimeout(saveTimer.current)
          saveTimer.current = undefined
        }
        pendingSave.current = undefined
      } else {
        await flushSave()
      }

      await deleteBoard(id)
      const remaining = await listBoards()

      if (board?.id === id) {
        // Fall back to the newest survivor, or a fresh month if that was the
        // last board — the app has no meaningful state with no board at all.
        if (remaining.length > 0) {
          setBoard(migrateBoard(remaining[0]))
          setBoards(remaining)
        } else {
          const fresh = createBoard()
          await saveBoard(fresh)
          setBoard(fresh)
          setBoards([fresh])
        }
      } else {
        setBoards(remaining)
      }

      await pruneOrphanedImages()
    },
    [board, flushSave],
  )

  return {
    board,
    boards,
    isLoading,
    updateBoard,
    switchBoard,
    startNewBoard,
    renameBoard,
    refreshBoards,
    resetBoard,
    removeBoard,
  }
}
