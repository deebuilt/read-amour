import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, ConfigProvider, Drawer, Spin } from 'antd'
import { Poster } from './components/poster/Poster'
import { DesignPanel } from './components/controls/DesignPanel'
import { ImportPanel } from './components/controls/ImportPanel'
import { SlotEditor } from './components/controls/SlotEditor'
import { BookList } from './components/controls/BookList'
import { PostersPanel } from './components/controls/PostersPanel'
import { ExportSheet, type ExportIntent } from './components/controls/ExportSheet'
import { SuggestionsPanel } from './components/controls/SuggestionsPanel'
import { PreviewBar } from './components/controls/PreviewBar'
import { StatsPanel } from './components/stats/StatsPanel'
import { Wordmark } from './components/chrome/Wordmark'
import { ThemeToggle } from './components/chrome/ThemeToggle'
import { AboutPanel } from './components/chrome/AboutPanel'
import { SuggestButton } from './components/chrome/SuggestButton'
import { ReleaseNotes } from './components/chrome/ReleaseNotes'
import { MoreSheet } from './components/chrome/MoreSheet'
import { WhatsNewNote } from './components/chrome/WhatsNewNote'
import { BottomBar, type PanelKind } from './components/chrome/BottomBar'
import { useBoard } from './hooks/useBoard'
import { useSuggestions } from './hooks/useSuggestions'
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
import { resolveCoversForBooks } from './api/covers'
import type { Suggestion } from './domain/suggestions'
import { getBoardByMonth, saveBoard, saveBooks } from './storage/db'
import { buildAntTheme } from './design/antTheme'
import { gridCapacity, type Board, type Book } from './types/domain'
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
  suggestions: 'Poster ideas',
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
  /**
   * A suggested poster, built in memory and shown on the stage unsaved.
   *
   * Nothing about it reaches storage until Keep. This is the whole safety
   * property of the feature — see `PreviewBar` for the month of work the
   * writes-on-tap version of this idea destroyed once already.
   */
  const [preview, setPreview] = useState<Board | undefined>()
  /** Which suggestion the preview came from, so Keep can dismiss it after. */
  const [previewSource, setPreviewSource] = useState<Suggestion | undefined>()
  const [isResolvingCovers, setIsResolvingCovers] = useState(false)
  const [isKeeping, setIsKeeping] = useState(false)

  /**
   * The board on screen — the preview when there is one, the saved poster
   * otherwise. Everything that renders or exports reads this rather than
   * `board`, so a preview behaves like a real poster in every way except that
   * it has not been written down.
   */
  const displayed = preview ?? board

  const { books, coverUrls, replaceBook } = useCoverUrls(displayed)
  const backgroundUrl = useBackgroundUrl(displayed?.background)
  const { containerRef, posterWidth } = usePosterSize()
  const {
    suggestions,
    isLoading: isLoadingSuggestions,
    dismiss: dismissSuggestion,
    reload: reloadSuggestions,
  } = useSuggestions(boards)

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

  /**
   * Open a slot for editing.
   *
   * Ignored while a preview is on screen. Every slot mutation goes through
   * `updateBoard`, which writes to storage and to the saved board — so editing a
   * previewed poster would either silently save the preview or, worse, apply the
   * edit to the poster hiding underneath it. A preview is a thing to accept or
   * reject, and it becomes editable the moment it is kept.
   */
  const openSlot = useCallback(
    (index: number) => {
      if (preview) return
      setActiveSlot(index)
      setPanel('slot')
    },
    [preview],
  )

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
   * Drop the preview. Nothing was written, so there is nothing to undo — the
   * poster underneath was never replaced, only covered.
   */
  const handleDiscardPreview = useCallback(() => {
    setPreview(undefined)
    setPreviewSource(undefined)
  }, [])

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
      // Same reasoning as `handleSwitchPoster`: an open preview would stay on
      // the stage while the board underneath it changed.
      handleDiscardPreview()
      const existing = await getBoardByMonth(month)
      // Bring the target on screen first: filling and then switching would
      // reload the pre-fill record from storage and throw the books away.
      if (existing) await switchBoard(existing.id)
      const target = existing ?? (await startNewBoard(month, monthName(month)))
      updateBoard(fillSlots(clearSlots(target), monthBooks))
    },
    [startNewBoard, switchBoard, updateBoard, handleDiscardPreview],
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

  /**
   * Show a suggestion, without saving anything.
   *
   * The board is assembled here in memory — `createBoard`, then its grid, then
   * the books — and handed to the stage. Storage is not touched, `useBoard` is
   * not told, and the poster the reader had open is still exactly where it was.
   *
   * Covers resolve after the preview is on screen rather than before it, the
   * way the import panel does it. A cross-month selection routinely includes
   * books whose covers were never fetched — covers arrive per month, and a
   * five-star year cuts across all of them — so blocking the preview on the
   * network would mean tapping a suggestion and watching a spinner for however
   * long twenty lookups take.
   */
  const handlePreviewSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      const fresh = createBoard(suggestion.month, suggestion.title)
      const shaped: Board = {
        ...fresh,
        grid: suggestion.grid,
        slots: Array.from({ length: gridCapacity(suggestion.grid) }, (_, index) => ({
          index,
        })),
        text: { ...fresh.text, subtitle: suggestion.subtitle },
      }

      setPreview(fillSlots(shaped, suggestion.books))
      setPreviewSource(suggestion)
      setPanel(undefined)

      // Only the books that still have no cover, so a library that has already
      // been through an import makes no requests at all.
      const missing = suggestion.books.filter((book) => !book.coverBlobKey)
      if (missing.length === 0) return

      setIsResolvingCovers(true)
      try {
        const covers = await resolveCoversForBooks(missing)
        if (covers.size === 0) return

        // `flatMap` rather than map-then-filter: spreading a resolved key onto
        // a book narrows `coverBlobKey` to `string`, which is narrower than
        // `Book` — so a `book is Book` predicate is not a legal narrowing and
        // the build rejects it. Returning zero or one element per book says the
        // same thing without asserting a type at all.
        const updated: Book[] = missing.flatMap((book) => {
          const coverBlobKey = covers.get(book.id)
          return coverBlobKey ? [{ ...book, coverBlobKey }] : []
        })

        // Books are written even though the poster is not. A resolved cover is
        // a fact about the book, not about this preview — it belongs to the
        // library whether or not the reader keeps the poster, and discarding
        // one should not throw away the fetching it just paid for.
        await saveBooks(updated)
        updated.forEach(replaceBook)

        // Recompute the suggestions against the covers that just landed.
        //
        // The books saved above are the same records the suggestion rows are
        // built from, but `suggestions` is state holding the objects as they
        // were BEFORE the fetch — so without this the strips stay blank until
        // something else reloads them. That was the reported quirk: covers only
        // appeared after a poster had been built and the panel reopened.
        reloadSuggestions()
      } finally {
        setIsResolvingCovers(false)
      }
    },
    [replaceBook, reloadSuggestions],
  )

  /**
   * Save the previewed poster and switch to it.
   *
   * Always a NEW poster, never a replacement for the open one — the same rule
   * import follows, and for the same reason. The suggestion is dismissed on the
   * way out: it has been taken, so continuing to offer it would be the app
   * suggesting a poster that now exists.
   */
  const handleKeepPreview = useCallback(async () => {
    if (!preview) return
    setIsKeeping(true)
    try {
      await saveBoard(preview)
      if (previewSource) dismissSuggestion(previewSource.id)
      setPreview(undefined)
      setPreviewSource(undefined)
      await switchBoard(preview.id)
      reloadSuggestions()
    } finally {
      setIsKeeping(false)
    }
  }, [preview, previewSource, dismissSuggestion, switchBoard, reloadSuggestions])

  /**
   * Asking for a different poster abandons an open preview.
   *
   * `displayed` prefers the preview over the saved board, so leaving one up
   * across a switch would keep the suggested poster on the stage while the app
   * quietly changed which board was underneath it — the switch would read as
   * having failed, and the reader could then export the preview believing it
   * was the poster they had just chosen. Nothing was written, so dropping it
   * costs only the covers, which were saved to the library on their own.
   */
  const handleSwitchPoster = useCallback(
    (id: string) => {
      handleDiscardPreview()
      void switchBoard(id)
      setPanel(undefined)
    },
    [switchBoard, handleDiscardPreview],
  )

  const handleStartPoster = useCallback(
    (month: string, title: string) => {
      handleDiscardPreview()
      void startNewBoard(month, title)
      setPanel(undefined)
    },
    [startNewBoard, handleDiscardPreview],
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
    displayed?.slots.forEach((slot) => {
      const title = slot.bookId ? books.get(slot.bookId)?.title : undefined
      if (title) labels.set(slot.index, title)
    })
    return labels
  }, [displayed, books])

  /**
   * Render the poster and hand it to whichever export was chosen.
   *
   * Both paths capture identically — the difference is only what happens to the
   * blob afterwards. `isExporting` strips the slot affordances from the render,
   * and the frame has to commit before the capture reads the DOM.
   */
  const runExport = useCallback(
    async (intent: ExportIntent) => {
      // The displayed board, not the saved one: `posterRef` renders whatever is
      // on the stage, so exporting a preview against `board` would name the file
      // after the poster hiding underneath and animate the wrong slot count.
      if (!posterRef.current || !displayed) return
      setExporting(intent)
      setVideoProgress(0)
      setIsExporting(true)
      // Let the affordance-free render commit before capturing.
      await new Promise((resolve) => window.setTimeout(resolve, 50))
      try {
        if (intent === 'video' || intent === 'shareVideo') {
          // The animation captures the poster through the same affordance-free
          // render as the PNG — see `posterToVideo`.
          const fileName = posterFileName(displayed.month, 'mp4')
          const blob = await posterToVideo(posterRef.current, displayed, {
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
          const options = { fileName: posterFileName(displayed.month) }
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
    [displayed, videoDuration, videoTransition],
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
            {/* The slot that used to be a spacer offsetting the toggle. The
                button is the same 44px, so the wordmark stays centred by the
                same arithmetic — see `SuggestButton` for why this corner and
                not the More menu. */}
            <SuggestButton
              count={suggestions.length}
              isActive={panel === 'suggestions'}
              onClick={() => setPanel('suggestions')}
            />
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
            {isLoading || !displayed ? (
              <div className={styles.loading}>
                <Spin />
              </div>
            ) : (
              <Poster
                ref={posterRef}
                board={displayed}
                books={books}
                coverUrls={coverUrls}
                backgroundUrl={backgroundUrl}
                displayWidth={posterWidth}
                onSlotClick={openSlot}
                isExporting={isExporting}
              />
            )}
          </main>

          {/* An unsaved poster has to say so, in the one place a notice fits
              without covering the artwork being judged. */}
          {preview && (
            <PreviewBar
              title={preview.text.title}
              isResolving={isResolvingCovers}
              isSaving={isKeeping}
              onKeep={() => void handleKeepPreview()}
              onDiscard={handleDiscardPreview}
            />
          )}

          {/* Above the bar and below the poster: the one place a notice can go
              without covering the artwork. Renders nothing until a build is
              actually waiting. */}
          <WhatsNewNote />

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
            {panel === 'suggestions' && (
              <SuggestionsPanel
                suggestions={suggestions}
                isLoading={isLoadingSuggestions}
                onPreview={(suggestion) => void handlePreviewSuggestion(suggestion)}
                onDismiss={dismissSuggestion}
                onImport={() => setPanel('import')}
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
            coverCount={displayed ? filledCount(displayed) : 0}
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
