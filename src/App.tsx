import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { App as AntApp, Button, ConfigProvider, Drawer, Spin } from 'antd'
import {
  AppstoreOutlined,
  BgColorsOutlined,
  DownloadOutlined,
  ReadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Poster } from './components/poster/Poster'
import { DesignPanel } from './components/controls/DesignPanel'
import { ImportPanel } from './components/controls/ImportPanel'
import { SlotEditor } from './components/controls/SlotEditor'
import { BookList } from './components/controls/BookList'
import { PostersPanel } from './components/controls/PostersPanel'
import { Wordmark } from './components/chrome/Wordmark'
import { ThemeToggle } from './components/chrome/ThemeToggle'
import { AboutPanel } from './components/chrome/AboutPanel'
import { useBoard } from './hooks/useBoard'
import { useCoverUrls } from './hooks/useCoverUrls'
import { useBackgroundUrl } from './hooks/useBackgroundUrl'
import { usePosterSize } from './hooks/usePosterSize'
import { useTheme } from './hooks/useTheme'
import { clearSlots, createBoard, fillSlots, moveSlot, setSlotBook } from './domain/board'
import { downloadPoster, posterFileName } from './export/exportPoster'
import { monthName } from './import/goodreads'
import { getBoardByMonth, saveBoard } from './storage/db'
import { buildAntTheme } from './design/antTheme'
import type { Book } from './types/domain'
import styles from './App.module.css'

/**
 * Mobile-first shell.
 *
 * The poster owns the screen; everything else is a drawer over it. On a phone
 * that is the only honest layout — a 9:16 canvas plus a side panel leaves
 * neither enough room. The drawer is the same component at every width, just
 * anchored differently.
 */

type PanelKind = 'design' | 'import' | 'slot' | 'about' | 'books' | 'posters'

interface BarTool {
  key: PanelKind
  label: string
  icon: ReactNode
}

/** Split either side of Save. Order is by how often each gets reached for. */
const LEFT_TOOLS: readonly BarTool[] = [
  { key: 'posters', label: 'Posters', icon: <AppstoreOutlined /> },
  { key: 'books', label: 'Books', icon: <ReadOutlined /> },
]

const RIGHT_TOOLS: readonly BarTool[] = [
  { key: 'design', label: 'Design', icon: <BgColorsOutlined /> },
  { key: 'import', label: 'Import', icon: <UploadOutlined /> },
]

export default function App() {
  const { preference, resolved, cycle } = useTheme()
  const {
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
  } = useBoard()
  const { books, coverUrls, replaceBook } = useCoverUrls(board)
  const backgroundUrl = useBackgroundUrl(board?.background)
  const { containerRef, posterWidth } = usePosterSize()

  const posterRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<PanelKind | undefined>()
  const [activeSlot, setActiveSlot] = useState<number | undefined>()
  const [isExporting, setIsExporting] = useState(false)

  const openSlot = useCallback((index: number) => {
    setActiveSlot(index)
    setPanel('slot')
  }, [])

  const handleSelectBook = useCallback(
    (book: Book) => {
      if (!board || activeSlot === undefined) return
      updateBoard(setSlotBook(board, activeSlot, book.id))
      setPanel(undefined)
      setActiveSlot(undefined)
    },
    [board, activeSlot, updateBoard],
  )

  const handleClearSlot = useCallback(() => {
    if (!board || activeSlot === undefined) return
    updateBoard(setSlotBook(board, activeSlot, undefined))
    setPanel(undefined)
    setActiveSlot(undefined)
  }, [board, activeSlot, updateBoard])

  /**
   * Take a month from the CSV onto a poster of its own.
   *
   * Each month gets its own poster rather than overwriting whatever is open,
   * so a library can be worked through a month at a time without every tap
   * destroying the last one. Re-using a month refills the poster that already
   * exists for it, which is what makes the "Again" button safe — it repeats the
   * import rather than piling up duplicate Julys.
   *
   * The panel stays open on purpose: the whole point is tapping through several
   * months in a row, and closing the drawer after each would undo that.
   *
   * The existing poster is looked up in STORAGE, not in the `boards` array.
   * That array is React state, so a poster created by the previous tap is not
   * in the closure this tap captured — trusting it meant the second month in a
   * row created a duplicate poster and filled that instead, leaving the books
   * on a poster the user was not looking at. It read exactly like data loss.
   */
  const handleUseMonth = useCallback(
    async (month: string, monthBooks: Book[]) => {
      const existing = await getBoardByMonth(month)
      // Bring the target on screen first: filling and then switching would
      // reload the pre-fill record from storage and throw the books away.
      if (existing) await switchBoard(existing.id)
      const target = existing ?? (await startNewBoard(month, monthName(month)))
      updateBoard(fillSlots(clearSlots(target), monthBooks))
    },
    [startNewBoard, switchBoard, updateBoard],
  )

  /**
   * Make a poster for every month in the CSV, covers left for later.
   *
   * Writes straight to storage rather than going through `startNewBoard` per
   * month: that would re-render and re-read the board list on every iteration,
   * and a long history would thrash. One pass, then a single refresh.
   */
  const handleCreateAllPosters = useCallback(
    async (months: { month: string; books: Book[] }[]) => {
      for (const { month, books: monthBooks } of months) {
        if (await getBoardByMonth(month)) continue
        const fresh = createBoard(month, monthName(month))
        await saveBoard(fillSlots(fresh, monthBooks))
      }
      await refreshBoards()
    },
    [refreshBoards],
  )

  // Switching or starting a poster replaces what is on screen, so the panel
  // closes with it — leaving it open over a poster the user did not ask for
  // reads as though the tap failed.
  const handleSwitchPoster = useCallback(
    (id: string) => {
      void switchBoard(id)
      setPanel(undefined)
    },
    [switchBoard],
  )

  const handleStartPoster = useCallback(
    (month: string, title: string) => {
      void startNewBoard(month, title)
      setPanel(undefined)
    },
    [startNewBoard],
  )

  // The panel stays open: clearing empties the list you are looking at, and
  // seeing it empty is the confirmation that it worked.
  const handleReset = useCallback(() => {
    void resetBoard()
  }, [resetBoard])

  /**
   * Rename from the poster list. The active poster goes through `updateBoard`
   * so the change lands on screen immediately; any other one is written
   * straight to storage, since it is not the board being rendered.
   */
  const handleRenamePoster = useCallback(
    (id: string, title: string) => {
      if (board?.id === id) {
        updateBoard({ ...board, text: { ...board.text, title } })
      } else {
        void renameBoard(id, title)
      }
    },
    [board, updateBoard, renameBoard],
  )

  /** From the book list: jump straight to that slot's editor. */
  const handleEditSlot = useCallback((index: number) => {
    setActiveSlot(index)
    setPanel('slot')
  }, [])

  /**
   * Move the open slot's book elsewhere, swapping if the target is filled.
   * The editor follows the book to its new slot rather than staying put, so
   * the panel keeps describing what the user just acted on.
   */
  const handleMoveSlot = useCallback(
    (to: number) => {
      if (!board || activeSlot === undefined || to === activeSlot) return
      updateBoard(moveSlot(board, activeSlot, to))
      setActiveSlot(to)
    },
    [board, activeSlot, updateBoard],
  )

  /** Titles by slot index, so the move list can name what it would swap with. */
  const slotLabels = useMemo(() => {
    const labels = new Map<number, string>()
    board?.slots.forEach((slot) => {
      const title = slot.bookId ? books.get(slot.bookId)?.title : undefined
      if (title) labels.set(slot.index, title)
    })
    return labels
  }, [board, books])

  const handleExport = useCallback(async () => {
    if (!posterRef.current || !board) return
    setIsExporting(true)
    // Let the affordance-free render commit before capturing.
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    try {
      await downloadPoster(posterRef.current, { fileName: posterFileName(board.month) })
    } finally {
      setIsExporting(false)
    }
  }, [board])

  /** Months that already have a poster, so the import list can mark them. */
  const usedMonths = useMemo(
    () => new Set(boards.map((saved) => saved.month)),
    [boards],
  )

  const activeBook =
    activeSlot !== undefined
      ? books.get(board?.slots.find((s) => s.index === activeSlot)?.bookId ?? '')
      : undefined

  return (
    <ConfigProvider theme={buildAntTheme(resolved)}>
      <AntApp>
        <div className={styles.app}>
          <header className={styles.header}>
            {/* Offsets the toggle so the wordmark stays optically centred. */}
            <span className={styles.headerSpacer} />
            <button
              type="button"
              className={styles.wordmarkButton}
              onClick={() => setPanel('about')}
              aria-label="About Read Amour"
            >
              <Wordmark />
            </button>
            <ThemeToggle preference={preference} onCycle={cycle} />
          </header>

          <main className={styles.stage} ref={containerRef}>
            {isLoading || !board ? (
              <div className={styles.loading}>
                <Spin />
              </div>
            ) : (
              <Poster
                ref={posterRef}
                board={board}
                books={books}
                coverUrls={coverUrls}
                backgroundUrl={backgroundUrl}
                displayWidth={posterWidth}
                onSlotClick={openSlot}
                isExporting={isExporting}
              />
            )}
          </main>

          {/*
            Two icons, Save, two icons. Icon-only because five labelled buttons
            wrap at 375px.

            No tooltips: the bar sits at the bottom of the viewport, so a
            tooltip opens upward over the drawer that the same tap just opened —
            it covers the panel content instead of explaining anything. The
            `aria-label` still names every button for assistive tech, which is
            the part that actually mattered.
          */}
          <nav className={styles.bar}>
            <div className={styles.barTools}>
              {LEFT_TOOLS.map((tool) => (
                <Button
                  key={tool.key}
                  type="text"
                  size="large"
                  icon={tool.icon}
                  aria-label={tool.label}
                  onClick={() => setPanel(tool.key)}
                  className={styles.barTool}
                />
              ))}
            </div>

            {/* "Download", not "Save" — the poster is already saved, and has
                been since the moment it was edited. This button is the way to
                get a PNG out, which is a different promise. */}
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<DownloadOutlined />}
              aria-label="Download image"
              onClick={() => void handleExport()}
              loading={isExporting}
              className={styles.save}
            />

            <div className={styles.barTools}>
              {RIGHT_TOOLS.map((tool) => (
                <Button
                  key={tool.key}
                  type="text"
                  size="large"
                  icon={tool.icon}
                  aria-label={tool.label}
                  onClick={() => setPanel(tool.key)}
                  className={styles.barTool}
                />
              ))}
            </div>
          </nav>

          <Drawer
            open={panel !== undefined}
            onClose={() => {
              setPanel(undefined)
              setActiveSlot(undefined)
            }}
            placement="bottom"
            height="82vh"
            title={
              panel === 'design'
                ? 'Design'
                : panel === 'import'
                  ? 'Import from Goodreads'
                  : panel === 'about'
                    ? 'About'
                    : panel === 'books'
                      ? 'Books on this poster'
                      : panel === 'posters'
                        ? 'Posters'
                        : activeSlot !== undefined
                          ? `Slot ${activeSlot + 1}`
                          : ''
            }
            styles={{ body: { paddingTop: 12 } }}
          >
            {panel === 'design' && board && <DesignPanel board={board} onChange={updateBoard} />}
            {panel === 'import' && (
              <ImportPanel
                onUseMonth={(month, monthBooks) => void handleUseMonth(month, monthBooks)}
                usedMonths={usedMonths}
                onCreateAll={handleCreateAllPosters}
              />
            )}
            {panel === 'about' && <AboutPanel />}
            {panel === 'books' && board && (
              <BookList
                board={board}
                books={books}
                coverUrls={coverUrls}
                onSlotClick={handleEditSlot}
                onClearAll={handleReset}
              />
            )}
            {panel === 'posters' && board && (
              <PostersPanel
                board={board}
                boards={boards}
                onSwitch={handleSwitchPoster}
                onStart={handleStartPoster}
                onRename={handleRenamePoster}
                onRemove={(id) => void removeBoard(id)}
              />
            )}
            {panel === 'slot' && activeSlot !== undefined && (
              <SlotEditor
                slotIndex={activeSlot}
                book={activeBook}
                coverUrl={activeBook?.coverBlobKey ? coverUrls.get(activeBook.coverBlobKey) : undefined}
                onSelect={handleSelectBook}
                onClear={handleClearSlot}
                onBookChange={replaceBook}
                onMove={handleMoveSlot}
                slotCount={board?.slots.length ?? 0}
                slotLabels={slotLabels}
              />
            )}
          </Drawer>
        </div>
      </AntApp>
    </ConfigProvider>
  )
}
