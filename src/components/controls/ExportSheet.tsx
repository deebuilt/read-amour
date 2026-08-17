import { PlayCircleOutlined, SaveOutlined, ShareAltOutlined } from '@ant-design/icons'
import { Modal, Slider, Typography } from 'antd'
import {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  TRANSITIONS,
  type TransitionId,
} from '../../export/posterVideo'
import styles from './ExportSheet.module.css'

/**
 * What to do with the finished poster.
 *
 * Four actions, which are really a two-by-two: a still or the animation, kept on
 * the device or handed to another app. So they are grouped by **what** and
 * ordered by **where**, which is the order the decision is actually made in —
 * you know whether you want the video before you know what you are doing with
 * it.
 *
 * They were a flat list of five rows before, and the flattening is what broke
 * it. Save-image, save-video, share-image, share-video read as four unrelated
 * buttons with nothing to say that two pairs of them are the same choice made
 * twice. And the animation length had nowhere to live: it governs both video
 * rows and neither image row, so wherever it sat in a flat column it looked
 * like a setting on whichever row happened to be above it. Ruthnie: "I wouldn't
 * know what the animation length thing is doing."
 *
 * Grouping fixes it without nesting. The control heads the animation group,
 * with both video actions beneath it, so what it applies to is legible from
 * where it sits. A nested version was built first and thrown away: it cost a tap
 * to reach the most common action, and putting the slider inside each video row
 * separately would have duplicated one setting across two places, which is the
 * flat problem again in miniature.
 *
 * The share rows are omitted where the device cannot share files, and the
 * animation group where the browser cannot encode, since a choice that does
 * nothing is worse than no choice.
 */

export type ExportIntent = 'save' | 'video' | 'share' | 'shareVideo'

interface ExportSheetProps {
  open: boolean
  /** Whether this device can hand files to an OS share sheet. */
  canShare: boolean
  /** Whether this browser can encode video at all. */
  canAnimate: boolean
  /** Why not, when it cannot — the two reasons need different sentences. */
  videoBlockedBy?: 'insecure-context' | 'unsupported'
  /** How long the video runs, in milliseconds. The reader's choice. */
  durationMs: number
  onDurationChange: (durationMs: number) => void
  /** How each cover arrives. */
  transition: TransitionId
  onTransitionChange: (transition: TransitionId) => void
  /** Covers on the poster, so the control can say what the pace works out to. */
  coverCount: number
  /** True while a poster is being rendered, so the sheet can show which. */
  busy?: ExportIntent
  /** 0 to 1 while the animation renders. Frames take long enough to show. */
  videoProgress?: number
  onSave: () => void
  onSaveVideo: () => void
  onShare: () => void
  onShareVideo: () => void
  onCancel: () => void
}

export function ExportSheet({
  open,
  canShare,
  canAnimate,
  videoBlockedBy,
  durationMs,
  onDurationChange,
  transition,
  onTransitionChange,
  coverCount,
  busy,
  videoProgress,
  onSave,
  onSaveVideo,
  onShare,
  onShareVideo,
  onCancel,
}: ExportSheetProps) {
  const isBusy = busy !== undefined

  /**
   * What the chosen length works out to per cover.
   *
   * The slider sets a total, but what the reader is judging is how long each
   * book gets — and that depends on how many are on the poster, which is not
   * arithmetic they should have to do. Ten seconds across three books is
   * unhurried; the same ten across twenty is brisk.
   *
   * The 0.62 mirrors the reveal's share of the clip in `posterToVideo`, and was
   * checked against the encoder's own arithmetic rather than eyeballed — exact
   * to the millisecond across every duration and cover count.
   */
  const seconds = (durationMs / 1000).toFixed(1).replace(/\.0$/, '')
  const perCover = coverCount > 1 ? (durationMs * 0.62) / (coverCount - 1) / 1000 : undefined
  const pace =
    coverCount === 0
      ? 'No covers on this poster yet.'
      : perCover === undefined
        ? 'One cover, so the clip rests on it.'
        : `${coverCount} covers, about ${perCover.toFixed(perCover < 1 ? 2 : 1)}s apart.`

  const progressSuffix =
    videoProgress !== undefined && videoProgress > 0
      ? ` ${Math.round(videoProgress * 100)}%`
      : ''

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      centered
      width={360}
      title="Your poster"
      // Rendering the poster takes a moment; dismissing mid-export would leave
      // the work running with nowhere to land.
      maskClosable={!isBusy}
      closable={!isBusy}
      /*
       * The shell already clips itself and the document, so antd does not need
       * to take the scrollbar away on open — and its restore afterwards was
       * leaving `body` able to scroll where it previously could not. Opening
       * this sheet once was enough to give the page a scrollbar that outlived
       * it, which pushed the action bar off the bottom of the screen.
       */
      styles={{ wrapper: { overflow: 'hidden' } }}
    >
      <div className={styles.groups}>
        <section className={styles.group}>
          <Typography.Text className={styles.groupHeading}>Image</Typography.Text>

          <div className={styles.options}>
            <button
              type="button"
              className={styles.option}
              onClick={onSave}
              disabled={isBusy}
            >
              <SaveOutlined className={styles.icon} aria-hidden />
              <Typography.Text className={styles.label}>
                {busy === 'save' ? 'Saving…' : 'Save photo'}
              </Typography.Text>
            </button>

            {canShare && (
              <button
                type="button"
                className={styles.option}
                onClick={onShare}
                disabled={isBusy}
              >
                <ShareAltOutlined className={styles.icon} aria-hidden />
                <Typography.Text className={styles.label}>
                  {busy === 'share' ? 'Preparing…' : 'Share photo'}
                </Typography.Text>
              </button>
            )}
          </div>
        </section>

        <section className={styles.group}>
          <Typography.Text className={styles.groupHeading}>Animation</Typography.Text>

          {canAnimate ? (
            <div className={styles.options}>
              {/*
                The length control heads the group it governs.

                Nothing sits between it and the two actions it affects, which is
                the entire point — flat, it had an image row above it and a video
                row below, and belonged visibly to neither.

                It is also the only setting the animation exposes. Every other
                timing was a constant invented in the encoder — a per-cover beat,
                a floor under it, a minimum total, two end holds — and they were
                wrong twice running, because pacing is taste and none of them
                were derived from anything. The reader sets the length; the rest
                follows from that and from how many covers there are.
              */}
              <div className={styles.duration}>
                <div className={styles.durationHead}>
                  <span className={styles.durationLabel}>
                    <PlayCircleOutlined className={styles.durationIcon} aria-hidden />
                    <Typography.Text className={styles.label}>Length</Typography.Text>
                  </span>
                  <Typography.Text className={styles.durationValue}>{seconds}s</Typography.Text>
                </div>
                <Slider
                  min={MIN_DURATION_MS}
                  max={MAX_DURATION_MS}
                  step={500}
                  value={durationMs}
                  onChange={onDurationChange}
                  disabled={isBusy}
                  tooltip={{ open: false }}
                  aria-label="How long the animation runs, in seconds"
                />
                <Typography.Text className={styles.hint}>{pace}</Typography.Text>
              </div>

              {/*
                How each cover arrives, beneath the length it shares a timeline
                with. Both are settings on the animation and neither is a
                setting on a row, so they sit together above the two actions —
                the same reasoning that moved the slider out of the flat list.

                Named options rather than a preview of each. A four-up row of
                looping animations in a modal is a distraction while choosing,
                and the real preview is the export itself, which takes seconds.
                The label plus one line of description is enough to pick from,
                and picking wrong costs one more export.
              */}
              <div className={styles.transition}>
                <Typography.Text className={styles.label}>Transition</Typography.Text>
                <div
                  className={styles.transitionOptions}
                  role="radiogroup"
                  aria-label="How each cover appears"
                >
                  {TRANSITIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={option.id === transition}
                      className={[
                        styles.transitionOption,
                        option.id === transition ? styles.transitionSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onTransitionChange(option.id)}
                      disabled={isBusy}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <Typography.Text className={styles.hint}>
                  {TRANSITIONS.find((option) => option.id === transition)?.description}
                </Typography.Text>
              </div>

              {/*
                Every label names what it acts on: photo or video.

                Both groups said "Save to your photos" at one point, with the
                same floppy icon, one of them producing an MP4 — the hint line
                was carrying the entire distinction, which is too much to ask of
                the small grey text nobody reads first. Naming the artefact in
                the label costs one word and removes the ambiguity outright.
              */}
              <button
                type="button"
                className={styles.option}
                onClick={onSaveVideo}
                disabled={isBusy}
              >
                <SaveOutlined className={styles.icon} aria-hidden />
                <Typography.Text className={styles.label}>
                  {busy === 'video' ? `Building…${progressSuffix}` : 'Save video'}
                </Typography.Text>
              </button>

              {canShare && (
                <button
                  type="button"
                  className={styles.option}
                  onClick={onShareVideo}
                  disabled={isBusy}
                >
                  <ShareAltOutlined className={styles.icon} aria-hidden />
                  <Typography.Text className={styles.label}>
                    {busy === 'shareVideo' ? `Building…${progressSuffix}` : 'Share video'}
                  </Typography.Text>
                </button>
              )}
            </div>
          ) : (
            /* One line rather than disabled rows: there is nothing to choose
               between here, only a reason it is unavailable. */
            <Typography.Text className={styles.unavailable}>
              {videoBlockedBy === 'insecure-context'
                ? 'Needs a secure connection — open the app over HTTPS.'
                : 'This browser cannot record video.'}
            </Typography.Text>
          )}
        </section>
      </div>
    </Modal>
  )
}
