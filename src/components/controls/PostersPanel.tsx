import { useCallback, useState } from 'react'
import { Button, DatePicker, Input, Popconfirm, Tooltip, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { currentMonthKey, filledCount } from '../../domain/board'
import { useBoardCovers } from '../../hooks/useBoardCovers'
import { formatMonth, monthName } from '../../import/goodreads'
import { color, fontSize } from '../../design/tokens'
import type { Board } from '../../types/domain'
import { CoverStrip } from './CoverStrip'
import styles from './PostersPanel.module.css'

/**
 * Saved posters, and the actions that move between them.
 *
 * These were called months for most of the build, because a monthly reading
 * poster was the thing that started it. Nothing in the app ever enforced that
 * — the title is a free text field, so a poster can be a year in review or a
 * themed list just as easily. The UI calls them posters accordingly. The month
 * survives underneath as the key the Goodreads importer groups rows by, and as
 * where the default title comes from.
 *
 * Reset and delete are deliberately different: reset empties the slots and
 * keeps the design you tuned, delete removes the poster entirely.
 */

const MONTH_FORMAT = 'YYYY-MM'

/** How many covers a poster row shows before the rest become a count. */
const STRIP_LIMIT = 8

interface PostersPanelProps {
  board: Board
  boards: Board[]
  onSwitch: (id: string) => void
  onStart: (month: string, title: string) => void
  onRename: (id: string, title: string) => void
  onRemove: (id: string) => void
}

export function PostersPanel({
  board,
  boards,
  onSwitch,
  onStart,
  onRename,
  onRemove,
}: PostersPanelProps) {
  const coversFor = useBoardCovers(boards)
  const [month, setMonth] = useState(currentMonthKey())
  const [title, setTitle] = useState('')
  /** Id of the poster being renamed in place, with its in-progress name. */
  const [editing, setEditing] = useState<{ id: string; value: string } | undefined>()

  const handleStart = useCallback(() => {
    onStart(month, title)
    setTitle('')
  }, [month, title, onStart])

  const commitRename = useCallback(() => {
    if (!editing) return
    const next = editing.value.trim()
    // An empty name would leave the row reading "Untitled" with no way back.
    if (next) onRename(editing.id, next)
    setEditing(undefined)
  }, [editing, onRename])

  return (
    <div className={styles.root}>
      {/*
        Creating comes first: the saved list grows without limit, and once it is
        a dozen months long the create field sits below the fold — the one
        action you opened this panel to reach becomes the one you have to hunt
        for. A fixed-height control above a scrolling list stays put.
      */}
      <section className={styles.section}>
        <h3 className={styles.heading}>New poster</h3>
        <Input
          placeholder={monthName(month)}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          size="large"
          maxLength={40}
        />
        <div className={styles.startRow}>
          {/* The month is what the Goodreads import groups by, so it is worth
              setting — but it is secondary to what you call the poster. */}
          <DatePicker
            picker="month"
            value={dayjs(month, MONTH_FORMAT)}
            onChange={(value) => setMonth(value ? value.format(MONTH_FORMAT) : currentMonthKey())}
            format="MMMM YYYY"
            allowClear={false}
            size="large"
            className={styles.monthPicker}
          />
          <Button type="primary" size="large" onClick={handleStart}>
            Create
          </Button>
        </div>
        <Typography.Text style={{ fontSize: fontSize.xs, color: color.inkFaint }}>
          Untitled posters take the month's name. You can rename it any time in Design.
        </Typography.Text>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Saved posters</h3>
        <ol className={styles.list}>
          {boards.map((saved) => {
            const isActive = saved.id === board.id
            const count = filledCount(saved)

            if (editing?.id === saved.id) {
              return (
                <li key={saved.id} className={styles.item}>
                  <Input
                    value={editing.value}
                    onChange={(event) => setEditing({ id: saved.id, value: event.target.value })}
                    onPressEnter={commitRename}
                    onBlur={commitRename}
                    maxLength={40}
                    autoFocus
                    className={styles.renameInput}
                  />
                </li>
              )
            }

            return (
              <li key={saved.id} className={styles.item}>
                <button
                  type="button"
                  className={isActive ? `${styles.poster} ${styles.posterActive}` : styles.poster}
                  onClick={() => onSwitch(saved.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  {/* The title is the poster's identity — the month is context
                      under it, because two posters may share one. */}
                  <span className={styles.posterName}>{saved.text.title || 'Untitled'}</span>
                  <span className={styles.posterMeta} style={{ color: color.inkFaint }}>
                    {formatMonth(saved.month)}
                    {' · '}
                    {count === 0 ? 'Empty' : `${count} ${count === 1 ? 'book' : 'books'}`}
                    {isActive && ' · open'}
                  </span>
                  {/* Which books are on it. Telling a filled poster from an
                      empty one used to mean opening each in turn. */}
                  <CoverStrip books={coversFor.get(saved.id) ?? []} limit={STRIP_LIMIT} width={24} />
                </button>

                {/* Renaming here edits the poster's title, the same field the
                    Design panel shows — a poster's name and its artwork title
                    are one thing, not two that could drift apart. */}
                <Tooltip title="Rename">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label={`Rename ${saved.text.title || 'poster'}`}
                    onClick={() => setEditing({ id: saved.id, value: saved.text.title })}
                    className={styles.rowAction}
                  />
                </Tooltip>

                <Popconfirm
                  title={`Delete ${saved.text.title || 'this poster'}?`}
                  description="The poster and its layout go. Your books stay."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  cancelText="Keep"
                  onConfirm={() => onRemove(saved.id)}
                >
                  <Tooltip title="Delete">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Delete ${saved.text.title || 'poster'}`}
                      className={styles.rowAction}
                    />
                  </Tooltip>
                </Popconfirm>
              </li>
            )
          })}
        </ol>
      </section>

    </div>
  )
}
