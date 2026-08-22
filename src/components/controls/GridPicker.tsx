import type { CSSProperties } from 'react'
import { Typography } from 'antd'
import {
  GRID_CAPACITIES,
  gridCapacity,
  orientationsFor,
  type GridConfig,
} from '../../types/domain'
import styles from './GridPicker.module.css'

/**
 * Poster layout picker.
 *
 * This replaced a pair of columns/rows sliders, and the reason is worth
 * keeping. The sliders let the user reach any shape from 2x2 to 5x6, most of
 * which made a poor poster, so they asked her to solve a geometry problem in
 * order to answer the question she actually had, which is how many books fit.
 *
 * So this lists **capacities, not shapes** — one card per book count. Most
 * counts have two shapes, a wide one and its tall transpose, and the card
 * cycles between them when it is tapped again while already selected. The
 * shape is a real preference and a secondary one: the wide orientation gives
 * the larger cover at every capacity (see `GRID_LAYOUTS`), so it leads, and the
 * tall one is a tap away for anyone who wants the block to read differently.
 *
 * Cycling rather than listing both keeps the primary question first. Two cards
 * per count would double the list and ask the reader to compare eighteen
 * options where she has one decision to make.
 */

/**
 * The miniature poster each option draws, in CSS pixels.
 *
 * Declared here rather than in the stylesheet, and handed to it as custom
 * properties, because `previewCell` below has to do arithmetic with these two
 * numbers. Written in both files they would be a frame size and a cell size
 * that silently stop agreeing — the preview would overflow again and the cause
 * would be a 27 in one file and a 30 in another.
 */
const PREVIEW = { width: 27, gap: 2 } as const

/** The frame size, as the variables `.preview` reads. */
const PREVIEW_VARS = {
  '--ra-preview-width': `${PREVIEW.width}px`,
  '--ra-preview-gap': `${PREVIEW.gap}px`,
} as CSSProperties

/**
 * One cell of the miniature, fitted by width AND height.
 *
 * This is `layoutGrid`'s constraint in miniature, and it is here for the same
 * reason: sizing a cell from the column count alone assumes the shape is
 * width-bound, which is false for every tall shape in the catalogue. A 2x5
 * preview built that way stacks 102px of cells inside a 48px frame and spills
 * out of the poster outline it is meant to be drawn inside.
 *
 * Taking the smaller of the two constraints keeps a tall shape inside the
 * frame, and it makes the miniature honest besides — a tall grid really does
 * leave margin at the sides, and the preview shows that rather than hiding it.
 */
function previewCell(columns: number, rows: number): { width: number; height: number } {
  const height = (PREVIEW.width * 16) / 9

  const fromWidth = (PREVIEW.width - PREVIEW.gap * (columns - 1)) / columns
  const fromHeight = ((height - PREVIEW.gap * (rows - 1)) / rows) * (2 / 3)

  const width = Math.min(fromWidth, fromHeight)
  return { width, height: (width * 3) / 2 }
}

interface GridPickerProps {
  value: GridConfig
  onChange: (grid: GridConfig) => void
  /** Books currently on the poster, to flag layouts that would drop some. */
  filled: number
}

export function GridPicker({ value, onChange, filled }: GridPickerProps) {
  const selected = gridCapacity(value)

  return (
    <div className={styles.options}>
      {GRID_CAPACITIES.map((capacity) => {
        const shapes = orientationsFor(capacity)
        const isActive = capacity === selected

        /*
          The shape this card draws. An active card shows what the poster is
          actually set to, which may be either orientation; an inactive one
          shows the shape it would apply, which is always the first.
        */
        const current = isActive
          ? (shapes.find(
              (shape) => shape.columns === value.columns && shape.rows === value.rows,
            ) ?? shapes[0])
          : shapes[0]

        /*
          Tapping an unselected count applies its leading shape. Tapping the
          selected one again advances to the next orientation and wraps, so a
          single card is both "this many books" and "the other way round".
        */
        const next = isActive
          ? shapes[(shapes.indexOf(current) + 1) % shapes.length]
          : shapes[0]

        const cell = previewCell(current.columns, current.rows)
        const drops = Math.max(0, filled - capacity)
        const canFlip = shapes.length > 1

        return (
          <button
            key={capacity}
            type="button"
            className={isActive ? styles.optionActive : styles.option}
            onClick={() => onChange(next)}
            aria-pressed={isActive}
            aria-label={
              `${capacity} book${capacity === 1 ? '' : 's'}, ` +
              `${current.columns} across by ${current.rows} down` +
              (isActive && canFlip
                ? `. Tap again for ${next.columns} by ${next.rows}`
                : '') +
              (drops > 0 ? `. Drops ${drops} from the poster` : '')
            }
            title={drops > 0 ? `${drops} book${drops === 1 ? '' : 's'} would come off` : undefined}
          >
            <span
              className={styles.preview}
              style={{
                ...PREVIEW_VARS,
                gridTemplateColumns: `repeat(${current.columns}, ${cell.width}px)`,
              }}
              aria-hidden
            >
              {Array.from({ length: capacity }, (_, index) => (
                <span
                  key={index}
                  className={styles.cell}
                  style={{ width: cell.width, height: cell.height }}
                />
              ))}
            </span>

            <span className={styles.count}>{capacity}</span>
            <Typography.Text className={styles.shape}>
              {current.columns} × {current.rows}
              {/*
                Only on the selected card. Marking every flippable count would
                put the hint on nine cards at once, where it reads as decoration
                rather than as something to do — and the gesture is only
                available on the card already chosen.
              */}
              {isActive && canFlip ? <span className={styles.flip}> ⇄</span> : null}
            </Typography.Text>
          </button>
        )
      })}
    </div>
  )
}
