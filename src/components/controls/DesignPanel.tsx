import { useCallback, useState } from 'react'
import { Button, Divider, Input, Switch, Typography, Upload } from 'antd'
import { BUILTIN_BACKGROUNDS, getBuiltinBackground } from '../../design/backgrounds'
import { getPhotoBackground, photoGroupsForMonth } from '../../design/photoBackgrounds'
import { TYPEFACES, getTypeface } from '../../design/typefaces'
import { InkPicker } from './InkPicker'
import { BackgroundTreatmentControls } from './BackgroundTreatmentControls'
import { PanelSection } from './PanelSection'
import { color, fontSize } from '../../design/tokens'
import { storeUploadedImage } from '../../api/covers'
import { useCoverPalette } from '../../hooks/useCoverPalette'
import { coverBleedCrop, type Board } from '../../types/domain'
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
  /** Resolved cover URLs, which the sampled palette is extracted from. */
  coverUrls: Map<string, string>
  onChange: (board: Board) => void
}

export function DesignPanel({ board, coverUrls, onChange }: DesignPanelProps) {
  /**
   * Grounds pulled out of the covers on this poster. Empty until they have been
   * sampled, and empty for a poster with no covers yet — the row simply is not
   * there, rather than being there and disabled.
   */
  const coverPalette = useCoverPalette(coverUrls)

  /**
   * How much of each cover this shape's bleed layout would crop away.
   *
   * Reported, not enforced — see `supportsCoverBleed` for why the old
   * square-only restriction was measuring the wrong thing.
   */
  const bleedCrop = Math.round(coverBleedCrop(board.grid) * 100)

  /**
   * A large photo is downscaled before it is stored, which takes long enough on
   * a phone to look like nothing happened. The button says so.
   */
  const [isUploading, setIsUploading] = useState(false)

  const handleBackgroundUpload = useCallback(
    async (file: File) => {
      setIsUploading(true)
      try {
        const blobKey = await storeUploadedImage(file, 'bg')
        onChange({
          ...board,
          background: { kind: 'upload', blobKey },
          // Photography is unknowable without sampling; white reads acceptably
          // over most of it and the ink toggle is one tap away.
          text: { ...board.text, inkColor: color.posterInk },
        })
      } finally {
        setIsUploading(false)
      }
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
        // Sampled grounds are the only way a board gets a bare colour, so the
        // summary can say where it came from rather than "custom".
        return 'From your books'
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

        {/*
          Grounds sampled from the covers on this poster.

          Below the builtins rather than above: the builtins are the stable set
          that is always there and always the same, and a row whose contents
          change with the books would make the section reshuffle itself as
          covers land. It appears only once there are covers to sample.

          The hue is the covers'; the saturation and lightness are not — a
          literal dominant colour is usually a near-black or a blaring red, and
          behind sixteen covers it competes with all of them. See `palette.ts`.
        */}
        {coverPalette.length > 0 && (
          <div className={styles.paletteGroup}>
            <Typography.Text className={styles.groupHeading}>From your books</Typography.Text>
            <div className={styles.swatches}>
              {coverPalette.map((swatch) => {
                const isActive =
                  board.background.kind === 'color' && board.background.value === swatch.value
                return (
                  <button
                    key={swatch.value}
                    type="button"
                    className={isActive ? styles.swatchActive : styles.swatch}
                    style={{ background: swatch.value }}
                    onClick={() =>
                      onChange({
                        ...board,
                        background: { kind: 'color', value: swatch.value },
                        // A colour the app computed is knowable, so the ink is
                        // decided rather than defaulted to white the way an
                        // uploaded photograph has to be.
                        text: { ...board.text, inkColor: swatch.ink },
                      })
                    }
                    aria-label={`${swatch.tone === 'tint' ? 'Pale' : 'Deep'} ground from your covers`}
                    aria-pressed={isActive}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/*
          The button says whether a photo is already in use, and shows while one
          is being processed. It used to read "Upload a photo" in every state,
          so replacing a background gave no sign it had worked — the swap is
          silent, and a large image takes a moment to downscale before it lands.
        */}
        <div className={styles.row}>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => handleBackgroundUpload(file)}
          >
            <Button size="small" loading={isUploading}>
              {isUploading
                ? 'Adding…'
                : board.background.kind === 'upload'
                  ? 'Replace your photo'
                  : 'Upload a photo'}
            </Button>
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

        {/*
          Offered on every shape. This was once restricted to square grids, on
          the reasoning that a slot far from 2:3 crops its covers hard — which
          was true and still made the wrong control, because the test was for
          squareness rather than for cropping. A 2x3 loses 21% and was refused
          while a square losing 16% was allowed, and 4x5 loses 5%.

          So the row reports the crop instead of forbidding it. The number is
          what the old rule was standing in for, and it lets the reader decide
          whether a heavy crop is a look or a mistake.
        */}
        <div className={styles.switchRow}>
          <div className={styles.switchText}>
            <Typography.Text className={styles.label}>Covers edge to edge</Typography.Text>
            <Typography.Text style={{ fontSize: fontSize.xs, color: color.inkFaint }}>
              {`No margins, no title band. This shape crops about ${bleedCrop}% off each cover.`}
            </Typography.Text>
          </div>
          <Switch
            checked={board.coverBleed === true}
            onChange={(coverBleed) => onChange({ ...board, coverBleed })}
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
