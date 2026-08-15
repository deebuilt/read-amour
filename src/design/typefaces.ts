/**
 * Poster typefaces.
 *
 * Deliberately a short, curated list rather than a font menu. Each face is a
 * different editorial voice, not a different flavour of the same one, so the
 * choice actually changes the poster instead of nudging it.
 *
 * All are self-hosted via @fontsource so the export never waits on a network
 * font — a missing face at render time silently falls back and ruins the PNG.
 */

export interface Typeface {
  id: TypefaceId
  /** Shown in the picker. */
  name: string
  /** One-line description of the voice it carries. */
  voice: string
  /** CSS font-family stack. */
  stack: string
  /** Title casing this face is designed around. */
  titleCase: 'upper' | 'title'
  /**
   * Per-face optical corrections. The same px size reads very differently
   * across a condensed grotesque and a high-contrast serif, so each face
   * scales the shared token rather than the token being re-picked per face.
   */
  titleScale: number
  titleTracking: number
}

export type TypefaceId = 'editorial' | 'grotesque' | 'script'

export const TYPEFACES: readonly Typeface[] = [
  {
    id: 'editorial',
    name: 'Fraunces',
    voice: 'High-contrast serif. Bookish and warm.',
    stack: '"Fraunces", Georgia, serif',
    titleCase: 'title',
    titleScale: 1,
    titleTracking: -2,
  },
  {
    id: 'grotesque',
    name: 'Archivo',
    voice: 'Wide grotesque. Modern and plain-spoken.',
    stack: '"Archivo", "Helvetica Neue", sans-serif',
    titleCase: 'upper',
    titleScale: 0.82,
    titleTracking: 6,
  },
  {
    id: 'script',
    name: 'Caveat',
    voice: 'Hand-drawn. Loose and personal.',
    stack: '"Caveat", cursive',
    titleCase: 'title',
    titleScale: 1.24,
    titleTracking: 0,
  },
] as const

export const DEFAULT_TYPEFACE_ID: TypefaceId = 'editorial'

export function getTypeface(id: TypefaceId): Typeface {
  const found = TYPEFACES.find((t) => t.id === id)
  // The id union makes this unreachable, but a board loaded from IndexedDB
  // could predate a face being renamed.
  return found ?? TYPEFACES[0]
}
