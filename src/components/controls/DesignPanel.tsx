import { useCallback } from 'react'
import { Button, Divider, Input, Switch, Typography, Upload } from 'antd'
import { BUILTIN_BACKGROUNDS, getBuiltinBackground } from '../../design/backgrounds'
import { getPhotoBackground, photoGroupsForMonth } from '../../design/photoBackgrounds'
import { TYPEFACES, getTypeface } from '../../design/typefaces'
import { InkPicker } from './InkPicker'
import { BackgroundTreatmentControls } from './BackgroundTreatmentControls'
import { GridPicker } from './GridPicker'
import { PanelSection } from './PanelSection'
import { color, fontSize } from '../../design/tokens'
import { filledCount, resizeGrid } from '../../domain/board'
import { storeUploadedImage } from '../../api/covers'
import { type Board } from '../../types/domain'
import styles from './DesignPanel.module.css'

/**
 * Poster design controls: background, type, grid shape, and text.
 *
 * Grouped by what the user is deciding rather than by data shape — "how it
 * looks" before "how much fits" before "what it says", which is the order
 * people actually work in.
 *
 * The two tall image pickers collapse and start closed. They are the sections
 * that made the drawer long, and they are chosen once per poster, while the
 * words and the layout get returned to repeatedly. Everything short stays open,
 * because a tap to reach a single switch is worse than the scroll it saves.
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
  const photoGroups = photoGroupsForMonth(board.month)

  // What each collapsed section is currently set to. A closed section that
  // cannot tell you its own value just hides information behind a tap.
  const backgroundSummary = (): string => {
    switch (board.background.kind) {
      case 'photo':
        return getPhotoBackground(board.background.id)?.label ?? 'Design'
      case 'builtin':
        return getBuiltinBackground(board.background.id).name
      case 'upload':
        return 'Your photo'
      case 'color':
        return 'Custom colour'
    }
  }

  return (
    <div className={styles.root}>
      {photoGroups.length > 0 && (
        <>
          <PanelSection
            label="Designs"
            collapsible
            summary={board.background.kind === 'photo' ? backgroundSummary() : undefined}
          >
            {photoGroups.map((group) => (
              <div key={group.month} className={styles.photoGroup}>
                <Typography.Text className={styles.groupHeading}>
                  {group.heading}
                </Typography.Text>
                <div className={styles.photos}>
                  {group.photos.map((photo) => {
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
              </div>
            ))}
          </PanelSection>
          <Divider className={styles.divider} />
        </>
      )}

      <PanelSection label="Background" collapsible summary={backgroundSummary()}>
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
      </PanelSection>

      <Divider className={styles.divider} />

      <PanelSection label="Adjust the background">
        <BackgroundTreatmentControls board={board} onChange={onChange} />
      </PanelSection>

      <Divider className={styles.divider} />

      <PanelSection label="Text colour">
        <InkPicker
          value={board.text.inkColor}
          onChange={(inkColor) => onChange({ ...board, text: { ...board.text, inkColor } })}
        />
      </PanelSection>

      <Divider className={styles.divider} />

      <PanelSection
        label="Typeface"
        collapsible
        summary={getTypeface(board.text.typefaceId).name}
      >
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
      </PanelSection>

      <Divider className={styles.divider} />

      <PanelSection label="Layout">
        <GridPicker
          value={board.grid}
          filled={filledCount(board)}
          onChange={(grid) => onChange(resizeGrid(board, grid))}
        />
      </PanelSection>

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

      <PanelSection label="Words">
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
      </PanelSection>
    </div>
  )
}
