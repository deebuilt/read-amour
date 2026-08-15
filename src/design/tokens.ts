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
 * `marginX` and the band heights are fixed; the SLOT SIZE IS NOT. Slot size is
 * computed per grid in `layoutGrid` so the block always fits the space between
 * the title and the bottom margin. A fixed slot size looks correct at one grid
 * shape and runs off the canvas at others.
 */
export const poster = {
  marginX: 72,
  titleTop: 132,
  titleGap: 18,
  /** Vertical space reserved for the title block below `titleTop`. */
  titleBand: 190,
  /** Clear space under the grid. Larger than the visual gap looks, because
   *  Instagram overlays reply controls across the bottom of a Story. */
  gridBottom: 260,
  /** The least clearance a tall grid may leave before it must shrink instead. */
  gridBottomMin: 150,
  gridGap: 20,
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
