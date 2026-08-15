import { useId, useState, type ReactNode } from 'react'
import { RightOutlined } from '@ant-design/icons'
import { Typography } from 'antd'
import styles from './PanelSection.module.css'

/**
 * One labelled block of the design drawer, optionally collapsible.
 *
 * The drawer grew to eight sections in an 82vh sheet, with the two tallest —
 * the photo designs and the background swatches — sitting at the top. Reaching
 * the typeface or the words meant scrolling past both every single time the
 * drawer opened.
 *
 * Collapsing *everything* would trade that scroll for a wall of eight closed
 * rows and a tap before any control, which is not obviously better. So this is
 * opt-in per section: the tall pickers collapse, the short controls stay open
 * and immediately usable.
 *
 * A closed section still shows what it is set to, so the drawer answers "what
 * is this poster using?" at a glance rather than hiding the answer behind a tap.
 */

interface PanelSectionProps {
  label: string
  children: ReactNode
  /** Omit for a plain always-open section. */
  collapsible?: boolean
  /** Shown beside the label while closed — the current value, in words. */
  summary?: string
  defaultOpen?: boolean
}

export function PanelSection({
  label,
  children,
  collapsible = false,
  summary,
  defaultOpen = false,
}: PanelSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const bodyId = useId()

  if (!collapsible) {
    return (
      <section className={styles.section}>
        <Typography.Text className={styles.label}>{label}</Typography.Text>
        {children}
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={bodyId}
      >
        <span className={styles.heading}>
          <Typography.Text className={styles.label}>{label}</Typography.Text>
          {!isOpen && summary && (
            <Typography.Text className={styles.summary}>{summary}</Typography.Text>
          )}
        </span>
        <RightOutlined
          className={isOpen ? `${styles.caret} ${styles.caretOpen}` : styles.caret}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div id={bodyId} className={styles.body}>
          {children}
        </div>
      )}
    </section>
  )
}
