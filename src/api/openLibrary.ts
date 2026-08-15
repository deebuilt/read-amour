import type { CoverSearchResult } from '../types/domain'

/**
 * Open Library client.
 *
 * Free, no API key, no signup. Two lookup paths:
 *
 *   ISBN     — exact. One book, the right edition, the right cover.
 *   Title    — fuzzy. Returns many editions; the user picks.
 *
 * Covers are always fetched as blobs rather than hotlinked. That is what makes
 * the PNG export work at all: drawing a cross-origin image onto a canvas taints
 * it and blocks the export. Fetching to a blob first sidesteps the taint
 * entirely, and has the happy side effect of making the app work offline.
 */

const SEARCH_URL = 'https://openlibrary.org/search.json'
const COVERS_URL = 'https://covers.openlibrary.org'

/** Open Library returns far more fields than we use; ask for only these. */
const SEARCH_FIELDS = ['key', 'title', 'author_name', 'cover_i', 'isbn', 'first_publish_year'].join(',')

const SEARCH_LIMIT = 20

interface SearchDoc {
  key?: string
  title?: string
  author_name?: string[]
  cover_i?: number
  isbn?: string[]
  first_publish_year?: number
}

interface SearchResponse {
  docs?: SearchDoc[]
}

function isSearchResponse(value: unknown): value is SearchResponse {
  return typeof value === 'object' && value !== null
}

/** Prefer a 13-digit ISBN; Open Library mixes both in one array. */
function pickIsbn13(isbns: readonly string[] | undefined): string | undefined {
  return isbns?.find((isbn) => isbn.length === 13)
}

function toResult(doc: SearchDoc, index: number): CoverSearchResult | undefined {
  if (!doc.title) return undefined
  return {
    key: doc.key ?? `doc-${index}`,
    title: doc.title,
    author: doc.author_name?.[0] ?? 'Unknown',
    coverId: doc.cover_i,
    isbn13: pickIsbn13(doc.isbn),
    firstPublishYear: doc.first_publish_year,
  }
}

/**
 * Search by free text. Results without a cover are dropped — this app exists
 * to place cover art, so a coverless result is noise.
 */
export async function searchBooks(query: string, signal?: AbortSignal): Promise<CoverSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const url = new URL(SEARCH_URL)
  url.searchParams.set('q', trimmed)
  url.searchParams.set('fields', SEARCH_FIELDS)
  url.searchParams.set('limit', String(SEARCH_LIMIT))

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Open Library search failed (${response.status})`)
  }

  const data: unknown = await response.json()
  if (!isSearchResponse(data) || !Array.isArray(data.docs)) return []

  return data.docs
    .map(toResult)
    .filter((result): result is CoverSearchResult => result !== undefined)
    .filter((result) => result.coverId !== undefined)
}

/**
 * Look up one book by ISBN. Exact, so it needs no user disambiguation —
 * this is the path CSV import uses.
 */
export async function searchByIsbn(isbn: string, signal?: AbortSignal): Promise<CoverSearchResult | undefined> {
  const clean = isbn.replace(/[^0-9Xx]/g, '')
  if (clean.length !== 10 && clean.length !== 13) return undefined

  const url = new URL(SEARCH_URL)
  url.searchParams.set('isbn', clean)
  url.searchParams.set('fields', SEARCH_FIELDS)
  url.searchParams.set('limit', '1')

  const response = await fetch(url, { signal })
  if (!response.ok) return undefined

  const data: unknown = await response.json()
  if (!isSearchResponse(data) || !Array.isArray(data.docs)) return undefined

  const doc = data.docs[0]
  return doc ? toResult(doc, 0) : undefined
}

export type CoverSize = 'S' | 'M' | 'L'

/** Display URL for a cover. Used for search thumbnails, never for export. */
export function coverUrl(coverId: number, size: CoverSize = 'M'): string {
  return `${COVERS_URL}/b/id/${coverId}-${size}.jpg`
}

export function coverUrlByIsbn(isbn: string, size: CoverSize = 'M'): string {
  return `${COVERS_URL}/b/isbn/${isbn}-${size}.jpg`
}

/**
 * Open Library serves a 1x1 transparent GIF when a cover is missing rather
 * than a 404, so a blob under this size is treated as absent.
 */
const PLACEHOLDER_MAX_BYTES = 1024

export async function fetchCoverBlob(coverId: number, signal?: AbortSignal): Promise<Blob | undefined> {
  const response = await fetch(coverUrl(coverId, 'L'), { signal })
  if (!response.ok) return undefined

  const blob = await response.blob()
  if (blob.size <= PLACEHOLDER_MAX_BYTES) return undefined
  return blob
}

/** Stable key so one cover is stored once no matter how many months use it. */
export function coverBlobKey(coverId: number): string {
  return `cover-${coverId}`
}
