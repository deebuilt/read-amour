import { useCallback } from 'react'
import { Button, Divider, Input, Slider, Switch, Typography, Upload } from 'antd'
import { BUILTIN_BACKGROUNDS } from '../../design/backgrounds'
import { photosForMonth } from '../../design/photoBackgrounds'
import { TYPEFACES } from '../../design/typefaces'
import { InkPicker } from './InkPicker'
import { BackgroundTreatmentControls } from './BackgroundTreatmentControls'
import { color, fontSize, space } from '../../design/tokens'
import { resizeGrid } from '../../domain/board'
import { storeUploadedImage } from '../../api/covers'
import { GRID_LIMITS, type Board } from '../../types/domain'
import styles from './DesignPanel.module.css'

/**
 * Poster design controls: background, type, grid shape, and text.
 *
 * Grouped by what the user is deciding rather than by data shape — "how it
 * looks" before "how much fits" before "what it says", which is the order
 * people actually work in.
 */

interface DesignPanelProps {
  board: Board
  onChange: (board: Board) => void
}

export function DesignPanel({ board, onChange }: DesignPanelProps) {
  const handleBackgroundUpload = useCallback(
    async (file: File) => {
      const blobKey = await storeUploadedImage(file, 'bg')
      onChange({
        ...board,
        background: { kind: 'upload', blobKey },
        // Photography is unknowable without sampling; white reads acceptably
        // over most of it and the ink toggle is one tap away.
        text: { ...board.text, inkColor: color.posterInk },
      })
      return false
    },
    [board, onChange],
  )

  // Compared against the fixed poster hex, never a theme variable — the
  // poster's palette must not shift with the app's theme.
  // This board's month leads, but every design stays reachable.
  const photos = photosForMonth(board.month)

  return (
    <div className={styles.root}>
      {photos.length > 0 && (
        <>
          <section className={styles.section}>
            <Typography.Text className={styles.label}>Designs</Typography.Text>
            <div className={styles.photos}>
              {photos.map((photo) => {
                const isActive =
                  board.background.kind === 'photo' && board.background.id === photo.id
                return (
                  <button
                    key={photo.id}
                    type="button"
                    className={isActive ? styles.photoActive : styles.photo}
                    onClick={() =>
                      onChange({
                        ...board,
                        background: { kind: 'photo', id: photo.id },
                        text: { ...board.text, inkColor: color.posterInk },
                      })
                    }
                    aria-label={photo.label}
                    aria-pressed={isActive}
                  >
                    <img src={photo.url} alt="" loading="lazy" />
                  </button>
                )
              })}
            </div>
          </section>
          <Divider className={styles.divider} />
        </>
      )}

      <section className={styles.section}>
        <Typography.Text className={styles.label}>Background</Typography.Text>
        <div className={styles.swatches}>
          {BUILTIN_BACKGROUNDS.map((bg) => {
            const isActive = board.background.kind === 'builtin' && board.background.id === bg.id
            return (
              <button
                key={bg.id}
                type="button"
                className={isActive ? styles.swatchActive : styles.swatch}
                style={{ background: bg.css }}
                onClick={() =>
                  onChange({
                    ...board,
                    background: { kind: 'builtin', id: bg.id },
                    text: {
                      ...board.text,
                      inkColor: bg.isLight ? color.posterInkDark : color.posterInk,
                    },
                  })
                }
                aria-label={bg.name}
                aria-pressed={isActive}
              />
            )
          })}
        </div>

        <div className={styles.row}>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => handleBackgroundUpload(file)}
          >
            <Button size="small">Upload a photo</Button>
          </Upload>
        </div>
      </section>

      <Divider className={styles.divider} />

      <section className={styles.section}>
        <BackgroundTreatmentControls board={board} onChange={onChange} />
      </section>

      <Divider className={styles.divider} />

      <section className={styles.section}>
        <Typography.Text className={styles.label}>Text colour</Typography.Text>
        <InkPicker
          value={board.text.inkColor}
          onChange={(inkColor) => onChange({ ...board, text: { ...board.text, inkColor } })}
        />
      </section>

      <Divider className={styles.divider} />

      <section className={styles.section}>
        <Typography.Text className={styles.label}>Typeface</Typography.Text>
        <div className={styles.typefaces}>
          {TYPEFACES.map((face) => {
            const isActive = board.text.typefaceId === face.id
            return (
              <button
                key={face.id}
                type="button"
                className={isActive ? styles.typefaceActive : styles.typeface}
                onClick={() =>
                  onChange({ ...board, text: { ...board.text, typefaceId: face.id } })
                }
                aria-pressed={isActive}
              >
                <span style={{ fontFamily: face.stack, fontSize: fontSize.lg }}>
                  {board.text.title || 'August'}
                </span>
                <span className={styles.typefaceVoice} style={{ color: color.inkFaint }}>
                  {face.voice}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <Divider className={styles.divider} />

      <section className={styles.section}>
        <Typography.Text className={styles.label}>
          Grid — {board.grid.columns} across, {board.grid.rows} down
        </Typography.Text>

        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>Across</span>
          <Slider
            min={GRID_LIMITS.minColumns}
            max={GRID_LIMITS.maxColumns}
            value={board.grid.columns}
            onChange={(columns: number) =>
              onChange(resizeGrid(board, { ...board.grid, columns }))
            }
            style={{ flex: 1, marginInline: space.md }}
          />
        </div>

        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>Down</span>
          <Slider
            min={GRID_LIMITS.minRows}
            max={GRID_LIMITS.maxRows}
            value={board.grid.rows}
            onChange={(rows: number) => onChange(resizeGrid(board, { ...board.grid, rows }))}
            style={{ flex: 1, marginInline: space.md }}
          />
        </div>
      </section>

      <Divider className={styles.divider} />

      <section className={styles.section}>
        <div className={styles.switchRow}>
          <div className={styles.switchText}>
            <Typography.Text className={styles.label}>Show ratings</Typography.Text>
            <Typography.Text style={{ fontSize: fontSize.xs, color: color.inkFaint }}>
              Stars on books you rated. Unrated books stay bare.
            </Typography.Text>
          </div>
          <Switch
            checked={board.showRatings === true}
            onChange={(showRatings) => onChange({ ...board, showRatings })}
          />
        </div>
      </section>

      <Divider className={styles.divider} />

      <section className={styles.section}>
        <Typography.Text className={styles.label}>Words</Typography.Text>
        <Input
          value={board.text.title}
          onChange={(event) =>
            onChange({ ...board, text: { ...board.text, title: event.target.value } })
          }
          placeholder="August"
          size="large"
        />
        <Input
          value={board.text.subtitle}
          onChange={(event) =>
            onChange({ ...board, text: { ...board.text, subtitle: event.target.value } })
          }
          placeholder="Reading"
        />
        <Input
          value={board.text.caption ?? ''}
          onChange={(event) =>
            onChange({
              ...board,
              text: { ...board.text, caption: event.target.value || undefined },
            })
          }
          placeholder="@yourhandle (optional)"
        />
      </section>
    </div>
  )
}
