import type { ReactNode } from 'react'
import {
  AppstoreOutlined,
  BgColorsOutlined,
  ExportOutlined,
  ReadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import styles from './BottomBar.module.css'

/**
 * The app's navigation, and the only chrome that is always on screen.
 *
 * Five items across, icon over label, in one evenly divided row. It had been
 * two icons, a circular Save, two icons — icon-only, because five *labelled*
 * antd Buttons wrap at 375px. That is true of buttons with the label beside the
 * glyph; it is not true of the stacked arrangement every mobile nav uses, which
 * is what this is. At 375px each item gets 75px and the longest label,
 * "Posters", measures about 44px at 11px. Nothing wraps and nothing truncates.
 *
 * Export is a row item rather than the raised circle it used to be. A circle
 * with a caption underneath does not read as a nav item — it reads as a circle
 * that happens to have text below it, and the four labels beside it would look
 * like Export's had fallen off. It keeps the accent colour instead, which is
 * enough to lead a row of otherwise quiet marks.
 *
 * "Export", not "Save": the poster saves itself continuously to IndexedDB, so a
 * button promising to save it promises the thing that already happened. What it
 * opens is a choice of four — photo or video, to the device or to the share
 * sheet — and "Save" named two of those four. This label has been wrong twice
 * before in both directions; the sheet it opens has been `ExportSheet` the
 * whole time, which was the answer.
 *
 * Not antd Buttons: a Button owns its own inner layout, and stacking a glyph
 * over a label inside one means fighting `.ant-btn` for control of flex
 * direction, height, and padding. A plain button element is less code and the
 * hit target is set here regardless.
 *
 * No tooltips: the bar sits at the bottom of the viewport, so a tooltip opens
 * upward over the drawer the same tap just opened. The label is now on screen
 * permanently, which is what a tooltip was approximating.
 */

export type PanelKind = 'design' | 'import' | 'slot' | 'about' | 'books' | 'posters'

/** Every destination in the bar, including Save — which is an action, not a
 *  panel, and so is identified separately rather than by `PanelKind`. */
type BarItemKey = PanelKind | 'export'

interface BarItem {
  key: BarItemKey
  label: string
  icon: ReactNode
}

/**
 * Left to right, with Save centred. The order is by how often each is reached
 * for, working outward from the middle: Save is what the poster is for, and
 * everything either side is a way to change what gets saved.
 */
const ITEMS: readonly BarItem[] = [
  { key: 'posters', label: 'Posters', icon: <AppstoreOutlined /> },
  { key: 'books', label: 'Books', icon: <ReadOutlined /> },
  { key: 'export', label: 'Export', icon: <ExportOutlined /> },
  { key: 'design', label: 'Design', icon: <BgColorsOutlined /> },
  { key: 'import', label: 'Import', icon: <UploadOutlined /> },
]

interface BottomBarProps {
  /** The panel currently open, so the bar can mark it. `undefined` when the
   *  drawer is closed. */
  activePanel: PanelKind | undefined
  onOpenPanel: (panel: PanelKind) => void
  onExport: () => void
  isExporting: boolean
}

export function BottomBar({
  activePanel,
  onOpenPanel,
  onExport,
  isExporting,
}: BottomBarProps) {
  return (
    <nav className={styles.bar}>
      {ITEMS.map((item) => {
        const isExport = item.key === 'export'
        const isActive = !isExport && item.key === activePanel

        return (
          <button
            key={item.key}
            type="button"
            /* `aria-current` rather than `aria-pressed`: these are
               destinations, and only one is open at a time. */
            aria-current={isActive ? 'page' : undefined}
            aria-label={isExport ? 'Export this poster: save or share' : undefined}
            /* An export takes a visible moment. Blocking the second tap is
               what stops two captures racing each other. */
            disabled={isExport && isExporting}
            onClick={() => (isExport ? onExport() : onOpenPanel(item.key as PanelKind))}
            className={[
              styles.item,
              isExport ? styles.exportItem : '',
              isActive ? styles.active : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.icon}>{item.icon}</span>
            <span className={styles.label}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
