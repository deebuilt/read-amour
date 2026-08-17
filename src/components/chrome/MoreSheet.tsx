import type { ReactNode } from 'react'
import { Modal } from 'antd'
import { BarChartOutlined, InfoCircleOutlined, UploadOutlined } from '@ant-design/icons'
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
 * of these three says what it does from its label alone: "About" in particular
 * gives no hint that a reader's backup lives behind it.
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
