import { useCallback, useRef, useState } from 'react'
import { App as AntApp, Button, ConfigProvider, Drawer, Spin } from 'antd'
import { Poster } from './components/poster/Poster'
import { DesignPanel } from './components/controls/DesignPanel'
import { ImportPanel } from './components/controls/ImportPanel'
import { SlotEditor } from './components/controls/SlotEditor'
import { Wordmark } from './components/chrome/Wordmark'
import { ThemeToggle } from './components/chrome/ThemeToggle'
import { AboutPanel } from './components/chrome/AboutPanel'
import { useBoard } from './hooks/useBoard'
import { useCoverUrls } from './hooks/useCoverUrls'
import { useBackgroundUrl } from './hooks/useBackgroundUrl'
import { usePosterSize } from './hooks/usePosterSize'
import { useTheme } from './hooks/useTheme'
import { clearSlots, fillSlots, setSlotBook } from './domain/board'
import { downloadPoster, posterFileName } from './export/exportPoster'
import { monthName } from './import/goodreads'
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

type PanelKind = 'design' | 'import' | 'slot' | 'about'

export default function App() {
  const { preference, resolved, cycle } = useTheme()
  const { board, isLoading, updateBoard } = useBoard()
  const { books, coverUrls } = useCoverUrls(board)
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

  const handleUseMonth = useCallback(
    (month: string, monthBooks: Book[]) => {
      if (!board) return
      const cleared = clearSlots(board)
      const filled = fillSlots(cleared, monthBooks)
      updateBoard({
        ...filled,
        month,
        text: { ...filled.text, title: monthName(month) },
      })
      setPanel(undefined)
    },
    [board, updateBoard],
  )

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

          <nav className={styles.bar}>
            <Button type="text" onClick={() => setPanel('import')}>
              Import
            </Button>
            <Button type="text" onClick={() => setPanel('design')}>
              Design
            </Button>
            <Button type="primary" onClick={() => void handleExport()} loading={isExporting}>
              Save image
            </Button>
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
                    : activeSlot !== undefined
                      ? `Slot ${activeSlot + 1}`
                      : ''
            }
            styles={{ body: { paddingTop: 12 } }}
          >
            {panel === 'design' && board && <DesignPanel board={board} onChange={updateBoard} />}
            {panel === 'import' && <ImportPanel onUseMonth={handleUseMonth} />}
            {panel === 'about' && <AboutPanel />}
            {panel === 'slot' && activeSlot !== undefined && (
              <SlotEditor
                slotIndex={activeSlot}
                book={activeBook}
                coverUrl={activeBook?.coverBlobKey ? coverUrls.get(activeBook.coverBlobKey) : undefined}
                onSelect={handleSelectBook}
                onClear={handleClearSlot}
              />
            )}
          </Drawer>
        </div>
      </AntApp>
    </ConfigProvider>
  )
}
