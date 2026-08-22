import { useState } from 'react'
import { Popover } from 'antd'
import { DensityControls } from './DensityControls'
import { resizeGrid } from '../../domain/board'
import {
  GRID_CAPACITIES,
  gridCapacity,
  orientationsFor,
  type Board,
} from '../../types/domain'
import styles from './LayoutButton.module.css'

/**
 * Layout and spacing, in one button beside the poster.
 *
 * ## Why this is not in the design drawer
 *
 * The drawer is a bottom sheet 82vh tall, so it covers the poster. Layout and
 * spacing are the two settings whose whole point is what they do to the artwork
 * — a slider that moves a cover four pixels is invisible behind a sheet, and
 * picking a grid meant open, tap, close, look, open again.
 *
 * Two earlier attempts got this wrong in instructive ways. Putting the controls
 * in the drawer and fading the drawer while dragging still left every *tap*
 * blind. Putting a scrolling strip of book counts in the chrome under the
 * poster was quick but turned one decision into a row of eleven permanent
 * buttons. Ruthnie: "I envisioned one button, a single button that opened up a
 * little overlay, but that's not as wide as the drawer, and then I select
 * something, and then I could see behind it."
 *
 * So: one button. A popover narrow enough that the poster is still visible
 * beside and below it, holding the shapes and the spacing sliders together,
 * because they are the same decision — how big the covers are.
 *
 * It sits in the app chrome, never inside the poster frame. The export captures
 * `posterRef` alone, so nothing here can reach a PNG.
 */

interface LayoutButtonProps {
  board: Board
  onChange: (board: Board) => void
}

export function LayoutButton({ board, onChange }: LayoutButtonProps) {
  const [open, setOpen] = useState(false)
  /**
   * True while a slider is held. The popover keeps its place and drops to a
   * whisper, so the poster behind it can be watched changing under the thumb.
   */
  const [isPeeking, setIsPeeking] = useState(false)

  const selected = gridCapacity(board.grid)
  const isCustomSpacing = board.density !== undefined

  const content = (
    <div className={isPeeking ? styles.panelPeeking : styles.panel}>
      <div className={styles.shapes}>
        {GRID_CAPACITIES.map((capacity) => {
          const shapes = orientationsFor(capacity)
          const isActive = capacity === selected

          const current = isActive
            ? (shapes.find(
                (shape) =>
                  shape.columns === board.grid.columns && shape.rows === board.grid.rows,
              ) ?? shapes[0])
            : shapes[0]

          // Tapping the selected count again turns it on its side, so one
          // control answers both "how many books" and "which way round".
          const next = isActive
            ? shapes[(shapes.indexOf(current) + 1) % shapes.length]
            : shapes[0]

          const canFlip = shapes.length > 1

          return (
            <button
              key={capacity}
              type="button"
              className={isActive ? styles.shapeActive : styles.shape}
              onClick={() => onChange(resizeGrid(board, next))}
              aria-pressed={isActive}
              aria-label={
                `${capacity} book${capacity === 1 ? '' : 's'}, ` +
                `${current.columns} across by ${current.rows} down` +
                (isActive && canFlip
                  ? `. Tap again for ${next.columns} by ${next.rows}`
                  : '')
              }
            >
              <span className={styles.count}>{capacity}</span>
              <span className={styles.dims}>
                {current.columns}×{current.rows}
                {isActive && canFlip ? ' ⇄' : ''}
              </span>
            </button>
          )
        })}
      </div>

      <div className={styles.sliders}>
        <DensityControls board={board} onChange={onChange} onPeek={setIsPeeking} />
      </div>
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topRight"
      arrow={false}
      /*
        No mask and no dimming: the poster behind this has to stay readable,
        which is the entire reason the controls left the drawer.
      */
      classNames={{ root: styles.popover }}
      content={content}
    >
      <button type="button" className={open ? styles.triggerOpen : styles.trigger}>
        <span className={styles.triggerCount}>{selected}</span>
        <span className={styles.triggerLabel}>
          {board.grid.columns}×{board.grid.rows}
          {isCustomSpacing ? ' ·' : ''}
        </span>
      </button>
    </Popover>
  )
}
