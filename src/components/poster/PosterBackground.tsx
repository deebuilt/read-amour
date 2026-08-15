import { getBuiltinBackground } from '../../design/backgrounds'
import { getPhotoBackground } from '../../design/photoBackgrounds'
import { TILE_REPEATS_ACROSS } from '../../design/backgroundFit'
import { POSTER } from '../../design/tokens'
import { useImageFit } from '../../hooks/useImageFit'
import type { Background, BackgroundFitOverride, BackgroundTreatment } from '../../types/domain'
import styles from './PosterBackground.module.css'

/**
 * The poster's ground layer, filling the full 1080x1920 frame.
 *
 * Cropped images render as an `<img>` rather than a CSS background, because
 * html-to-image handles element images far more reliably during export — a CSS
 * background pointing at an object URL is a known way to get a blank ground in
 * the PNG. Tiles are the exception: repetition needs `background-repeat`, and
 * it is safe there because tiled sources are bundled asset URLs.
 *
 * The wash sits above the image and below everything else, so a busy
 * background can be knocked back without editing the source file.
 */

interface PosterBackgroundProps {
  background: Background
  treatment?: BackgroundTreatment
  /** Object URL, when the background is an upload. */
  imageUrl?: string
}

const FALLBACK = '#d9d4cc'

function ImageGround({ url, fit }: { url: string; fit: BackgroundFitOverride }) {
  if (fit === 'tile') {
    const size = POSTER.width / TILE_REPEATS_ACROSS
    return (
      <div
        className={styles.fill}
        style={{
          backgroundImage: `url(${url})`,
          backgroundRepeat: 'repeat',
          backgroundSize: `${size}px ${size}px`,
        }}
      />
    )
  }

  // `contain` shows the whole artwork — right for a corner design or a single
  // illustration that must not be cropped.
  return (
    <img
      className={fit === 'contain' ? styles.imageContain : styles.image}
      src={url}
      alt=""
      draggable={false}
    />
  )
}

function Wash({ treatment }: { treatment: BackgroundTreatment }) {
  const opacity = treatment.washOpacity ?? 0
  if (opacity <= 0) return null

  const tone = treatment.washTone ?? 'light'
  return (
    <div
      className={styles.fill}
      style={{
        background: tone === 'light' ? '#ffffff' : '#14120f',
        opacity,
      }}
    />
  )
}

export function PosterBackground({ background, treatment, imageUrl }: PosterBackgroundProps) {
  const photo = background.kind === 'photo' ? getPhotoBackground(background.id) : undefined
  const url = background.kind === 'upload' ? imageUrl : photo?.url
  const inferred = useImageFit(url, photo?.fitOverride)
  // An explicit choice on the board always beats the inferred one.
  const fit: BackgroundFitOverride = treatment?.fit ?? inferred

  const isImage = background.kind === 'upload' || background.kind === 'photo'

  if (isImage) {
    return (
      <>
        {url ? (
          <ImageGround url={url} fit={fit} />
        ) : (
          <div className={styles.fill} style={{ background: FALLBACK }} />
        )}
        {treatment && <Wash treatment={treatment} />}
      </>
    )
  }

  const css =
    background.kind === 'color' ? background.value : getBuiltinBackground(background.id).css

  return (
    <>
      <div className={styles.fill} style={{ background: css }} />
      {treatment && <Wash treatment={treatment} />}
    </>
  )
}
