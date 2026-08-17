import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeVideo,
} from 'mediabunny'
import { POSTER, poster as posterTokens } from '../design/tokens'
import { layoutGrid } from '../domain/layout'
import { supportsCoverBleed, type Board } from '../types/domain'
import { posterToBlob } from './exportPoster'

/**
 * The poster, assembling itself, as an MP4.
 *
 * The whole feature rests on one decision, and it is the same decision the
 * still export rests on:
 *
 *   **The poster is captured ONCE.**
 *
 * Everything after that is arithmetic on a single bitmap. There is no second
 * rendering of the poster, no re-layout, and no animation running in the DOM —
 * the frames are that one still, drawn onto a canvas with progressively more of
 * it revealed. So the app's founding rule holds: what animates is exactly the
 * PNG the user would otherwise have saved.
 *
 * That is not only a purity argument, it is why this is affordable. Capturing
 * per frame through `html-to-image` costs hundreds of milliseconds each; a
 * two-second animation would be dozens of captures and the better part of a
 * minute on a phone. One capture plus canvas draws is a few seconds all in.
 *
 * ## Why MP4, after this shipped as a GIF and failed
 *
 * The first version wrote a GIF, on the stated reasoning that every platform
 * accepts one and Instagram converts it to video on upload. **The second half
 * of that was simply false**, and Ruthnie's first real test found it: a GIF
 * uploaded to a Story arrives as a flat photo with no motion and no duration
 * badge. Instagram's ingest transcodes images to JPEG and video to MP4, and a
 * GIF enters that pipeline as an *image*, so it is flattened to its first frame
 * server-side. TikTok would not recognise the file as media at all.
 *
 * No amount of client-side work rescues that, because the flattening does not
 * happen on the client. Android's gallery also commonly hands `.gif` to a
 * picker as a still, but that is secondary — fixing it would buy nothing.
 *
 * MP4 with H.264 is the format Stories actually documents and accepts. It is
 * also, in 2026, the *cheaper* option: WebCodecs is at ~94% support and
 * hardware-accelerated, and mediabunny muxes to MP4 in a few kilobytes of
 * tree-shaken ESM with no WASM. The ffmpeg.wasm tax that made browser video
 * feel expensive — tens of megabytes of side-loaded assets — is no longer the
 * situation.
 *
 * See `docs/NEXT_LEVEL.md` § 2.3.
 */

/**
 * Full poster resolution, unlike the GIF that preceded this.
 *
 * The GIF was halved to 540x960 because GIF is a poor codec and pixel count was
 * the dominant term in its file size. H.264 has none of that problem: it is a
 * real video codec with interframe compression, and this animation — a static
 * ground with covers appearing — is close to its best case, since most of every
 * frame is identical to the one before it.
 *
 * So the export goes out at the Story's own 1080x1920 and comes in smaller than
 * the half-size GIF did.
 */
/**
 * 720x1280, and the reason is Android's encoder rather than file size.
 *
 * Android's hardware H.264 encoders require 16x16 macroblock alignment, and
 * **the poster's 1080 width is not a multiple of 16** (1080 / 16 = 67.5). 1920
 * is fine; 1080 is not.
 *
 * On desktop a non-aligned width is quietly handled and nobody notices. On
 * Android it is worse than a rejection: Chromium refuses non-aligned VP8
 * because a software encoder exists to fall back to, but its own commit on the
 * subject states there is no software H.264 encoder on Android — so a
 * non-aligned H.264 encode cannot be safely refused and goes to hardware that
 * may **silently corrupt the output**. Chromium's bug notes even recent Pixel
 * hardware mangling non-aligned content, and there is a standing WebCodecs
 * issue titled "Encoding H264 error by 1080p in Android Chrome".
 *
 * That is the worst failure shape available here: everything passes on a
 * desktop and the file is broken on exactly the device this app is built for.
 *
 * Of the aligned options, 720x1280 is the only one that is **also exactly
 * 9:16**. Aligning the poster width down to 1072 or up to 1088 both skew the
 * frame by 0.74%, which a platform then letterboxes or crops — trading a
 * correct frame for pixels that Instagram re-encodes away regardless. 720p is
 * the standard safe mobile target, it is sharp on a phone, and the geometry is
 * exact.
 *
 * The poster still renders and captures at its true 1080x1920. The downscale
 * happens once, on the way into the canvas.
 */
const VIDEO_WIDTH = 720
const VIDEO_HEIGHT = 1280

/**
 * Pacing is the reader's, not this file's.
 *
 * Every timing here used to be a constant chosen in this module — a per-cover
 * beat, a floor under it, a budget the beats were drawn from, a minimum total,
 * and two end holds. Six invented numbers, each defensible-sounding and none of
 * them measured against anything. They were wrong twice in a row: first a
 * two-second total inherited from the GIF (where short meant small, which stops
 * being true the moment the format is video), then a three-second replacement
 * picked because two had felt short.
 *
 * There is no technical limit any of them were protecting. Frames carry their
 * own durations, so a long clip costs the same to produce as a short one and is
 * within a rounding error on file size. Instagram's ceiling is 60 seconds per
 * card and nothing here approaches it.
 *
 * So the whole set collapses to one value the reader sets: **how long the video
 * runs.** Everything else is derived from it and from the number of covers,
 * which the app already knows. Guessing at someone's taste in pacing is not a
 * thing this module should be doing at all.
 */

/** The range the control offers, and the only clamp applied to a chosen value. */
export const MIN_DURATION_MS = 2000
export const MAX_DURATION_MS = 15000
export const DEFAULT_DURATION_MS = 5000

/**
 * How the chosen duration is divided.
 *
 * The opening beat and the closing rest are proportions of the whole rather
 * than fixed millisecond values, so a 3-second clip and a 12-second clip have
 * the same shape — a short pause on the empty poster, the covers landing, and a
 * longer rest on the finished artwork. Making the tail the largest single share
 * is deliberate: the assembled poster is what the animation is for, and both
 * Stories and TikTok loop, so an ending that cuts away the instant the last
 * cover arrives never lets it be seen whole.
 */
const OPENING_SHARE = 0.08
const CLOSING_SHARE = 0.3

/**
 * A real frame rate, because the file is a video and players expect one.
 *
 * The first version wrote one frame per cover and leaned on per-frame
 * durations — four frames across ten seconds, some three seconds long. Legal,
 * and badly behaved: playback stalled for seconds before starting and differed
 * between the first and second play. A decoder needs a cadence to schedule
 * against.
 *
 * 24 is enough for a fade to look smooth and keeps the encode quick. Frames are
 * nearly identical to their neighbours, so H.264 stores almost nothing for most
 * of them — the file barely grows for the extra frames.
 */
const FPS = 24

/**
 * How much of a cover's slot in the timeline is spent arriving.
 *
 * The rest is the pause before the next one starts. At 0.55 the arrival occupies
 * a little over half the interval, so covers are visibly in motion for most of
 * the clip rather than snapping between long frozen holds — which is what made
 * a ten-second export read as dead air with three events in it.
 */
const ARRIVAL_SHARE = 0.55

/**
 * ## Each transition must differ on an AXIS, not by a magnitude
 *
 * This file shipped four transitions that were really two. `settle` (scale
 * 1.06→1.00), `fade` (scale flat) and `bounce` (scale 1.06→1.00 with a small
 * dip) all moved the cover along the *same* axis by *different amounts* —
 * and the amounts were tiny. Measured on a 4x4 slot at 720p, the largest
 * on-screen difference between settle and bounce was **3.6 pixels**, lasting
 * about two frames at 24fps. Ruthnie exported all four and reported the only
 * one she could identify was `rise`, which was the only one that moved the
 * cover somewhere.
 *
 * She was right, and the failure has a shape worth naming. The first `bounce`
 * was a 0→1.15 overshoot, correctly judged too violent — but the correction
 * pulled it into `settle`'s range instead of moving it to a different axis, so
 * fixing "too big" produced "identical". A magnitude is not a distinction.
 *
 * So the four are now one per axis:
 *
 *   fade  — opacity only. Nothing moves, nothing resizes.
 *   rise  — position, from below.
 *   drop  — position, from above.
 *   zoom  — scale, and large enough to read as scale.
 *
 * The floor for a new one: at least ~40px of on-screen divergence from every
 * existing transition, on a 4x4 slot at 720p, sustained over more than a couple
 * of frames. Below that it is the same transition with a different name.
 */

/**
 * How much larger a `zoom` cover starts.
 *
 * 45%, where the old shared overshoot was 6%. The small value was right when
 * every transition carried it — a 6% wobble under a fade is a texture, not an
 * effect. As the *identity* of one transition it has to be legible on its own,
 * and 45% of a slot is about 100px on a 4x4. Still clipped to the slot, so a
 * large start reads as the cover pushing outward into its frame rather than
 * overlapping its neighbours.
 */
const ZOOM_SCALE = 0.45

/** How far a cover travels on a directional arrival, as a share of its own size. */
const SLIDE_DISTANCE = 0.35

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * Cubic ease-out: quick to start, settling at the end.
 *
 * The right curve for something arriving — it decelerates into place the way a
 * physical object would, where a linear fade reads as mechanical.
 */
const easeOut = (t: number): number => 1 - (1 - t) ** 3

/* Transitions ------------------------------------------------------------- */

/**
 * How a cover arrives on the poster.
 *
 * The animation had exactly one transition — fade up while settling from six
 * percent oversized — applied to every cover on every poster. It is a good
 * default and it was the only thing about the video that was not the reader's
 * choice: length is hers, the poster is hers, and then every cover landed the
 * same way regardless of what the poster looked like.
 *
 * These are deliberately a small closed set rather than a set of sliders. The
 * axes that matter — opacity, scale, offset — are not things anyone wants to
 * specify in numbers, and exposing them would be the pacing mistake this file
 * already made once, in a different costume. Four named transitions, each a
 * complete idea, and the reader picks one by looking at it.
 *
 * Each one owns an axis — see the note above `ZOOM_SCALE`. That is the rule a
 * fifth has to satisfy, and the rule the first version of this catalogue broke.
 *
 * A transition is a pure function of one cover's progress, `0` to `1`, returning
 * how to paint it. It knows nothing about timing, order, or the poster — so
 * adding one cannot affect the timeline, and none of them can drift from the
 * geometry `revealRects` derives.
 */
export type TransitionId = 'fade' | 'rise' | 'drop' | 'zoom'

/** How a cover is painted partway through its arrival. */
interface TransitionFrame {
  /** 0 to 1. */
  opacity: number
  /** 1 is the cover's true size. */
  scale: number
  /** Offset from the slot, as a share of slot width and height. */
  offsetX: number
  offsetY: number
}

export interface Transition {
  id: TransitionId
  /** Shown in the export sheet. */
  label: string
  /**
   * One line in plain language, saying what the reader will see.
   *
   * Not "eases down into place" — that described a 6% scale change nobody could
   * see, and dressed three identical transitions in three different sentences.
   * If the description has to work that hard, the transition is not distinct
   * enough to offer.
   */
  description: string
  frame: (progress: number) => TransitionFrame
}

/**
 * The four, one per axis.
 *
 * `fade` is first and is the default. The old default was `settle`, whose
 * identity was a 6% scale wobble — so `fade` is what that always effectively
 * looked like, now named honestly.
 */
export const TRANSITIONS: readonly Transition[] = [
  {
    id: 'fade',
    label: 'Fade',
    description: 'Covers fade in where they belong',
    // The quiet one, and the default. On a busy poster — sixteen covers over a
    // photograph — movement in every slot is noise, and this lets the artwork
    // be the thing that changes.
    frame: (progress) => ({
      opacity: easeOut(progress),
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    }),
  },
  {
    id: 'rise',
    label: 'Rise',
    description: 'Covers slide up from below',
    frame: (progress) => {
      const eased = easeOut(progress)
      return {
        opacity: eased,
        scale: 1,
        offsetX: 0,
        offsetY: SLIDE_DISTANCE * (1 - eased),
      }
    },
  },
  {
    id: 'drop',
    label: 'Drop',
    description: 'Covers fall into place from above',
    // The mirror of `rise`, and the pair is why both earn a place: they are the
    // same amount of movement in opposite directions, which is the clearest
    // distinction available on this axis. Falling with the reading order also
    // suits a poster that fills top to bottom.
    frame: (progress) => {
      const eased = easeOut(progress)
      return {
        opacity: eased,
        scale: 1,
        offsetX: 0,
        offsetY: -SLIDE_DISTANCE * (1 - eased),
      }
    },
  },
  {
    id: 'zoom',
    label: 'Zoom',
    description: 'Covers start large and shrink into their slot',
    frame: (progress) => {
      const eased = easeOut(progress)
      return {
        opacity: eased,
        scale: 1 + ZOOM_SCALE * (1 - eased),
        offsetX: 0,
        offsetY: 0,
      }
    },
  },
] as const

export const DEFAULT_TRANSITION: TransitionId = 'fade'

export function transitionById(id: TransitionId | undefined): Transition {
  return (
    TRANSITIONS.find((transition) => transition.id === id) ??
    TRANSITIONS.find((transition) => transition.id === DEFAULT_TRANSITION) ??
    TRANSITIONS[0]
  )
}

/**
 * H.264 Baseline.
 *
 * The most conservative, most universally decodable profile there is, and
 * hardware-accelerated on essentially all Android hardware. A poster animation
 * has no need of anything higher — there is no fast motion and no film grain to
 * preserve, just flat artwork and covers.
 */
const VIDEO_CODEC = 'avc' as const

export interface PosterVideoOptions {
  fileName: string
  /**
   * How long the finished video runs, in milliseconds.
   *
   * The reader's choice, clamped only to the range the control offers. Nothing
   * in the encoder cares what this is — a long clip costs the same to produce
   * as a short one — so the only reason to bound it at all is that a control
   * needs ends.
   */
  durationMs?: number
  /**
   * How each cover arrives. Defaults to `settle`, which is what every video
   * exported before transitions existed — so an unset value reproduces the old
   * animation exactly rather than silently changing it.
   */
  transition?: TransitionId
  /** 0 to 1, for a progress label. Called per cover. */
  onProgress?: (fraction: number) => void
}

/** A slot's rectangle on the video canvas, in video pixels. */
interface SlotRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Whether this device can encode the video at all.
 *
 * Checked before the row is offered rather than after it is tapped, so a device
 * that cannot do this never shows a button that fails — the same reasoning as
 * `canSharePoster()`. WebCodecs covers about 94% of browsers, and the honest
 * answer on the rest is to leave the option out.
 *
 * Cached: the answer cannot change within a session, and it is an async probe.
 */
let encodeSupport: Promise<boolean> | undefined

export function canExportVideo(): Promise<boolean> {
  if (encodeSupport === undefined) {
    encodeSupport =
      typeof VideoEncoder === 'undefined'
        ? Promise.resolve(false)
        : canEncodeVideo(VIDEO_CODEC, {
            width: VIDEO_WIDTH,
            height: VIDEO_HEIGHT,
          }).catch(() => false)
  }
  return encodeSupport
}

/**
 * Why video is unavailable, when it is — so the UI can say something true.
 *
 * There are two quite different reasons and they deserve different sentences.
 * **WebCodecs is `[SecureContext]`**, so `VideoEncoder` is not merely
 * unsupported over plain HTTP, it is `undefined` — the interface is never
 * installed. `localhost` is on the browser's secure-origin allowlist but a LAN
 * address like `http://192.168.1.5:8204` is not, which is exactly how this app
 * gets opened on a phone during development.
 *
 * Telling someone on a LAN address that "this browser cannot record video" is
 * false and sends them looking at the wrong thing. It cost a testing session
 * here already.
 */
export function videoUnavailableReason(): 'insecure-context' | 'unsupported' {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'insecure-context'
  }
  return 'unsupported'
}

/**
 * Where each filled slot sits, in video pixels, in reveal order.
 *
 * Derived from `layoutGrid` — the same function the poster itself lays out
 * with — rather than measured from the DOM or recomputed here. That is the
 * point: this module knows nothing about poster geometry, and cannot drift from
 * it when the layout changes.
 *
 * Only filled slots are returned. An empty slot has nothing to reveal, and
 * including it would spend a beat of a two-second animation on a blank
 * rectangle appearing.
 */
function revealRects(board: Board): SlotRect[] {
  const isBleeding = board.coverBleed === true && supportsCoverBleed(board.grid)
  const { slotWidth, slotHeight, gridTop } = layoutGrid(board.grid, board.text, isBleeding)

  const gap = isBleeding ? 0 : posterTokens.gridGap
  const gridWidth = slotWidth * board.grid.columns + gap * (board.grid.columns - 1)
  // The grid block is centred horizontally in the frame; in bleed mode it fills
  // it, and the arithmetic gives the same answer without a special case.
  const gridLeft = (POSTER.width - gridWidth) / 2

  const filled = board.slots
    .filter((slot) => slot.bookId !== undefined)
    .sort((a, b) => a.index - b.index)

  // Poster space is 1080x1920; the video is 720x1280. Both are 9:16, so one
  // factor carries both axes and nothing distorts.
  const scale = VIDEO_WIDTH / POSTER.width

  return filled.map((slot) => {
    const column = slot.index % board.grid.columns
    const row = Math.floor(slot.index / board.grid.columns)

    return {
      x: (gridLeft + column * (slotWidth + gap)) * scale,
      y: (gridTop + row * (slotHeight + gap)) * scale,
      width: slotWidth * scale,
      height: slotHeight * scale,
    }
  })
}

/**
 * Load the captured still into something drawable.
 *
 * `createImageBitmap` where available — it decodes off the main thread and
 * hands back a bitmap the canvas can blit directly. The `<img>` path is the
 * fallback for browsers that lack it.
 */
async function decodeCapture(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
  }

  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    // Safe to revoke once decoded: the bitmap is held independently of the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
}

/**
 * Render the poster as an MP4 of itself being built.
 *
 * Frames are pushed to the encoder as fast as the hardware takes them — this is
 * not a realtime recording, which is the advantage WebCodecs has over
 * `MediaRecorder`. A `MediaRecorder` capture of a canvas runs at wall-clock
 * speed, so a two-second animation takes two real seconds and drops frames
 * under load. Here the timing is written into each sample's timestamp and
 * duration, so it is exact regardless of how fast the machine encodes.
 */
export async function posterToVideo(
  node: HTMLElement,
  board: Board,
  options: PosterVideoOptions,
): Promise<Blob> {
  const { onProgress } = options
  const durationMs = Math.min(
    MAX_DURATION_MS,
    Math.max(MIN_DURATION_MS, options.durationMs ?? DEFAULT_DURATION_MS),
  )
  // Resolved through the lookup rather than read directly, so a board carrying
  // an id from a build that offered a transition this one does not falls back to
  // the default instead of throwing partway through an encode.
  const transition = transitionById(options.transition)

  if (!(await canExportVideo())) {
    throw new Error('This browser cannot record video.')
  }

  /**
   * Captured straight down to video size rather than at 1080 and scaled after.
   *
   * `posterToBlob` takes a pixel ratio, so the browser does the resampling
   * during the capture itself — one operation, and it avoids holding two
   * full-size bitmaps (8MB of RGBA each) alongside the encoder's own buffers.
   * That is the same memory concern that made `shrinkStoredUploads()` work
   * sequentially.
   */
  const captureScale = VIDEO_WIDTH / POSTER.width
  const stillBlob = await posterToBlob(node, captureScale)
  const still = await decodeCapture(stillBlob)

  const canvas = document.createElement('canvas')
  canvas.width = VIDEO_WIDTH
  canvas.height = VIDEO_HEIGHT
  // Opaque: every frame is painted edge to edge from a capture that has its own
  // background, so there is nothing to composite against and no transparency to
  // preserve. A video frame has no alpha channel anyway — anything left
  // transparent would encode as black.
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Could not open a canvas to build the animation.')
  }

  const rects = revealRects(board)

  const output = new Output({
    format: new Mp4OutputFormat({
      // The moov atom goes at the front, so a player can start without reading
      // the whole file. It matters here because the file is handed straight to
      // another app through the share sheet rather than streamed from a server.
      fastStart: 'in-memory',
    }),
    target: new BufferTarget(),
  })

  const source = new CanvasSource(canvas, {
    codec: VIDEO_CODEC,
    quality: QUALITY_HIGH,
    // Two seconds between key frames — the codec default, and right here. The
    // clip is short and loops, so seeking is cheap either way, and forcing them
    // more often only costs size: consecutive frames are nearly identical, so
    // an extra key frame stores a whole picture where a few bytes would do.
    keyFrameInterval: 2,
  })

  // Declaring the rate lets the muxer snap timestamps to it, so the cadence in
  // the container matches the one the frames were written at.
  output.addVideoTrack(source, { frameRate: FPS })
  await output.start()

  /**
   * The ground: the poster rendered with none of its covers placed.
   *
   * This is a **second capture**, and it is the one place this file departs
   * from "capture once" — deliberately, because the alternatives are all wrong.
   *
   * Erasing each cover's rectangle out of the finished still does not work: a
   * video frame has no alpha channel, so anything cleared to transparent
   * encodes as solid black, and every unplaced cover would be a black hole
   * rather than the poster's background showing through. Nor can the ground be
   * reconstructed by guessing a colour — the background may be a photograph,
   * and behind a cover is exactly the part of it never otherwise seen.
   *
   * So the empty poster is captured for real, with `data-ra-hide-covers` set on
   * the node. Two captures total, both through the same `posterToBlob` path at
   * the same intrinsic size — the founding rule is about preview and export
   * being one rendering, and both of these are that rendering.
   */
  node.setAttribute('data-ra-hide-covers', 'true')
  let ground: ImageBitmap | HTMLImageElement
  try {
    const groundBlob = await posterToBlob(node, captureScale)
    ground = await decodeCapture(groundBlob)
  } finally {
    node.removeAttribute('data-ra-hide-covers')
  }

  /**
   * Draw the poster, each cover at its own stage of arriving.
   *
   * `progressOf(i)` is 0 before cover `i` starts, 1 once it has settled, and
   * somewhere between while it is arriving. What a partly-arrived cover looks
   * like is the transition's business, not this function's — `compose` only
   * asks where the cover is in its arrival and paints what comes back.
   *
   * A cover at full progress is blitted straight from the still at its exact
   * rectangle: no alpha, no transform, pixel for pixel what the PNG holds. That
   * is what keeps the last frame of the video identical to the still export.
   */
  const compose = (progressOf: (index: number) => number): void => {
    context.drawImage(ground, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT)

    for (let i = 0; i < rects.length; i += 1) {
      const progress = progressOf(i)
      if (progress <= 0) continue

      const rect = rects[i]

      if (progress >= 1) {
        context.drawImage(
          still,
          rect.x, rect.y, rect.width, rect.height,
          rect.x, rect.y, rect.width, rect.height,
        )
        continue
      }

      const frame = transition.frame(progress)
      const width = rect.width * frame.scale
      const height = rect.height * frame.scale
      // Scaled about its own centre, so it settles inward from every edge
      // rather than growing out of one corner, then displaced by whatever
      // offset the transition asks for.
      const x = rect.x - (width - rect.width) / 2 + frame.offsetX * rect.width
      const y = rect.y - (height - rect.height) / 2 + frame.offsetY * rect.height

      context.save()
      context.globalAlpha = clamp01(frame.opacity)
      /*
       * Clipped to the slot for the whole arrival.
       *
       * An oversized or offset cover would otherwise paint over its neighbours
       * and over the poster's margins — and on a bleed poster, where slots
       * touch, it would overlap covers that have already landed. This is what
       * lets a transition move a cover freely without any of them needing to
       * know what is next to it.
       */
      context.beginPath()
      context.rect(rect.x, rect.y, rect.width, rect.height)
      context.clip()
      context.drawImage(
        still,
        rect.x, rect.y, rect.width, rect.height,
        x, y, width, height,
      )
      context.restore()
    }
  }

  /**
   * A real timeline at a steady frame rate, not one frame per cover.
   *
   * The version before this wrote exactly one frame per cover and gave each a
   * duration — four frames across ten seconds, some of them three seconds long.
   * That is legal MP4 and it behaves badly in practice: players stalled several
   * seconds before starting, and played differently the second time once the
   * file was cached. A video with no regular cadence gives a decoder nothing to
   * schedule against.
   *
   * It was also the reason the result never looked like an animation. A cover
   * was absent in one frame and fully present in the next, so its arrival had
   * no duration to watch — and spreading those instant changes further apart
   * only added dead air between them. Ruthnie, at ten seconds: covers landing
   * at one, four, and seven, with nothing happening in between.
   *
   * Real frames at a real rate fix both. Each cover now *arrives* — it fades up
   * and settles from slightly oversized — so there is something to follow, and
   * the gaps between landings are motion rather than a frozen picture.
   */
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * FPS))
  const frameDuration = 1 / FPS

  try {
    /**
     * When each cover starts and finishes arriving, as fractions of the clip.
     *
     * The opening and closing shares are held clear so the poster is empty for
     * a moment at the start and complete for a good while at the end. A single
     * cover takes the whole remainder, since there are no gaps to divide.
     */
    const openingShare = OPENING_SHARE
    const closingShare = rects.length > 1 ? CLOSING_SHARE : 0
    const revealShare = Math.max(0, 1 - openingShare - closingShare)
    const step = rects.length > 1 ? revealShare / (rects.length - 1) : 0

    for (let frame = 0; frame < totalFrames; frame += 1) {
      // Midpoint sampling: the frame represents the interval it covers, not its
      // leading edge, so a transition is not biased half a frame early.
      const t = (frame + 0.5) / totalFrames

      const progressOf = (index: number): number => {
        if (rects.length === 0) return 1
        const start = openingShare + step * index
        const span = ARRIVAL_SHARE * (rects.length > 1 ? step : revealShare)
        if (span <= 0) return t >= start ? 1 : 0
        return clamp01((t - start) / span)
      }

      compose(progressOf)
      await source.add(frame * frameDuration, frameDuration)

      if (frame % 4 === 0 || frame === totalFrames - 1) {
        onProgress?.((frame + 1) / totalFrames)
      }
    }

    await output.finalize()
  } catch (error) {
    // A half-written output holds encoder resources; cancelling releases them.
    if (output.state === 'started') {
      await output.cancel().catch(() => undefined)
    }
    throw error
  } finally {
    if (typeof ImageBitmap !== 'undefined') {
      if (still instanceof ImageBitmap) still.close()
      if (ground instanceof ImageBitmap) ground.close()
    }
  }

  const buffer = output.target.buffer
  if (!buffer) {
    throw new Error('The animation produced no file.')
  }

  onProgress?.(1)
  return new Blob([buffer], { type: 'video/mp4' })
}
