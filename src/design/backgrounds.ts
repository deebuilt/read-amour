/**
 * Built-in backgrounds.
 *
 * Generated rather than photographic, on purpose. Shipping stock photography
 * means licensing questions and a large bundle; generated grounds are a few
 * hundred bytes each, work offline, and — the part that actually matters —
 * are designed to sit *under* book covers rather than compete with them.
 * Colourful photography behind sixteen colourful covers reads as noise.
 *
 * Users who want a photo upload their own, which is a better poster anyway.
 */

export interface BuiltinBackground {
  id: string
  name: string
  /** CSS background shorthand. */
  css: string
  /** Whether poster type should default to dark ink on this ground. */
  isLight: boolean
}

export const BUILTIN_BACKGROUNDS: readonly BuiltinBackground[] = [
  {
    id: 'paper',
    name: 'Paper',
    css: '#f2ece1',
    isLight: true,
  },
  {
    id: 'ink',
    name: 'Ink',
    css: '#1c1a17',
    isLight: false,
  },
  {
    id: 'oxblood',
    name: 'Oxblood',
    css: '#6d232b',
    isLight: false,
  },
  {
    id: 'sage',
    name: 'Sage',
    css: '#8f9b83',
    isLight: false,
  },
  {
    id: 'dusk',
    name: 'Dusk',
    css: 'linear-gradient(170deg, #2b3a55 0%, #4a5d7e 55%, #7c8ba8 100%)',
    isLight: false,
  },
  {
    id: 'ember',
    name: 'Ember',
    css: 'linear-gradient(175deg, #3d1f1a 0%, #7a3b2e 60%, #b4634a 100%)',
    isLight: false,
  },
  {
    /*
     * Cool rather than warm, and deliberately so: this used to be a warm
     * off-white gradient that averaged out to almost exactly `paper`, and the
     * two were indistinguishable as swatches. A light ground earns its place
     * here only by differing in temperature, not by a few points of lightness.
     */
    id: 'stone',
    name: 'Stone',
    css: 'linear-gradient(170deg, #e8e8ea 0%, #cdcfd4 100%)',
    isLight: true,
  },
  {
    id: 'sea',
    name: 'Sea',
    css: 'linear-gradient(180deg, #cfe4e2 0%, #9dc4c3 60%, #6f9f9e 100%)',
    isLight: true,
  },
] as const

export const DEFAULT_BACKGROUND_ID = 'paper'

export function getBuiltinBackground(id: string): BuiltinBackground {
  return BUILTIN_BACKGROUNDS.find((bg) => bg.id === id) ?? BUILTIN_BACKGROUNDS[0]
}
