import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, ConfigProvider, Drawer, Spin } from 'antd'
import { Poster } from './components/poster/Poster'
import { DesignPanel } from './components/controls/DesignPanel'
import { ImportPanel } from './components/controls/ImportPanel'
import { SlotEditor } from './components/controls/SlotEditor'
import { BookList } from './components/controls/BookList'
import { PostersPanel } from './components/controls/PostersPanel'
import { ExportSheet, type ExportIntent } from './components/controls/ExportSheet'
import { StatsPanel } from './components/stats/StatsPanel'
import { Wordmark } from './components/chrome/Wordmark'
import { ThemeToggle } from './components/chrome/ThemeToggle'
import { AboutPanel } from './components/chrome/AboutPanel'
import { ReleaseNotes } from './components/chrome/ReleaseNotes'
import { MoreSheet } from './components/chrome/MoreSheet'
import { UpdateBanner } from './components/chrome/UpdateBanner'
import { BottomBar, type PanelKind } from './components/chrome/BottomBar'
import { useBoard } from './hooks/useBoard'
import { useCoverUrls } from './hooks/useCoverUrls'
import { useBackgroundUrl } from './hooks/useBackgroundUrl'
import { usePosterSize } from './hooks/usePosterSize'
import { useTheme } from './hooks/useTheme'
import {
  clearSlots,
  createBoard,
  filledCount,
  fillSlots,
  moveSlot,
  setFavouriteBook,
  setSlotBook,
} from './domain/board'
import {
  canSharePoster,
  posterFileName,
  saveBlob,
  savePoster,
  shareBlob,
  sharePoster,
} from './export/exportPoster'
import {
  DEFAULT_DURATION_MS,
  DEFAULT_TRANSITION,
  canExportVideo,
  posterToVideo,
  videoUnavailableReason,
  type TransitionId,
} from './export/posterVideo'
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

/**
 * Drawer headings by panel.
 *
 * A map rather than the chain of ternaries this used to be: at five panels that
 * was already hard to read, and `Record<PanelKind, string>` means adding a panel
 * fails to compile until it has a title, which a ternary chain would have let
 * fall through to an empty heading.
 *
 * The slot editor is the one exception and stays inline, since its heading
 * carries the slot number rather than being a constant.
 */
const PANEL_TITLES: Record<PanelKind, string> = {
  design: 'Design',
  import: 'Import from Goodreads',
  about: 'About',
  whatsNew: "What's new",
  books: 'Books on this poster',
  posters: 'Posters',
  stats: 'Reading stats',
  slot: '',
}

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
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  /** Which export is in flight, so the sheet can say which row is working. */
  const [exporting, setExporting] = useState<ExportIntent | undefined>()
  /**
   * How far the animation has rendered, 0 to 1.
   *
   * The still is fast enough that a spinner covers it; the video is seconds of
   * capture and encoding and needs to say so, or it reads as a hang.
   */
  const [videoProgress, setVideoProgress] = useState(0)
  /**
   * Whether this browser can encode video. Probed once, asynchronously, so the
   * sheet can leave the animation rows out rather than offer a button that
   * fails — the same reasoning as `canSharePoster`.
   */
  const [canAnimate, setCanAnimate] = useState(false)
  /**
   * How long the animation runs. The reader's choice, kept for the session.
   *
   * Not on the `Board`: it is a property of an export rather than of the
   * poster, the way the frame size and the file name are. Two posters do not
   * want different pacing so much as one person does, and putting it on the
   * board would mean a poster carrying a video setting it may never use.
   */
  const [videoDuration, setVideoDuration] = useState(DEFAULT_DURATION_MS)
  /** How each cover arrives. Session-scoped for the same reason as the length. */
  const [videoTransition, setVideoTransition] = useState<TransitionId>(DEFAULT_TRANSITION)

  useEffect(() => {
    let cancelled = false
    void canExportVideo().then((supported) => {
      if (!cancelled) setCanAnimate(supported)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Whether this device can share files at all. Read once — it is a capability
   * of the browser, not something that changes while the app is open — and it
   * decides whether the sheet offers a share row or only a save.
   */
  const canShare = useMemo(() => canSharePoster(), [])

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
   * A choice from the More sheet. The sheet closes as the drawer opens — leaving
   * a modal stacked over the drawer it just opened would need two dismissals to
   * get back to the poster.
   */
  const handleSelectMore = useCallback((next: PanelKind) => {
    setIsMoreOpen(false)
    setPanel(next)
  }, [])

  /**
   * Tapping a bar on the stats timeline opens that month's poster.
   *
   * This is what makes the chart a way to get somewhere rather than an
   * ornament — the bars are months, and a month is a poster. The drawer closes
   * with it, since the poster it switched to is the thing being asked for.
   */
  const handleOpenMonthPoster = useCallback(
    (boardId: string) => {
      void switchBoard(boardId)
      setPanel(undefined)
    },
    [switchBoard],
  )

  /**
   * Mark the poster's favourite from the book list. The panel stays open — the
   * mark lands on the poster behind the drawer, and the star in the row is the
   * confirmation that it worked.
   */
  const handleToggleFavourite = useCallback(
    (bookId: string) => {
      if (!board) return
      updateBoard(setFavouriteBook(board, bookId))
    },
    [board, updateBoard],
  )

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

  /**
   * Render the poster and hand it to whichever export was chosen.
   *
   * Both paths capture identically — the difference is only what happens to the
   * blob afterwards. `isExporting` strips the slot affordances from the render,
   * and the frame has to commit before the capture reads the DOM.
   */
  const runExport = useCallback(
    async (intent: ExportIntent) => {
      if (!posterRef.current || !board) return
      setExporting(intent)
      setVideoProgress(0)
      setIsExporting(true)
      // Let the affordance-free render commit before capturing.
      await new Promise((resolve) => window.setTimeout(resolve, 50))
      try {
        if (intent === 'video' || intent === 'shareVideo') {
          // The animation captures the poster through the same affordance-free
          // render as the PNG — see `posterToVideo`.
          const fileName = posterFileName(board.month, 'mp4')
          const blob = await posterToVideo(posterRef.current, board, {
            fileName,
            durationMs: videoDuration,
            transition: videoTransition,
            onProgress: setVideoProgress,
          })
          // The MIME type is what tells the OS this is motion, so the share
          // sheet offers video targets rather than photo ones.
          if (intent === 'shareVideo') {
            await shareBlob(blob, fileName, 'video/mp4')
          } else {
            await saveBlob(blob, fileName, 'video/mp4')
          }
        } else {
          const options = { fileName: posterFileName(board.month) }
          if (intent === 'save') {
            await savePoster(posterRef.current, options)
          } else {
            await sharePoster(posterRef.current, options)
          }
        }
        setIsExportOpen(false)
      } finally {
        setIsExporting(false)
        setExporting(undefined)
        setVideoProgress(0)
      }
    },
    [board, videoDuration, videoTransition],
  )

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

          {/* Above the bar and below the poster: the one place a notice can go
              without covering the artwork. Renders nothing until a build is
              actually waiting. */}
          <UpdateBanner />

          {/* Export opens a choice rather than picking one: keeping the image
              and posting it are different intentions, and the version that
              guessed always guessed "share" — which meant the copy was never
              written. */}
          <BottomBar
            activePanel={panel}
            onOpenPanel={setPanel}
            onExport={() => setIsExportOpen(true)}
            onOpenMore={() => setIsMoreOpen(true)}
            isExporting={isExporting}
          />

          <Drawer
            open={panel !== undefined}
            onClose={() => {
              setPanel(undefined)
              setActiveSlot(undefined)
            }}
            placement="bottom"
            height="82vh"
            title={
              panel === 'slot'
                ? activeSlot !== undefined
                  ? `Slot ${activeSlot + 1}`
                  : ''
                : panel
                  ? PANEL_TITLES[panel]
                  : ''
            }
            styles={{ body: { paddingTop: 12 } }}
          >
            {panel === 'design' && board && (
              <DesignPanel board={board} coverUrls={coverUrls} onChange={updateBoard} />
            )}
            {panel === 'import' && (
              <ImportPanel
                onUseMonth={(month, monthBooks) => void handleUseMonth(month, monthBooks)}
                usedMonths={usedMonths}
                onCreateAll={handleCreateAllPosters}
              />
            )}
            {panel === 'about' && <AboutPanel onRestored={() => void refreshBoards()} />}
            {panel === 'whatsNew' && <ReleaseNotes />}
            {panel === 'stats' && (
              <StatsPanel
                boards={boards}
                onOpenMonth={handleOpenMonthPoster}
                onImport={() => setPanel('import')}
                onOpenBooks={() => setPanel('books')}
              />
            )}
            {panel === 'books' && board && (
              <BookList
                board={board}
                books={books}
                coverUrls={coverUrls}
                onSlotClick={handleEditSlot}
                onToggleFavourite={handleToggleFavourite}
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

          <MoreSheet
            open={isMoreOpen}
            onSelect={handleSelectMore}
            onCancel={() => setIsMoreOpen(false)}
          />

          <ExportSheet
            open={isExportOpen}
            canShare={canShare}
            busy={exporting}
            canAnimate={canAnimate}
            videoBlockedBy={canAnimate ? undefined : videoUnavailableReason()}
            durationMs={videoDuration}
            transition={videoTransition}
            onTransitionChange={setVideoTransition}
            onDurationChange={setVideoDuration}
            coverCount={board ? filledCount(board) : 0}
            videoProgress={videoProgress}
            onSave={() => void runExport('save')}
            onSaveVideo={() => void runExport('video')}
            onShare={() => void runExport('share')}
            onShareVideo={() => void runExport('shareVideo')}
            onCancel={() => setIsExportOpen(false)}
          />
        </div>
      </AntApp>
    </ConfigProvider>
  )
}
