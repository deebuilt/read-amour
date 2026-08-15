import type { CoverSearchResult } from '../types/domain'

/**
 * Apple Books search, used only where Open Library falls short.
 *
 * Open Library is a library catalogue: print editions, real ISBNs, the edition
 * someone actually owns. It is the right primary source and stays first.
 *
 * What it is weak at is brand-new releases. A book published weeks ago often
 * has a metadata record contributed by a reader and no cover art at all —
 * `A Forsaken Prophecy` (July 2026) has two editions in Open Library, both with
 * `covers: None`. The catalogue knows the book and simply has no picture of it.
 *
 * Apple is a storefront, so a book on sale necessarily has artwork. That makes
 * it a good complement and a poor replacement: it carries ebook editions only,
 * so a print-only or self-published title may be missing here and present in
 * Open Library. Neither source dominates; the search merges both.
 *
 * Google Books was the obvious candidate and does not work. Its cover CDN
 * (`books.google.com/books/content`) sends no `Access-Control-Allow-Origin`, so
 * `fetch` cannot read those bytes into a blob and an unstorable cover cannot be
 * exported — the canvas would be tainted. The keyless API is also quota-limited
 * to zero from some networks. Apple sends `Access-Control-Allow-Origin: *` on
 * both the search endpoint and the image CDN, which is the whole reason this
 * file can exist.
 */

const SEARCH_URL = 'https://itunes.apple.com/search'

/**
 * Artwork is served at a size baked into the URL. Poster slots run from 458px
 * wide on a 2x2 grid down to 185px on a 5x4, so 600 is sharp everywhere at a
 * quarter the bytes of 1200.
 */
const ARTWORK_SIZE = 600

/**
 * Matched to Open Library's limit so neither source dominates the interleave in
 * `bookSearch.ts`. At 10 against Open Library's 20, a book sitting deep in
 * Apple's list could not surface at all — which is how a July release went
 * missing from a one-word search.
 */
const SEARCH_LIMIT = 20

interface AppleResult {
  trackName?: string
  artistName?: string
  artworkUrl100?: string
  releaseDate?: string
}

interface AppleResponse {
  results?: AppleResult[]
}

function isAppleResponse(value: unknown): value is AppleResponse {
  return typeof value === 'object' && value !== null
}

/**
 * Rewrite Apple's 100px thumbnail URL to a poster-sized one.
 *
 * The size is a path segment (`.../9781668076293.jpg/100x100bb.jpg`), so this
 * is a substitution rather than a query parameter.
 */
function artworkUrl(thumbnail: string, size: number = ARTWORK_SIZE): string {
  return thumbnail.replace(/\/\d+x\d+bb\.jpg$/, `/${size}x${size}bb.jpg`)
}

/**
 * Apple has no ISBN index — `lookup?isbn=` returns nothing and an ISBN typed as
 * a search term matches nothing either. Every query here is fuzzy text, which
 * is why callers resolving a known book must confirm the match rather than
 * trusting the first row. See `isConfidentMatch`.
 */
export async function searchAppleBooks(
  query: string,
  signal?: AbortSignal,
): Promise<CoverSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const url = new URL(SEARCH_URL)
  url.searchParams.set('term', trimmed)
  url.searchParams.set('entity', 'ebook')
  url.searchParams.set('limit', String(SEARCH_LIMIT))

  const response = await fetch(url, { signal })
  if (!response.ok) return []

  const data: unknown = await response.json()
  if (!isAppleResponse(data) || !Array.isArray(data.results)) return []

  return data.results
    .map((result): CoverSearchResult | undefined => {
      if (!result.trackName || !result.artworkUrl100) return undefined

      const url = artworkUrl(result.artworkUrl100)
      return {
        // Prefixed so a merged result list cannot collide with an Open Library
        // key, and stable across searches so React keys stay put.
        key: `apple-${url}`,
        title: result.trackName,
        author: result.artistName ?? 'Unknown',
        appleArtworkUrl: url,
        firstPublishYear: result.releaseDate
          ? Number(result.releaseDate.slice(0, 4))
          : undefined,
      }
    })
    .filter((result): result is CoverSearchResult => result !== undefined)
}

/** Loose comparison key: case, punctuation and articles all vary by source. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/^(a|an|the)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether an Apple row is safely the same book as one we already know.
 *
 * Because Apple can only be searched by text, a fallback lookup for a known
 * title gets back a *ranked guess*, not an identity. Attaching row one blindly
 * is how a poster ends up showing the wrong cover — worse than showing none,
 * because it looks correct and is wrong.
 *
 * Title must match exactly once normalised. Author must match too, but only
 * loosely: Open Library says "Stacey McEwan" where Goodreads says
 * "McEwan, Stacey", so a shared surname is enough. An author we do not know at
 * all falls back to the title alone, which is why the title test is strict.
 */
export function isConfidentMatch(
  candidate: CoverSearchResult,
  title: string,
  author?: string,
): boolean {
  if (normalise(candidate.title) !== normalise(title)) return false
  if (!author || author === 'Unknown') return true

  const candidateWords = new Set(normalise(candidate.author).split(' '))
  return normalise(author)
    .split(' ')
    .some((word) => word.length > 2 && candidateWords.has(word))
}

/**
 * Find cover artwork for a book Open Library has no picture of.
 *
 * Returns undefined rather than a best guess when nothing matches confidently.
 */
export async function findAppleCover(
  title: string,
  author?: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const query = author && author !== 'Unknown' ? `${title} ${author}` : title
  const results = await searchAppleBooks(query, signal)

  return results.find((result) => isConfidentMatch(result, title, author))?.appleArtworkUrl
}

/** Fetch artwork as a blob. Apple's CDN allows this; Google's does not. */
export async function fetchAppleCoverBlob(
  url: string,
  signal?: AbortSignal,
): Promise<Blob | undefined> {
  const response = await fetch(url, { signal })
  if (!response.ok) return undefined

  const blob = await response.blob()
  return blob.size > 0 ? blob : undefined
}

/**
 * Stable key for an Apple cover.
 *
 * Content-addressed on the artwork URL like Open Library's `cover-<id>`, so the
 * same cover shared by several posters is stored once. Kept under the `cover-`
 * prefix deliberately: the orphan sweep never touches those, and an Apple cover
 * is shared across posters for exactly the same reason an Open Library one is.
 */
export function appleCoverBlobKey(url: string): string {
  const id = url.match(/\/([a-f0-9-]+)\/[^/]+\/\d+x\d+bb\.jpg$/i)?.[1]
  return `cover-apple-${id ?? btoa(url).replace(/[^a-zA-Z0-9]/g, '').slice(-32)}`
}
