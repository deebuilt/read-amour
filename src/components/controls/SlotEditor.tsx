import { Button, Select, Tabs, Typography } from 'antd'
import { BookSearch } from './BookSearch'
import { BookDetailsEditor } from './BookDetailsEditor'
import { ManualBookForm } from './ManualBookForm'
import { color, fontSize } from '../../design/tokens'
import type { Book } from '../../types/domain'
import styles from './SlotEditor.module.css'

/**
 * What opens when a slot is tapped.
 *
 * A filled slot shows what is in it and offers removal before search, because
 * "wrong cover, get it out" is the more urgent of the two intents.
 *
 * Search leads and manual entry is the second tab: searching works for most
 * books, and manual entry is the fallback for the ones Open Library has no
 * record of — mostly very recent releases.
 */

interface SlotEditorProps {
  slotIndex: number
  book?: Book
  coverUrl?: string
  onSelect: (book: Book) => void
  onClear: () => void
  /** A book already in the slot was edited in place. */
  onBookChange: (book: Book) => void
  /** Move this slot's book to another slot, swapping if that one is filled. */
  onMove: (to: number) => void
  /** Every slot on the board, for the move target list. */
  slotCount: number
  /** Titles by slot index, so the move list says what is already in each. */
  slotLabels: ReadonlyMap<number, string>
}

export function SlotEditor({
  slotIndex,
  book,
  coverUrl,
  onSelect,
  onClear,
  onBookChange,
  onMove,
  slotCount,
  slotLabels,
}: SlotEditorProps) {
  return (
    <div className={styles.root}>
      {book && (
        <div className={styles.current}>
          <div className={styles.currentTop}>
            {coverUrl && <img className={styles.currentCover} src={coverUrl} alt="" />}
            <div className={styles.currentMeta}>
              <Typography.Text style={{ fontSize: fontSize.base }}>{book.title}</Typography.Text>
              <Typography.Text style={{ fontSize: fontSize.sm, color: color.inkFaint }}>
                {book.author}
              </Typography.Text>
              <Button size="small" danger type="text" onClick={onClear} className={styles.clear}>
                Remove from slot {slotIndex + 1}
              </Button>
            </div>
          </div>

          <BookDetailsEditor book={book} onChange={onBookChange} />

          {/*
            A select rather than drag-and-drop: this is a phone-first app, and
            dragging a cover across a 9:16 poster scaled to a 375px screen is
            fiddly at best. Picking the destination is exact, works with a
            thumb, and is reachable by keyboard and screen reader for free.

            Occupied destinations are offered rather than disabled, because
            swapping two books is the common intent — it is how you reorder a
            full poster.
          */}
          <label className={styles.move}>
            <span className={styles.moveLabel} style={{ color: color.inkFaint }}>
              Move to
            </span>
            <Select
              value={slotIndex}
              onChange={onMove}
              size="middle"
              className={styles.moveSelect}
              options={Array.from({ length: slotCount }, (_, index) => {
                const occupant = slotLabels.get(index)
                return {
                  value: index,
                  label:
                    index === slotIndex
                      ? `Slot ${index + 1} (here)`
                      : occupant
                        ? `Slot ${index + 1} — swap with ${occupant}`
                        : `Slot ${index + 1} — empty`,
                }
              })}
            />
          </label>
        </div>
      )}

      <Tabs
        defaultActiveKey="search"
        className={styles.tabs}
        items={[
          { key: 'search', label: 'Search', children: <BookSearch onSelect={onSelect} /> },
          { key: 'manual', label: 'Add by hand', children: <ManualBookForm onSelect={onSelect} /> },
        ]}
      />
    </div>
  )
}
