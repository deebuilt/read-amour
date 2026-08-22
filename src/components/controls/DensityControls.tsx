import { Button, Slider, Typography } from 'antd'
import { densityOf } from '../../domain/layout'
import { DENSITY_RANGE, type Board, type PosterDensity } from '../../types/domain'
import styles from './DensityControls.module.css'

/**
 * How tightly the poster packs its covers.
 *
 * ## Why these three and nothing else
 *
 * The covers cannot be made bigger by rearranging the grid. Slots are locked to
 * 2:3 so they never crop, which means a slot cannot widen without growing 1.5x
 * taller, and the frame has no spare height — so every wide shape stops at a
 * width wall and every tall one stops at a height wall, whatever order the rows
 * and columns are in.
 *
 * The walls themselves are what move. Two are real and one is not:
 *
 * - **The canvas is 1080px across.** Three columns can never exceed 360px a
 *   slot. That is the frame and it does not move.
 * - **The bottom of a Story is covered by Instagram's reply controls.** That
 *   reserve stays.
 * - **Everything else is a number someone chose** — the side margin, the space
 *   between covers, and the blank air above the title. Those were fixed tokens,
 *   and they are the entire distance between the current covers and the frame.
 *
 * So these are sliders rather than a redesign. The poster is allowed to look
 * bad at the extremes: covers touching each other and running off the edge is
 * information, and seeing it is faster than being warned about it.
 */

interface DensityControlsProps {
  board: Board
  onChange: (board: Board) => void
  /**
   * Called while a slider is held, so the drawer covering the poster can get
   * out of the way. These controls change the artwork by a few pixels at a
   * time, which is invisible if 82vh of it is behind a sheet.
   */
  onPeek?: (peeking: boolean) => void
}

/** Reads as one step of intent rather than one pixel. */
const STEP = 4

export function DensityControls({ board, onChange, onPeek }: DensityControlsProps) {
  const density = densityOf(board.density)
  const isCustom = board.density !== undefined

  const set = (next: Partial<PosterDensity>): void => {
    onChange({ ...board, density: { ...density, ...next } })
  }

  return (
    <div className={styles.root}>
      <Field
        label="Side margin"
        hint="How close the covers run to the edge of the poster."
        value={density.gridMarginX}
        range={DENSITY_RANGE.gridMarginX}
        onChange={(gridMarginX) => set({ gridMarginX })}
        onPeek={onPeek}
      />

      <Field
        label="Space between covers"
        hint="Zero makes them touch."
        value={density.gridGap}
        range={DENSITY_RANGE.gridGap}
        onChange={(gridGap) => set({ gridGap })}
        onPeek={onPeek}
      />

      <Field
        label="Space above the title"
        hint="Nothing covers the top of a Story, so this is free height."
        value={density.titleTop}
        range={DENSITY_RANGE.titleTop}
        onChange={(titleTop) => set({ titleTop })}
        onPeek={onPeek}
      />

      {/*
        Only once something has been changed. A reset button on an untouched
        poster offers to undo nothing, and it is the control that says most
        clearly that pushing the sliders is safe.
      */}
      {isCustom && (
        <Button
          size="small"
          type="text"
          className={styles.reset}
          onClick={() => onChange({ ...board, density: undefined })}
        >
          Back to the standard spacing
        </Button>
      )}
    </div>
  )
}

interface FieldProps {
  label: string
  hint: string
  value: number
  range: { min: number; max: number }
  onChange: (value: number) => void
  onPeek?: (peeking: boolean) => void
}

function Field({ label, hint, value, range, onChange, onPeek }: FieldProps) {
  return (
    <div className={styles.field}>
      <div className={styles.rowBetween}>
        <Typography.Text className={styles.label}>{label}</Typography.Text>
        <Typography.Text className={styles.value}>{value}</Typography.Text>
      </div>
      {/*
        `onChangeComplete` rather than a pointerup listener: antd's slider can
        be driven by the keyboard too, and both paths end here.
      */}
      <Slider
        min={range.min}
        max={range.max}
        step={STEP}
        value={value}
        onChange={(next) => {
          onPeek?.(true)
          onChange(next)
        }}
        onChangeComplete={() => onPeek?.(false)}
        tooltip={{ open: false }}
      />
      <Typography.Text className={styles.hint}>{hint}</Typography.Text>
    </div>
  )
}
