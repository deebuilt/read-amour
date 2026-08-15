/**
 * Photographic backgrounds shipped with the app.
 *
 * Files live in `src/assets/backgrounds/` — imported rather than dropped in
 * `public/` so Vite fingerprints and optimises them, and so the base-path
 * rewrite for GitHub Pages happens automatically. They are discovered at build
 * time by filename, so adding a design means dropping in a file: no registry
 * to update and no way for the list to drift from the folder.
 *
 * Naming: `<month>-<nn>.jpg`, lowercase, e.g. `august-01.jpg`. The month
 * prefix lets the picker surface the right designs for the board being
 * edited; `general-*.jpg` is the escape hatch for anything seasonless.
 *
 * JPG rather than PNG deliberately: these are photographs, where PNG costs
 * roughly ten times the bytes for no visible gain.
 */

import type { BackgroundFit } from './backgroundFit'

/** Vite resolves these at build time and rewrites the URLs for the base path. */
const FILES = import.meta.glob<string>('../assets/backgrounds/*.{jpg,jpeg,JPG,JPEG}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export interface PhotoBackground {
  id: string
  url: string
  /** Lowercase month name, or `general` when it suits any month. */
  month: string
  /** Ordinal within the month, from the filename. */
  ordinal: number
  label: string
  /**
   * Explicit fit override. Filenames ending `-tile` are always tiled and
   * `-photo` always cropped, for the cases where the square/portrait
   * heuristic in `backgroundFit.ts` guesses wrong.
   */
  fitOverride?: BackgroundFit
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const

function parseFileName(
  path: string,
): { month: string; ordinal: number; fitOverride?: BackgroundFit } | undefined {
  const base = path.split('/').pop()?.toLowerCase()
  if (!base) return undefined

  // `august-01.jpg`, or `august-01-tile.jpg` to force a fit.
  const match = /^([a-z]+)-(\d+)(?:-(tile|photo))?\.(?:jpg|jpeg)$/.exec(base)
  if (!match) return undefined

  const [, name, ordinal, fit] = match
  const isKnown = name === 'general' || MONTHS.includes(name as (typeof MONTHS)[number])
  if (!isKnown) return undefined

  return {
    month: name,
    ordinal: Number(ordinal),
    fitOverride: fit === 'tile' ? 'tile' : fit === 'photo' ? 'cover' : undefined,
  }
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export const PHOTO_BACKGROUNDS: readonly PhotoBackground[] = Object.entries(FILES)
  .map(([path, url]): PhotoBackground | undefined => {
    const parsed = parseFileName(path)
    if (!parsed) return undefined

    return {
      id: `photo-${parsed.month}-${parsed.ordinal}`,
      url,
      month: parsed.month,
      ordinal: parsed.ordinal,
      label: `${titleCase(parsed.month)} ${parsed.ordinal}`,
      fitOverride: parsed.fitOverride,
    }
  })
  .filter((bg): bg is PhotoBackground => bg !== undefined)
  .sort((a, b) => {
    const monthDiff = MONTHS.indexOf(a.month as (typeof MONTHS)[number]) -
      MONTHS.indexOf(b.month as (typeof MONTHS)[number])
    return monthDiff !== 0 ? monthDiff : a.ordinal - b.ordinal
  })

export function getPhotoBackground(id: string): PhotoBackground | undefined {
  return PHOTO_BACKGROUNDS.find((bg) => bg.id === id)
}

/** `2026-08` → `august`, for matching a board to its seasonal designs. */
export function monthSlugFromKey(monthKey: string): string {
  const index = Number(monthKey.split('-')[1]) - 1
  return MONTHS[index] ?? 'general'
}

/**
 * Designs for a board, this month's first.
 *
 * The rest still follow rather than being hidden — someone building an August
 * poster in October may well want an October photo, and a picker that refuses
 * to show them is a picker they have to fight.
 */
export function photosForMonth(monthKey: string): PhotoBackground[] {
  const slug = monthSlugFromKey(monthKey)
  const seasonal = PHOTO_BACKGROUNDS.filter((bg) => bg.month === slug)
  const general = PHOTO_BACKGROUNDS.filter((bg) => bg.month === 'general')
  const rest = PHOTO_BACKGROUNDS.filter((bg) => bg.month !== slug && bg.month !== 'general')
  return [...seasonal, ...general, ...rest]
}

export interface PhotoGroup {
  month: string
  /** `September`, or `Any month` for the seasonless ones. */
  heading: string
  photos: PhotoBackground[]
}

/**
 * The same ordering as `photosForMonth`, split into labelled runs.
 *
 * The designs are named after months and nothing in the UI ever said so — the
 * name lived only in an `aria-label`. A poster built in August scrolls straight
 * from the August designs into September and October with no visible seam, so
 * the picker read as one undifferentiated wall of photographs.
 *
 * Grouped rather than captioned per tile: ten captions is the same word
 * repeated in pairs, while five headings actually organise the list.
 */
export function photoGroupsForMonth(monthKey: string): PhotoGroup[] {
  const groups: PhotoGroup[] = []

  for (const photo of photosForMonth(monthKey)) {
    const last = groups[groups.length - 1]
    if (last?.month === photo.month) {
      last.photos.push(photo)
      continue
    }

    groups.push({
      month: photo.month,
      heading: photo.month === 'general' ? 'Any month' : titleCase(photo.month),
      photos: [photo],
    })
  }

  return groups
}
