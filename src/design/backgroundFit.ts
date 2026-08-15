/**
 * How a background image fills the 1080x1920 frame.
 *
 * Two genuinely different kinds of source, and treating them the same is what
 * makes curated backgrounds hard to find:
 *
 *   `cover` — a photograph. One composition, cropped to the frame. Needs to be
 *             shot roughly 9:16 or the crop destroys it, and needs to be quiet
 *             where the grid sits.
 *
 *   `tile`  — a pattern. Scattered motifs on a flat ground, with no
 *             composition to preserve. Repeating it fills any frame at any
 *             source ratio, and a uniform pattern never competes with the grid
 *             the way a photographic subject does.
 *
 * Tiling is why square illustration sources are usable at all — which widens
 * the pool enormously, since most illustrated patterns are square.
 */

export type BackgroundFit = 'cover' | 'tile'

/**
 * Roughly-square sources are treated as patterns, portrait ones as photos.
 *
 * This is a heuristic, not a certainty — a square photograph exists — so
 * `fit` can be overridden per file (see `photoBackgrounds.ts`). It is right
 * often enough to be worth not making the user tag every file by hand.
 */
const SQUARE_TOLERANCE = 0.15

export function inferFit(width: number, height: number): BackgroundFit {
  if (width === 0 || height === 0) return 'cover'
  const ratio = width / height
  return Math.abs(ratio - 1) <= SQUARE_TOLERANCE ? 'tile' : 'cover'
}

/**
 * How many times a tile repeats across the poster's width.
 *
 * Chosen so the motifs read at roughly their drawn scale rather than being
 * blown up to fill the frame — a pattern scaled to one giant repeat stops
 * looking like a pattern.
 */
export const TILE_REPEATS_ACROSS = 2
