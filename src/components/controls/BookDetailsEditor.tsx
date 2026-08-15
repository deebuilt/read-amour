import { useCallback, useState } from 'react'
import { Button, DatePicker, Rate, Typography, Upload } from 'antd'
import { PictureOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { storeUploadedImage } from '../../api/covers'
import { saveBook } from '../../storage/db'
import { color, fontSize } from '../../design/tokens'
import type { Book } from '../../types/domain'
import styles from './BookDetailsEditor.module.css'

/**
 * Rating and finish date for the book already in a slot.
 *
 * These fields exist on every book, but until now only some books could have
 * them: a Goodreads row arrived with both, a search result with neither, and a
 * hand-added book could set them once at creation and never again. Which of
 * your books had a rating came down to how it happened to get here, which is
 * not a distinction a reader has any reason to care about.
 *
 * So this edits them wherever the book came from. `Book.source` still records
 * the origin — that is worth keeping — but it no longer decides what you are
 * allowed to fill in.
 */

const DATE_FORMAT = 'YYYY-MM-DD'

/** Matches the manual entry form; a phone photo can be large. */
const MAX_COVER_BYTES = 12 * 1024 * 1024

interface BookDetailsEditorProps {
  book: Book
  /** Called with the updated book once it has been written to storage. */
  onChange: (book: Book) => void
}

export function BookDetailsEditor({ book, onChange }: BookDetailsEditorProps) {
  const [error, setError] = useState<string | undefined>()

  const update = useCallback(
    async (patch: Partial<Book>) => {
      const next = { ...book, ...patch }
      await saveBook(next)
      onChange(next)
    },
    [book, onChange],
  )

  /**
   * Swap in the user's own cover.
   *
   * The old blob is left in place rather than deleted: an Open Library cover
   * is shared across every poster that uses the same book, so removing it here
   * would blank the cover elsewhere. Unreferenced uploads are reclaimed by the
   * orphan sweep instead.
   */
  const handleCover = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('That file is not an image.')
        return false
      }
      if (file.size > MAX_COVER_BYTES) {
        setError('That image is too large. Try one under 12MB.')
        return false
      }

      setError(undefined)
      void storeUploadedImage(file, 'manual-cover').then((coverBlobKey) =>
        update({ coverBlobKey }),
      )
      return false
    },
    [update],
  )

  return (
    <div className={styles.root}>
      <label className={styles.field}>
        <span className={styles.label} style={{ color: color.inkFaint }}>
          Rating
        </span>
        <Rate
          value={book.rating ?? 0}
          // Tapping the set star clears it, so a misfire is undoable — antd
          // reports that as 0, which is the same "unrated" the CSV uses.
          onChange={(value) => void update({ rating: value > 0 ? value : undefined })}
          className={styles.rate}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label} style={{ color: color.inkFaint }}>
          Finished
        </span>
        <DatePicker
          value={book.dateRead ? dayjs(book.dateRead, DATE_FORMAT) : null}
          onChange={(value) =>
            void update({ dateRead: value ? value.format(DATE_FORMAT) : undefined })
          }
          format="D MMMM YYYY"
          placeholder="Not set"
          className={styles.datePicker}
        />
      </label>

      {/*
        A stored cover has no further tie to Open Library — the blob is in
        IndexedDB and `coverId` only records where it came from. So a book
        found by search can keep its title and author and take a better cover,
        which is the fix for an edition whose art is missing or wrong.
      */}
      <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => handleCover(file)}>
        <Button size="small" icon={<PictureOutlined />}>
          {book.coverBlobKey ? 'Replace cover' : 'Add cover'}
        </Button>
      </Upload>

      <Typography.Text style={{ fontSize: fontSize.xs, color: color.inkFaint }}>
        {error ?? 'Rating and date show in your books list, not on the poster.'}
      </Typography.Text>
    </div>
  )
}
