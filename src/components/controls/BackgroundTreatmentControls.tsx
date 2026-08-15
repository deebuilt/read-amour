import { ColorPicker, Segmented, Slider, Switch, Typography } from 'antd'
import { space } from '../../design/tokens'
import type { Board, BackgroundFitOverride } from '../../types/domain'
import styles from './BackgroundTreatmentControls.module.css'

/**
 * Per-board background treatment: how the image fills the frame, how far it is
 * washed back, and whether the title sits on a plate.
 *
 * These exist because the automatic choices are guesses. A square image is
 * usually a repeating pattern, but a square corner-design is not; a busy
 * illustration may need knocking back before type reads on it. Guessing well
 * is worth doing — but the user must always be able to overrule the guess and
 * see the result immediately, rather than renaming a file and reloading.
 */

interface BackgroundTreatmentControlsProps {
  board: Board
  onChange: (board: Board) => void
}

const FIT_OPTIONS: { label: string; value: BackgroundFitOverride }[] = [
  { label: 'Fill', value: 'cover' },
  { label: 'Repeat', value: 'tile' },
  { label: 'Whole', value: 'contain' },
]

const DEFAULT_PLATE_RADIUS = 10

export function BackgroundTreatmentControls({
  board,
  onChange,
}: BackgroundTreatmentControlsProps) {
  const treatment = board.treatment ?? {}
  const hasImage = board.background.kind === 'photo' || board.background.kind === 'upload'
  const plate = board.text.titlePlate

  const setTreatment = (next: Partial<typeof treatment>): void => {
    onChange({ ...board, treatment: { ...treatment, ...next } })
  }

  return (
    <div className={styles.root}>
      {hasImage && (
        <>
          <div className={styles.field}>
            <Typography.Text className={styles.label}>How the image fills the frame</Typography.Text>
            <Segmented
              block
              options={FIT_OPTIONS}
              value={treatment.fit ?? 'cover'}
              onChange={(value) => setTreatment({ fit: value as BackgroundFitOverride })}
            />
            <Typography.Text className={styles.hint}>
              Repeat suits a scattered pattern. Whole keeps a single illustration uncropped.
            </Typography.Text>
          </div>

          <div className={styles.field}>
            <div className={styles.rowBetween}>
              <Typography.Text className={styles.label}>Fade</Typography.Text>
              <Segmented
                size="small"
                options={[
                  { label: 'Lighten', value: 'light' },
                  { label: 'Darken', value: 'dark' },
                ]}
                value={treatment.washTone ?? 'light'}
                onChange={(value) => setTreatment({ washTone: value as 'light' | 'dark' })}
              />
            </div>
            <Slider
              min={0}
              max={0.8}
              step={0.05}
              value={treatment.washOpacity ?? 0}
              onChange={(value: number) => setTreatment({ washOpacity: value })}
              tooltip={{ formatter: (value) => `${Math.round((value ?? 0) * 100)}%` }}
            />
            <Typography.Text className={styles.hint}>
              Knocks a busy background back so covers and type read against it.
            </Typography.Text>
          </div>
        </>
      )}

      <div className={styles.field}>
        <div className={styles.rowBetween}>
          <Typography.Text className={styles.label}>Panel behind the month</Typography.Text>
          <Switch
            size="small"
            checked={plate !== undefined}
            onChange={(checked) =>
              onChange({
                ...board,
                text: {
                  ...board.text,
                  titlePlate: checked
                    ? { color: 'rgba(255, 255, 255, 0.86)', radius: DEFAULT_PLATE_RADIUS }
                    : undefined,
                },
              })
            }
          />
        </div>

        {plate && (
          <div className={styles.plateRow}>
            <ColorPicker
              value={plate.color}
              onChangeComplete={(next) =>
                onChange({
                  ...board,
                  text: { ...board.text, titlePlate: { ...plate, color: next.toRgbString() } },
                })
              }
              showText={() => <span className={styles.plateSwatchLabel}>Panel colour</span>}
              placement="topRight"
            />
            <Slider
              min={0}
              max={40}
              value={plate.radius}
              onChange={(value: number) =>
                onChange({
                  ...board,
                  text: { ...board.text, titlePlate: { ...plate, radius: value } },
                })
              }
              style={{ flex: 1, marginInline: space.md }}
            />
          </div>
        )}

        <Typography.Text className={styles.hint}>
          A soft panel is the reliable way to keep the month legible over a detailed image.
        </Typography.Text>
      </div>
    </div>
  )
}
