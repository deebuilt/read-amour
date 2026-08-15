import { forwardRef } from 'react'
import { POSTER, poster as posterTokens } from '../../design/tokens'
import { layoutGrid } from '../../domain/layout'
import { getTypeface } from '../../design/typefaces'
import { supportsCoverBleed, type Board, type Book } from '../../types/domain'
import { PosterBackground } from './PosterBackground'
import { PosterSlot } from './PosterSlot'
import styles from './Poster.module.css'

/**
 * The artwork itself.
 *
 * Always rendered at exactly 1080x1920 and scaled to fit its container with a
 * CSS transform. This is the single most important decision in the app: the
 * preview and the export are the same DOM at the same intrinsic size, so what
 * the user sees is what the PNG contains. Laying the poster out responsively
 * and re-deriving it at export time is how these tools end up shipping images
 * that do not match the preview.
 *
 * Every dimension comes from `tokens.poster` in export pixels.
 */

interface PosterProps {
  board: Board
  /** Books by id, for slots that are filled. */
  books: Map<string, Book>
  /** Resolved object URLs by cover key. */
  coverUrls: Map<string, string>
  /** Background object URL, when the background is an upload. */
  backgroundUrl?: string
  /** Screen width available to the poster, in CSS px. */
  displayWidth: number
  onSlotClick?: (index: number) => void
  /** Export renders without slot affordances or empty-slot hints. */
  isExporting?: boolean
}

export const Poster = forwardRef<HTMLDivElement, PosterProps>(function Poster(
  { board, books, coverUrls, backgroundUrl, displayWidth, onSlotClick, isExporting = false },
  ref,
) {
  const typeface = getTypeface(board.text.typefaceId)
  const scale = displayWidth / POSTER.width

  const { columns, rows } = board.grid

  /**
   * Cover bleed only applies where it does not wreck the covers.
   *
   * The flag is kept on the board even while a shape cannot honour it, so
   * moving from 4x4 to 5x2 and back restores the mode rather than silently
   * forgetting it. See `supportsCoverBleed` for why the shape decides.
   */
  const isBleeding = board.coverBleed === true && supportsCoverBleed(board.grid)

  // Slot size and grid position are fitted to the frame and to the real height
  // of the title block, never assumed — see `layoutGrid`.
  const { slotWidth, slotHeight, gridTop } = layoutGrid(board.grid, board.text, isBleeding)

  const titleText =
    typeface.titleCase === 'upper' ? board.text.title.toUpperCase() : board.text.title

  const plate = board.text.titlePlate

  return (
    // The wrapper reserves the scaled footprint in layout flow; the inner
    // frame is the true-size artwork that gets exported.
    <div
      className={styles.wrapper}
      style={{
        width: displayWidth,
        height: displayWidth / POSTER.aspectRatio,
      }}
    >
      <div
        ref={ref}
        className={styles.frame}
        style={{
          width: POSTER.width,
          height: POSTER.height,
          transform: `scale(${scale})`,
        }}
      >
        <PosterBackground
          background={board.background}
          treatment={board.treatment}
          imageUrl={backgroundUrl}
        />

        <div className={styles.content}>
          {/*
            In bleed mode the type sits ON the covers rather than above them,
            so it needs a ground of its own — a white title on a pale cover is
            invisible, and the covers are unpredictable by definition. The same
            gradient scrim `PosterSlot` uses for its stars, for the same reason.

            The scrims are part of the artwork and export with it. Fixed rgba,
            never a token: this is inside the PNG.
          */}
          {isBleeding && <div className={styles.topScrim} aria-hidden />}
          {isBleeding && board.text.caption && (
            <div className={styles.bottomScrim} aria-hidden />
          )}

          <header
            className={styles.header}
            style={{
              paddingTop: posterTokens.titleTop,
              paddingInline: posterTokens.marginX,
              // Above the covers when they run underneath it.
              position: isBleeding ? 'relative' : undefined,
              zIndex: isBleeding ? 1 : undefined,
            }}
          >
            {/* The plate hugs the type rather than spanning the frame, so it
                reads as a label on the artwork instead of a banner across it. */}
            <span
              className={styles.titleBlock}
              style={
                plate
                  ? {
                      background: plate.color,
                      borderRadius: plate.radius,
                      paddingBlock: posterTokens.platePaddingY,
                      paddingInline: posterTokens.platePaddingX,
                    }
                  : undefined
              }
            >
              <h1
                className={styles.title}
                style={{
                  fontFamily: typeface.stack,
                  fontSize: posterTokens.titleSize * typeface.titleScale,
                  letterSpacing: typeface.titleTracking,
                  color: board.text.inkColor,
                }}
              >
                {titleText}
              </h1>
              {board.text.subtitle && (
                <p
                  className={styles.subtitle}
                  style={{
                    fontFamily: typeface.stack,
                    fontSize: posterTokens.subtitleSize,
                    letterSpacing: posterTokens.subtitleTracking,
                    marginTop: posterTokens.titleGap,
                    color: board.text.inkColor,
                  }}
                >
                  {board.text.subtitle.toUpperCase()}
                </p>
              )}
            </span>
          </header>

          <div
            className={styles.grid}
            style={{
              // Absolute against the frame rather than flowed after the title,
              // so the title's own height cannot shift the grid off its mark.
              position: 'absolute',
              top: gridTop,
              left: 0,
              right: 0,
              gridTemplateColumns: `repeat(${columns}, ${slotWidth}px)`,
              gridAutoRows: `${slotHeight}px`,
              // No gap in bleed mode: the covers meet.
              gap: isBleeding ? 0 : posterTokens.gridGap,
              // Behind the type and its scrims, which overlay the artwork.
              zIndex: isBleeding ? 0 : undefined,
            }}
          >
            {Array.from({ length: columns * rows }, (_, index) => {
              const slot = board.slots.find((s) => s.index === index)
              const book = slot?.bookId ? books.get(slot.bookId) : undefined
              const coverUrl = book?.coverBlobKey ? coverUrls.get(book.coverBlobKey) : undefined

              return (
                <PosterSlot
                  key={index}
                  index={index}
                  book={book}
                  coverUrl={coverUrl}
                  inkColor={board.text.inkColor}
                  fontFamily={typeface.stack}
                  // Ratings get busy fast with no gaps between the covers, and
                  // the mode is about the books rather than the reviews. The
                  // board's own setting is left untouched, so turning bleed off
                  // brings the stars back.
                  showRating={board.showRatings === true && !isBleeding}
                  isFavourite={book !== undefined && book.id === board.favouriteBookId}
                  isBleeding={isBleeding}
                  slotWidth={slotWidth}
                  isExporting={isExporting}
                  onClick={onSlotClick}
                />
              )
            })}
          </div>

          {board.text.caption && (
            <footer
              className={styles.footer}
              style={{
                paddingBottom: posterTokens.captionBottom,
                paddingInline: posterTokens.marginX,
                position: isBleeding ? 'relative' : undefined,
                zIndex: isBleeding ? 1 : undefined,
              }}
            >
              {/*
                Full opacity, not 0.85. The caption is already the smallest type
                on the poster and it frequently sits over photography — knocking
                it back as well left a handle that could not be read at all. The
                poster ink is chosen against the background it sits on, so it is
                the colour that carries legibility here; dimming it only undoes
                that choice.

                The title plate covers the handle too. Both are poster type over
                the same artwork with the same problem, and a plate that rescued
                the month while leaving the handle to wash out against a busy
                illustration was solving half of one problem. It is the same
                object from the board — one control, both pieces of type — so
                they cannot drift apart in colour or corner.
              */}
              <span
                className={styles.captionBlock}
                style={
                  plate
                    ? {
                        background: plate.color,
                        borderRadius: plate.radius,
                        paddingBlock: posterTokens.captionPlatePaddingY,
                        paddingInline: posterTokens.captionPlatePaddingX,
                      }
                    : undefined
                }
              >
                <span
                  style={{
                    fontFamily: typeface.stack,
                    fontSize: posterTokens.captionSize,
                    letterSpacing: posterTokens.captionTracking,
                    color: board.text.inkColor,
                  }}
                >
                  {board.text.caption}
                </span>
              </span>
            </footer>
          )}
        </div>
      </div>
    </div>
  )
})
