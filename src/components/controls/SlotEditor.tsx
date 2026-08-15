import { Button, Typography } from 'antd'
import { BookSearch } from './BookSearch'
import { color, fontSize } from '../../design/tokens'
import type { Book } from '../../types/domain'
import styles from './SlotEditor.module.css'

/**
 * What opens when a slot is tapped.
 *
 * A filled slot shows what is in it and offers removal before search, because
 * "wrong cover, get it out" is the more urgent of the two intents.
 */

interface SlotEditorProps {
  slotIndex: number
  book?: Book
  coverUrl?: string
  onSelect: (book: Book) => void
  onClear: () => void
}

export function SlotEditor({ slotIndex, book, coverUrl, onSelect, onClear }: SlotEditorProps) {
  return (
    <div className={styles.root}>
      {book && (
        <div className={styles.current}>
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
      )}

      <BookSearch onSelect={onSelect} />
    </div>
  )
}
