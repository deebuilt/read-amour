import { Button, Typography } from 'antd'
import styles from './PreviewBar.module.css'

/**
 * The bar that says the poster on screen is not saved yet.
 *
 * **This exists because a suggestion must never write on tap.** That is not
 * caution — it is a bug this codebase has already shipped: `handleUseMonth` used
 * to overwrite whatever poster was open, and it silently destroyed a month of
 * work. A suggestion engine that saved on tap would be the same bug with a
 * friendlier face, and worse, because the reader did not even choose the books.
 *
 * So tapping a suggestion builds a `Board` in memory and shows it here, and
 * nothing reaches IndexedDB until Keep. Discard returns to the poster that was
 * open, untouched.
 *
 * It sits between the stage and the bottom bar — the one place a notice can go
 * without covering the artwork, which is the whole thing being judged. The bar
 * is deliberately loud where `WhatsNewNote` is quiet: an unsaved poster is a
 * state the reader has to leave, and one that looked incidental would strand
 * someone in a preview wondering why their real poster had vanished.
 */

interface PreviewBarProps {
  /** What the reader is looking at, named so the bar says what it would save. */
  title: string
  /** Whether covers are still arriving, so Keep can say the poster is filling. */
  isResolving: boolean
  onKeep: () => void
  onDiscard: () => void
  /** Set while the board is being written, so Keep cannot fire twice. */
  isSaving: boolean
}

export function PreviewBar({
  title,
  isResolving,
  onKeep,
  onDiscard,
  isSaving,
}: PreviewBarProps) {
  return (
    <div className={styles.bar} role="status">
      <span className={styles.text}>
        <Typography.Text className={styles.title}>{title}</Typography.Text>
        <Typography.Text className={styles.note}>
          {isResolving ? 'Finding covers…' : 'Not saved yet'}
        </Typography.Text>
      </span>

      <span className={styles.actions}>
        <Button size="small" onClick={onDiscard} disabled={isSaving}>
          Discard
        </Button>
        <Button size="small" type="primary" onClick={onKeep} loading={isSaving}>
          Keep
        </Button>
      </span>
    </div>
  )
}
