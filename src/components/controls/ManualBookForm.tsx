import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, DatePicker, Input, Rate, Typography, Upload } from 'antd'
import dayjs from 'dayjs'
import { createManualBook } from '../../domain/manualBook'
import { color, fontSize } from '../../design/tokens'
import type { Book } from '../../types/domain'
import styles from './ManualBookForm.module.css'

/**
 * Add a book the catalogue does not have.
 *
 * The cover is the only required field beyond a title, because the poster is
 * made of covers — a manual book without one would place an empty rectangle.
 * Date and rating are optional and exist so a hand-added book can carry the
 * same detail a Goodreads row does, which the book list then reads back.
 */

/** Covers are held in memory before saving; a phone photo can be large. */
const MAX_COVER_BYTES = 12 * 1024 * 1024

/** Stored ISO, shown long-form. `Book.dateRead` is ISO everywhere else too. */
const DATE_FORMAT = 'YYYY-MM-DD'

interface ManualBookFormProps {
  onSelect: (book: Book) => void
}

interface CoverChoice {
  file: File
  previewUrl: string
}

export function ManualBookForm({ onSelect }: ManualBookFormProps) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [dateRead, setDateRead] = useState<string | undefined>()
  const [rating, setRating] = useState(0)
  const [cover, setCover] = useState<CoverChoice | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)

  // The preview URL is this component's to own; revoke it when it is replaced
  // or the form unmounts, or every discarded pick leaks for the session.
  const previewRef = useRef<string | undefined>(undefined)
  previewRef.current = cover?.previewUrl

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  const handleCover = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.')
      return false
    }
    if (file.size > MAX_COVER_BYTES) {
      setError('That image is too large. Try one under 12MB.')
      return false
    }

    setError(undefined)
    setCover((previous) => {
      if (previous) URL.revokeObjectURL(previous.previewUrl)
      return { file, previewUrl: URL.createObjectURL(file) }
    })
    return false
  }, [])

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError('Give the book a title.')
      return
    }
    if (!cover) {
      setError('Choose a cover image — the poster is made of covers.')
      return
    }

    setIsSaving(true)
    setError(undefined)
    try {
      const book = await createManualBook({
        title,
        author,
        coverFile: cover.file,
        dateRead,
        rating: rating > 0 ? rating : undefined,
      })
      // The blob now lives in IndexedDB, so the preview URL has no further job.
      URL.revokeObjectURL(cover.previewUrl)
      setCover(undefined)
      setTitle('')
      setAuthor('')
      setDateRead(undefined)
      setRating(0)
      onSelect(book)
    } catch {
      setError('Could not save that book. Your browser may be out of storage.')
    } finally {
      setIsSaving(false)
    }
  }, [title, author, cover, dateRead, rating, onSelect])

  return (
    <div className={styles.root}>
      <Typography.Paragraph style={{ fontSize: fontSize.sm, color: color.inkSoft }}>
        For books the catalogue has not caught up with yet. Screenshot the cover,
        or save it from anywhere, and fill in the rest.
      </Typography.Paragraph>

      <div className={styles.coverRow}>
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => handleCover(file)}
        >
          <button type="button" className={styles.coverPick}>
            {cover ? (
              <img className={styles.coverPreview} src={cover.previewUrl} alt="" />
            ) : (
              <span className={styles.coverPlaceholder}>
                <span className={styles.coverPlaceholderMark}>+</span>
                <span className={styles.coverPlaceholderText}>Cover</span>
              </span>
            )}
          </button>
        </Upload>

        <div className={styles.fields}>
          <Input
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            size="large"
          />
          <Input
            placeholder="Author"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            size="large"
          />
        </div>
      </div>

      <div className={styles.optional}>
        <label className={styles.field}>
          <span className={styles.fieldLabel} style={{ color: color.inkFaint }}>
            Finished
          </span>
          <DatePicker
            value={dateRead ? dayjs(dateRead, DATE_FORMAT) : null}
            onChange={(value) => setDateRead(value ? value.format(DATE_FORMAT) : undefined)}
            format="D MMMM YYYY"
            placeholder="Optional"
            className={styles.datePicker}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel} style={{ color: color.inkFaint }}>
            Rating
          </span>
          <Rate value={rating} onChange={setRating} className={styles.rate} />
        </label>
      </div>

      {error && <Alert type="error" message={error} showIcon />}

      <Button type="primary" size="large" block loading={isSaving} onClick={() => void handleSave()}>
        Add to slot
      </Button>
    </div>
  )
}
