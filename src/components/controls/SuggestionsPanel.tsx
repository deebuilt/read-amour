import { useMemo } from 'react'
import { Button, Spin, Typography } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { useCoverUrlsFor } from '../../hooks/useCoverUrlsFor'
import type { Suggestion } from '../../domain/suggestions'
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
  /*
   * The panel resolves its own covers rather than borrowing the poster's.
   *
   * It used to take `coverUrls` from `App`, which holds URLs for the board on
   * screen — so a suggestion's strip filled in only where its books overlapped
   * the open poster, and emptied when the reader switched posters. The blobs
   * were in storage the whole time; nothing had asked for them.
   *
   * Only the covers actually shown, not every book in every suggestion: the
   * strip stops at `STRIP_LIMIT`, and resolving the tail of a twenty-book
   * suggestion would decode blobs that never reach the screen.
   */
  const coverKeys = useMemo(
    () =>
      suggestions.flatMap((suggestion) =>
        suggestion.books.slice(0, STRIP_LIMIT).map((book) => book.coverBlobKey),
      ),
    [suggestions],
  )
  const coverUrls = useCoverUrlsFor(coverKeys)

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
          const shown = suggestion.books.slice(0, STRIP_LIMIT)
          const hidden = suggestion.books.length - shown.length

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

                <span className={styles.strip} aria-hidden>
                  {shown.map((book) => {
                    const url = book.coverBlobKey
                      ? coverUrls.get(book.coverBlobKey)
                      : undefined

                    return (
                      <span key={book.id} className={styles.thumb}>
                        {url ? (
                          <img className={styles.cover} src={url} alt="" />
                        ) : (
                          /* A book whose cover has not been fetched yet is a
                             blank plate rather than a gap, so the strip keeps
                             its rhythm and the row does not jump when the
                             covers arrive. */
                          <span className={styles.blank} />
                        )}
                      </span>
                    )
                  })}
                  {hidden > 0 && <span className={styles.more}>+{hidden}</span>}
                </span>
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
