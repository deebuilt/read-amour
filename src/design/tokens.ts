/**
 * Single source of truth for every visual value in Read Amour.
 *
 * Two distinct systems live here and must not be mixed:
 *
 *   `app`    — the editing chrome the user touches (drawers, buttons, lists).
 *              Sized in px against a real phone viewport.
 *
 *   `poster` — the exported artwork. Sized against the 1080x1920 export
 *              canvas, NOT the screen. The canvas is rendered at a scaled-down
 *              size on screen and scaled back up at export time, so every
 *              poster value is expressed in export pixels and stays correct at
 *              any preview size.
 *
 * Nothing outside this file should contain a raw pixel number.
 */

/** The exported image is always a 9:16 Instagram Story frame. */
export const POSTER = {
  width: 1080,
  height: 1920,
  aspectRatio: 1080 / 1920,
} as const

/**
 * App chrome colour, resolved at runtime from CSS custom properties so light
 * and dark are one system rather than two parallel palettes. The literals here
 * are the light values; `theme.css` redefines the same variables for dark.
 *
 * Poster colour is deliberately NOT themed. The poster is an exported image —
 * its palette must be a choice the user made on the board, not a consequence
 * of what their OS theme happened to be at export time.
 */
export const color = {
  ink: 'var(--ra-ink, #1c1a17)',
  inkSoft: 'var(--ra-ink-soft, #4a4540)',
  inkFaint: 'var(--ra-ink-faint, #8a8179)',
  paper: 'var(--ra-paper, #f7f3ec)',
  paperRaised: 'var(--ra-paper-raised, #fffdf9)',
  line: 'var(--ra-line, #e2dbd0)',
  lineStrong: 'var(--ra-line-strong, #cdc3b4)',
  accent: 'var(--ra-accent, #8c2f39)',
  accentSoft: 'var(--ra-accent-soft, #f3e3e2)',
  /**
   * Poster ink. Fixed hex, never a variable — these end up inside the exported
   * PNG, and html-to-image cannot resolve a custom property that changes
   * meaning between themes.
   */
  posterInk: '#ffffff',
  posterInkDark: '#1c1a17',
  posterSlot: 'rgba(255, 255, 255, 0.42)',
  posterSlotLine: 'rgba(255, 255, 255, 0.55)',
} as const

/**
 * Type scale for app chrome, in px. A fourth-based scale rather than a
 * uniform ramp, so headings actually separate from body text.
 */
export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 17,
  lg: 21,
  xl: 28,
  xxl: 38,
} as const

export const fontWeight = {
  regular: 400,
  medium: 500,
  bold: 700,
} as const

/** 4px base unit. Every gap, pad, and inset comes from here. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export const radius = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 8,
  pill: 999,
} as const

/**
 * Poster geometry, in export pixels against the 1080x1920 canvas.
 *
 * The margins and the band heights are fixed; the SLOT SIZE IS NOT. Slot size is
 * computed per grid in `layoutGrid` so the block always fits the space between
 * the title and the bottom margin. A fixed slot size looks correct at one grid
 * shape and runs off the canvas at others.
 */
export const poster = {
  /**
   * Side margin for the title and caption.
   *
   * Type wants more air than artwork does. A headline set close to the edge
   * reads as a mistake where a cover bled toward it reads as a full-bleed
   * poster, so this stayed at 72 when `gridMarginX` came down.
   */
  marginX: 72,
  /**
   * Side margin for the grid, which is smaller than the type's on purpose.
   *
   * The covers are the poster. Everything else on it — the title, the handle —
   * is a label on the thing, and the thing was being kept 72px from the edge
   * for no reason except that one number served both jobs.
   *
   * **This is the only lever that makes a cover bigger.** Slots are locked to
   * 2:3 so they never crop, which means a slot cannot widen without growing
   * 1.5x taller, and the frame has no spare height. So every wide shape is
   * pressed flat against the available width already — 4x2, 3x3, 4x4 and 5x4
   * each had exactly this margin as their only slack, and rearranging rows and
   * columns could never reach it. Taking 32px off each side is what actually
   * hands that space to the artwork.
   *
   * The gain runs 4.5% on 2x2 to 11.2% on 5x4, and the smallest slots gain the
   * most, which is the right way round — a 171px cover on a 5x4 needed it and a
   * 458px cover on a 2x2 did not.
   */
  gridMarginX: 40,
  titleTop: 132,
  titleGap: 18,
  /** Vertical space reserved for the title block below `titleTop`. */
  titleBand: 190,
  /** Clear space under the grid. Larger than the visual gap looks, because
   *  Instagram overlays reply controls across the bottom of a Story. */
  gridBottom: 260,
  /** The least clearance a tall grid may leave before it must shrink instead. */
  gridBottomMin: 150,
  /**
   * Space between covers.
   *
   * Was 20, and every pixel of it is multiplied: a 5-column grid spends four
   * gaps across, so trimming 8px hands 32px back to the covers on exactly the
   * shapes whose slots are smallest. Deliberately not zero — touching covers
   * read as one collaged block rather than as separate books, and that is what
   * cover-bleed mode is for.
   */
  gridGap: 12,
  /** Book covers are near-universally 2:3. Slots match so covers never crop. */
  slotAspectRatio: 2 / 3,
  /** Breathing room inside the title plate, when one is used. */
  platePaddingY: 34,
  platePaddingX: 52,
  titleSize: 96,
  subtitleSize: 40,
  subtitleTracking: 12,
  /**
   * The handle along the bottom edge.
   *
   * 30 was unreadable, and the reason it looked so much worse than the number
   * suggests is that it is measured against the 1080px export canvas, not the
   * screen: on a phone previewing the poster at ~360px wide, 30 export pixels
   * render at about 10. Small on the exported image, illegible in the preview
   * where the poster is actually judged.
   *
   * 40 matches the subtitle, which is the right relationship — a handle and a
   * standfirst are both secondary to the title and neither should outrank the
   * other. It is 3.7% of the frame width, so it holds at every grid shape: the
   * caption sits in the bottom margin and never competes with the slots.
   */
  captionSize: 40,
  /** Slight tracking: a handle is read character by character, not as a word. */
  captionTracking: 1,
  /**
   * The caption's plate is tighter than the title's.
   *
   * The title's 34/52 wraps type set at 96 and would read as a slab around a
   * 40px handle — a plate should look like it was cut to its type, not like the
   * type is floating in it. Scaled to roughly the same proportion of the type
   * it surrounds.
   */
  captionPlatePaddingY: 14,
  captionPlatePaddingX: 24,
  captionBottom: 84,
} as const

/**
 * Screen breakpoints. Mobile is the design target; these mark where the
 * layout earns more room, not where it starts working.
 */
export const breakpoint = {
  phone: 480,
  tablet: 768,
  desktop: 1080,
} as const

/** Editing chrome sizing that must clear a thumb, not a cursor. */
export const control = {
  minTouchTarget: 44,
  drawerHandleHeight: 28,
  bottomBarHeight: 64,
} as const

export const zIndex = {
  canvas: 1,
  canvasOverlay: 10,
  bottomBar: 100,
  drawer: 200,
  modal: 300,
} as const

export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const
