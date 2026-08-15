/**
 * Poster ink colours.
 *
 * A curated set rather than a raw colour wheel. Illustrated backgrounds tend
 * to be mid-tone and saturated, where pure white glares and pure black goes
 * muddy — so the useful choices are a warm off-white, a soft near-black, and a
 * few deep tones that read as deliberate against colour. A full picker is
 * still available for anyone matching a specific hue in their image.
 *
 * These are fixed hex values, never theme variables: they end up inside the
 * exported PNG, which must not change with the app's light/dark setting.
 */

export interface InkColor {
  id: string
  name: string
  value: string
  /** Whether this ink needs a light or dark ground to read. */
  needs: 'dark-ground' | 'light-ground'
}

export const INK_COLORS: readonly InkColor[] = [
  { id: 'white', name: 'White', value: '#ffffff', needs: 'dark-ground' },
  { id: 'cream', name: 'Cream', value: '#f6efe2', needs: 'dark-ground' },
  { id: 'ink', name: 'Ink', value: '#1c1a17', needs: 'light-ground' },
  { id: 'espresso', name: 'Espresso', value: '#3d2b21', needs: 'light-ground' },
  { id: 'oxblood', name: 'Oxblood', value: '#6d232b', needs: 'light-ground' },
  { id: 'forest', name: 'Forest', value: '#2f4433', needs: 'light-ground' },
  { id: 'navy', name: 'Navy', value: '#22314d', needs: 'light-ground' },
  { id: 'clay', name: 'Clay', value: '#a8503a', needs: 'light-ground' },
] as const

export const DEFAULT_INK = '#ffffff'

/**
 * Relative luminance, for deciding whether a swatch needs a border to be
 * visible against the panel. Standard sRGB coefficients.
 */
export function luminance(hex: string): number {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return 0.5

  const toLinear = (channel: number): number => {
    const v = channel / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }

  const r = toLinear(Number.parseInt(clean.slice(0, 2), 16))
  const g = toLinear(Number.parseInt(clean.slice(2, 4), 16))
  const b = toLinear(Number.parseInt(clean.slice(4, 6), 16))

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function isLightInk(hex: string): boolean {
  return luminance(hex) > 0.5
}
