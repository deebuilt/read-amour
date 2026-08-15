import { useCallback, useEffect, useRef, useState } from 'react'
import { createBoard, migrateBoard } from '../domain/board'
import { getBoard, listBoards, saveBoard } from '../storage/db'
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
  isLoading: boolean
  updateBoard: (next: Board) => void
  switchBoard: (id: string) => Promise<void>
  startNewBoard: (month?: string) => Promise<Board>
}

export function useBoard(): UseBoardResult {
  const [board, setBoard] = useState<Board | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const saveTimer = useRef<number | undefined>(undefined)

  // Open the most recent board, or create the current month's on first run.
  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      const boards = await listBoards()
      if (cancelled) return

      if (boards.length > 0) {
        const repaired = migrateBoard(boards[0])
        if (repaired !== boards[0]) await saveBoard(repaired)
        if (!cancelled) setBoard(repaired)
      } else {
        const fresh = createBoard()
        await saveBoard(fresh)
        if (!cancelled) setBoard(fresh)
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

    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current)
    }
    saveTimer.current = window.setTimeout(() => {
      void saveBoard(next)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  // A pending debounce would be lost if the tab closed mid-edit.
  useEffect(() => {
    return () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [])

  const switchBoard = useCallback(async (id: string) => {
    const next = await getBoard(id)
    if (next) setBoard(migrateBoard(next))
  }, [])

  const startNewBoard = useCallback(async (month?: string) => {
    const fresh = createBoard(month)
    await saveBoard(fresh)
    setBoard(fresh)
    return fresh
  }, [])

  return { board, isLoading, updateBoard, switchBoard, startNewBoard }
}
