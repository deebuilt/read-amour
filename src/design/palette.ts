import { luminance } from './inkColors'

/**
 * Grounds sampled from the covers on the poster.
 *
 * The app already holds real colour — every cover is a blob in IndexedDB — and
 * throws all of it away at render time. A poster whose ground was pulled from
 * its own covers looks composed rather than decorated, and no two months land
 * the same.
 *
 * Pure module, no React. `useCoverPalette` owns the async and the caching.
 *
 * Canvas tainting is not a risk here, and that is only true because of the blob
 * rule: covers are same-origin object URLs, so `getImageData` is legal. If
 * anything in this file ever reaches for a remote image URL directly it will
 * throw a `SecurityError` — the same rule that protects the export protects
 * this.
 */

export interface PaletteSwatch {
  /** Fixed hex. Written into `board.background` and ends up inside the PNG. */
  value: string
  /** Poster ink that reads against it, decided by luminance, never guessed. */
  ink: string
  /** Whether this is the pale or the deep treatment of its source colour. */
  tone: 'tint' | 'shade'
}

/**
 * Sampling size. The average is wanted, not the detail — a cover decoded to
 * 64x96 still carries its palette and costs almost nothing to walk.
 */
const SAMPLE_WIDTH = 64
const SAMPLE_HEIGHT = 96

/**
 * Channel bits discarded when bucketing. Shifting right by 4 leaves 16 levels
 * per channel — 4096 buckets, which clusters near-identical pixels together
 * while keeping genuinely different colours apart.
 */
const QUANTISE_BITS = 4

/** Pixels this dark or this pale carry no usable hue and skew every average. */
const MIN_USEFUL_LUMA = 0.06
const MAX_USEFUL_LUMA = 0.94

/**
 * Least saturation a pixel needs before its colour counts.
 *
 * At 0.12 this admitted the near-greys that make up most of a cover's ink and
 * paper, and a ground derived from those is a grey labelled "from your books" —
 * true, and no use to anyone. It cannot answer the question the row exists to
 * answer, which is *where did this colour come from?*
 *
 * 0.25 keeps the colours a reader would actually name if asked what colour a
 * cover is. A poster whose covers are genuinely all monochrome gets fewer
 * swatches, or none, which is the honest outcome — better than inventing a
 * grey and claiming it came from the books.
 */
const MIN_USEFUL_SATURATION = 0.25

/** How many distinct source colours to keep before deriving grounds from them. */
const SOURCE_COLOURS = 3

/**
 * How far apart two source colours must sit on the hue wheel to count as
 * different, as a fraction of the full circle. 0.08 is about 29 degrees.
 *
 * Taking the top buckets by population alone does not give distinct colours: a
 * histogram of book covers is dominated by *one* hue in slightly different
 * shades, so the top three come back as three reds. Both grounds are then
 * derived from each, and the row shows the same swatch five times.
 *
 * That is what the first version shipped, and it is the whole value of the
 * feature gone — the point is a range pulled from the books, not one colour
 * repeated. Population still decides the order; this decides what is allowed to
 * join the list.
 */
const MIN_HUE_SEPARATION = 0.08

/**
 * How far apart on the hue wheel, in the same units, before a near-grey counts
 * as its own colour. Desaturated buckets have unstable hue — two barely-tinted
 * creams can sit a third of the wheel apart and look identical — so they are
 * held to a saturation test instead.
 */
const MIN_SATURATION_SEPARATION = 0.12

interface Hsl {
  h: number
  s: number
  l: number
}

function toHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2

  if (delta === 0) return { h: 0, s: 0, l }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)

  let h: number
  if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / delta + 2) / 6
  else h = ((rn - gn) / delta + 4) / 6

  return { h, s, l }
}

function hslToHex({ h, s, l }: Hsl): string {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const secondary = chroma * (1 - Math.abs(((h * 6) % 2) - 1))
  const match = l - chroma / 2

  const sector = Math.floor(h * 6) % 6
  const [r, g, b] =
    sector === 0
      ? [chroma, secondary, 0]
      : sector === 1
        ? [secondary, chroma, 0]
        : sector === 2
          ? [0, chroma, secondary]
          : sector === 3
            ? [0, secondary, chroma]
            : sector === 4
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]

  const channel = (value: number): string =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/**
 * Turn a sampled colour into something a poster can stand on, while leaving it
 * recognisably the colour that was sampled.
 *
 * The first version clamped saturation to 28% and forced lightness to 0.9 or
 * 0.19. It was defensible in the abstract — raw cover colours are saturated and
 * high-contrast, and the literal top colour is often a near-black or a blaring
 * red that competes with every cover in front of it — but it destroyed the
 * feature. Fahrenheit 451's `#ce2a1e` came out as `#eddfde`, a faintly pink
 * off-white. The Book of Koli's foliage green came out as `#e7edde`, a faintly
 * green off-white. Almost every cover collapsed to the same handful of pale
 * neutrals, and the row could not answer the only question that matters about
 * it: *where did this colour come from?* Ruthnie's verdict on seeing it was
 * that the colours did not seem to match her books, and she was right — they
 * did not.
 *
 * The rule now is proportional rather than absolute. A muted cover yields a
 * muted ground and a bold cover yields a bold one, so the ground still carries
 * the character of the book it came from. Lightness moves far enough that type
 * can sit on it, but the two tones stay well clear of each other rather than
 * both being pushed to the extremes.
 *
 * A ground still should not *match* a cover — nothing here is the sampled
 * colour unaltered, because a poster ground at full cover saturation fights the
 * artwork. But it has to be visibly the same colour family, or the row is a set
 * of arbitrary swatches wearing a label that claims otherwise.
 */
function asGround(source: Hsl, tone: 'tint' | 'shade'): Hsl {
  return tone === 'tint'
    ? {
        h: source.h,
        // Keeps most of the cover's own saturation instead of flattening it.
        // A 75% red now yields a ground that reads as pink-red rather than as
        // off-white, and a near-grey still yields a near-grey.
        s: Math.min(source.s * 0.7, 0.5),
        // High enough for dark type, low enough to still show its colour.
        l: 0.84,
      }
    : {
        h: source.h,
        s: Math.min(source.s * 0.85, 0.62),
        // Deep, but not the near-black the old 0.19 produced, which read as
        // "dark" rather than as any particular colour.
        l: 0.24,
      }
}

/**
 * Ink for a ground we sampled ourselves.
 *
 * `inkForBackground` returns white for anything that is not a builtin, because
 * an uploaded photograph is unknowable without sampling. A colour we computed
 * is entirely knowable, so it gets a real answer rather than the fallback.
 *
 * Fixed hex on both sides — this is poster ink, not chrome.
 */
const POSTER_INK_LIGHT = '#ffffff'
const POSTER_INK_DARK = '#1c1a17'

export function inkForColor(hex: string): string {
  return luminance(hex) > 0.42 ? POSTER_INK_DARK : POSTER_INK_LIGHT
}

/** Decode one object URL to a small bitmap and return its pixels. */
async function samplePixels(url: string): Promise<Uint8ClampedArray | undefined> {
  const image = new Image()
  image.src = url

  try {
    await image.decode()
  } catch {
    // A blob that failed to decode is not worth failing the whole palette over.
    return undefined
  }

  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_WIDTH
  canvas.height = SAMPLE_HEIGHT

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return undefined

  context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
  return context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data
}

interface Bucket {
  count: number
  r: number
  g: number
  b: number
}

/**
 * Build a coarse histogram across every cover, then take the most populous
 * buckets as the poster's source colours.
 *
 * Counted across all covers at once rather than per cover and merged: the
 * question is what colour the *month* is, and a hue that appears quietly on
 * five covers is more the month's colour than one that shouts on a single one.
 */
export async function extractPalette(coverUrls: readonly string[]): Promise<PaletteSwatch[]> {
  if (coverUrls.length === 0) return []

  const buckets = new Map<number, Bucket>()

  for (const url of coverUrls) {
    const pixels = await samplePixels(url)
    if (!pixels) continue

    for (let i = 0; i < pixels.length; i += 4) {
      // Skip anything meaningfully transparent — its colour is not on screen.
      if (pixels[i + 3] < 128) continue

      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]

      // Near-black, near-white and near-grey are most of a cover's pixels and
      // none of its character. Left in, they win every bucket and every poster
      // comes out the same grey — which is exactly what a swatch row labelled
      // "from your books" must not do.
      const { s, l } = toHsl(r, g, b)
      if (l < MIN_USEFUL_LUMA || l > MAX_USEFUL_LUMA) continue
      if (s < MIN_USEFUL_SATURATION) continue

      const key =
        ((r >> QUANTISE_BITS) << (QUANTISE_BITS * 2)) |
        ((g >> QUANTISE_BITS) << QUANTISE_BITS) |
        (b >> QUANTISE_BITS)

      const bucket = buckets.get(key)
      if (bucket) {
        bucket.count += 1
        bucket.r += r
        bucket.g += g
        bucket.b += b
      } else {
        buckets.set(key, { count: 1, r, g, b })
      }
    }
  }

  if (buckets.size === 0) return []

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count)

  /*
   * Walk the buckets by population and keep the ones that are a genuinely
   * different colour from everything kept so far.
   *
   * Taking the top three outright does not work. A histogram of book covers is
   * dominated by one hue in slightly different shades, so the top three come
   * back as three reds, each yields a pale and a deep ground, and the row shows
   * what is visibly the same swatch five times over. Distinctness has to be a
   * condition of selection, not something checked afterwards — by then both
   * grounds have already been derived from a duplicate.
   *
   * Averaging within the bucket recovers precision the quantising threw away,
   * so a swatch is the colour the pixels actually were rather than the corner
   * of the box they fell in.
   */
  const sources: Hsl[] = []
  for (const bucket of ranked) {
    if (sources.length >= SOURCE_COLOURS) break

    const candidate = toHsl(
      bucket.r / bucket.count,
      bucket.g / bucket.count,
      bucket.b / bucket.count,
    )

    const isDistinct = sources.every((kept) => {
      // Hue wraps, so the distance is the shorter way round the circle.
      const raw = Math.abs(kept.h - candidate.h)
      const hueGap = Math.min(raw, 1 - raw)

      // Rare now that pixels below MIN_USEFUL_SATURATION are dropped outright,
      // but not unreachable: a bucket's average can land lower than any pixel
      // that entered it. Below this, hue is noise — a barely-tinted cream can
      // report any hue at all — so two near-greys are told apart by how
      // saturated they are rather than by where they claim to sit.
      const bothNearGrey = kept.s < 0.2 && candidate.s < 0.2
      return bothNearGrey
        ? Math.abs(kept.s - candidate.s) >= MIN_SATURATION_SEPARATION
        : hueGap >= MIN_HUE_SEPARATION
    })

    if (isDistinct) sources.push(candidate)
  }

  /*
   * Each source colour yields both a pale and a deep ground.
   *
   * Interleaved rather than grouped — tint, shade, tint, shade — so the row
   * reads as a range at a glance instead of as two blocks the eye has to
   * compare across. Six swatches from three colours, which is the 4-6 the plan
   * asked for without needing a fourth hue that is usually the same as the
   * third.
   */
  const swatches: PaletteSwatch[] = []
  for (const source of sources) {
    for (const tone of ['tint', 'shade'] as const) {
      const value = hslToHex(asGround(source, tone))
      swatches.push({ value, ink: inkForColor(value), tone })
    }
  }

  // Backstop only. Selection above is what actually keeps the row varied —
  // an exact-hex match cannot catch two colours three points apart, which is
  // precisely how the duplicates got through the first time.
  const seen = new Set<string>()
  return swatches.filter((swatch) => {
    if (seen.has(swatch.value)) return false
    seen.add(swatch.value)
    return true
  })
}
