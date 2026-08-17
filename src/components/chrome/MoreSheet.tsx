import type { ReactNode } from 'react'
import { Modal } from 'antd'
import {
  BarChartOutlined,
  InfoCircleOutlined,
  SoundOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { RELEASES } from '../../design/releases'
import type { PanelKind } from './BottomBar'
import styles from './MoreSheet.module.css'

/**
 * The destinations that do not earn a permanent slot in the bar.
 *
 * This exists now and did not before because there is finally something to put
 * in it. A "More" holding only Import would have demoted a constant action
 * behind a tap to make room for features that did not exist yet — a straight
 * downgrade, and the reason `docs/STATS.md` said to build the page first. With
 * Stats built, the menu has real contents and the nav change has a reason.
 *
 * Import moves in here rather than staying out. It is the one item in the bar
 * with an end: a Goodreads CSV is imported once, maybe again a year later, and
 * then never. Stats is something to check, and About holds the backup controls.
 * The ordering is by frequency across the life of the app, not frequency in the
 * first week.
 *
 * Rows rather than a grid, matching `ExportSheet` — a short list of destinations
 * reads down the left edge, and a full-width row is a target a thumb cannot
 * miss. Each carries a line of description because, unlike Save and Share, none
 * of these says what it does from its label alone: "About" in particular gives
 * no hint that a reader's backup lives behind it.
 *
 * **What's new is a destination rather than a section of About.** It had been
 * the third section down inside that panel, which put the app's only record of
 * its own history behind two taps and a scroll, under a heading nobody opens —
 * About reads as legal small print, and a reader looking for what changed has no
 * reason to look inside it. The two were only ever together because About was
 * where the release notes were first built.
 *
 * Its description is the newest release's headline rather than a fixed line.
 * That is the one row here whose contents change between builds, so it is the
 * one row that can say something specific — a static "see what changed" would be
 * telling the reader nothing they could not guess from the label.
 */

interface MoreSheetProps {
  open: boolean
  onSelect: (panel: PanelKind) => void
  onCancel: () => void
}

interface MoreRow {
  key: PanelKind
  label: string
  description: string
  icon: ReactNode
}

const ROWS: readonly MoreRow[] = [
  {
    key: 'stats',
    label: 'Reading stats',
    description: 'What your library adds up to',
    icon: <BarChartOutlined />,
  },
  {
    key: 'whatsNew',
    label: "What's new",
    // The newest headline, so the row says what actually changed rather than
    // that something did. Falls back only if `RELEASES` is ever empty, which
    // is a state the app ships without but the type allows.
    description: RELEASES[0]?.headline ?? 'Recent changes to the app',
    icon: <SoundOutlined />,
  },
  {
    key: 'import',
    label: 'Import from Goodreads',
    description: 'Bring a CSV export across',
    icon: <UploadOutlined />,
  },
  {
    key: 'about',
    label: 'About',
    description: 'Back up your library, and the artwork credits',
    icon: <InfoCircleOutlined />,
  },
]

export function MoreSheet({ open, onSelect, onCancel }: MoreSheetProps) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      title="More"
      centered
      width={380}
      destroyOnHidden
    >
      <div className={styles.rows}>
        {ROWS.map((row) => (
          <button
            key={row.key}
            type="button"
            className={styles.row}
            onClick={() => onSelect(row.key)}
          >
            <span className={styles.icon} aria-hidden>
              {row.icon}
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.description}>{row.description}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
