import { Button, Spin, Typography } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import type { Suggestion } from '../../domain/suggestions'
import { CoverStrip } from './CoverStrip'
import styles from './SuggestionsPanel.module.css'

/**
 * Posters the app offers to make.
 *
 * Rows, not cards — matching `MoreSheet` and `ExportSheet`, and pointedly not a
 * three-up grid of suggestion cards, which the global visual rules name as the
 * clearest AI tell. A short list of destinations reads down the left edge.
 *
 * **The covers are the pitch.** A row saying "Five stars · 9 books" is a
 * sentence; a row showing nine covers is the poster. The thumbnails are already
 * blobs in IndexedDB, so the strip costs nothing but the markup — and a reader
 * deciding whether to make something is deciding about the artwork, not about
 * the description of it.
 *
 * Tapping a row previews. It does not write anything, and that is the one thing
 * about this panel that must not change: see `App`'s preview handling and the
 * note on `handleUseMonth` in `CLAUDE.md` for the month of work a
 * writes-on-tap version of this idea already destroyed once.
 */

interface SuggestionsPanelProps {
  suggestions: Suggestion[]
  isLoading: boolean
  /** Build this one in memory and show it on the stage. Never saves. */
  onPreview: (suggestion: Suggestion) => void
  onDismiss: (id: string) => void
  /** Send a reader with nothing to suggest somewhere useful. */
  onImport: () => void
}

/** How many covers a row shows before it stops. More than this and they smear. */
const STRIP_LIMIT = 8

export function SuggestionsPanel({
  suggestions,
  isLoading,
  onPreview,
  onDismiss,
  onImport,
}: SuggestionsPanelProps) {
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spin />
      </div>
    )
  }

  /*
   * Nothing to offer is a real and frequent state, not an error — a new reader
   * has no library, and a reader who has taken every suggestion has cleared the
   * list. Both deserve a sentence rather than an empty panel, and they deserve
   * different ones, since only the first has anything to do.
   */
  if (suggestions.length === 0) {
    return (
      <div className={styles.empty}>
        <Typography.Paragraph className={styles.emptyLead}>
          Nothing to suggest yet.
        </Typography.Paragraph>
        <Typography.Paragraph className={styles.emptyBody}>
          Rate a few books and give them finish dates, and this fills in on its own.
          Bringing your history over from Goodreads does it fastest —{' '}
          <button type="button" className={styles.link} onClick={onImport}>
            import a CSV
          </button>
          .
        </Typography.Paragraph>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <Typography.Paragraph className={styles.lead}>
        Tap one to see the poster. Nothing is saved until you keep it.
      </Typography.Paragraph>

      <ul className={styles.list}>
        {suggestions.map((suggestion) => {
          return (
            <li key={suggestion.id} className={styles.item}>
              <button
                type="button"
                className={styles.row}
                onClick={() => onPreview(suggestion)}
              >
                <span className={styles.text}>
                  <span className={styles.title}>{suggestion.title}</span>
                  <span className={styles.reason}>{suggestion.reason}</span>
                </span>

                <CoverStrip books={suggestion.books} limit={STRIP_LIMIT} />
              </button>

              <Button
                type="text"
                className={styles.dismiss}
                icon={<CloseOutlined />}
                onClick={() => onDismiss(suggestion.id)}
                aria-label={`Dismiss ${suggestion.title}`}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
