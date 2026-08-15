import { searchAppleBooks } from './appleBooks'
import { searchBooks } from './openLibrary'
import type { CoverSearchResult } from '../types/domain'

/**
 * The app's one book search, over both catalogues.
 *
 * Neither source is sufficient alone:
 *
 *   Open Library  — a library catalogue. Print editions, real ISBNs, deep
 *                   backlist. Weak on new releases, where a reader-contributed
 *                   record often carries no cover art at all.
 *   Apple Books   — a storefront. Anything for sale necessarily has artwork, so
 *                   new releases are well covered. Ebook editions only, so
 *                   print-only and self-published titles can be missing.
 *
 * So they are merged rather than ranked, with Open Library first because for
 * most of a reading year its edition data is the better match for a physical
 * book. Apple fills in behind it: a cover for a title Open Library lists
 * without one, and rows for books it does not have at all.
 *
 * Both are queried in parallel. A failure in either is not fatal — half a
 * result list beats an error message.
 */

/** Loose identity for de-duplication across two catalogues. */
function matchKey(result: CoverSearchResult): string {
  const clean = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/^(a|an|the)\s+/, '')
      .replace(/\s+/g, ' ')
      .trim()

  // Surname alone: "Stacey McEwan" and "McEwan, Stacey" are one author.
  const surname = clean(result.author).split(' ').filter(Boolean).pop() ?? ''
  return `${clean(result.title)}|${surname}`
}

export async function searchAllBooks(
  query: string,
  signal?: AbortSignal,
): Promise<CoverSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const [openLibrary, apple] = await Promise.all([
    searchBooks(trimmed, signal).catch(() => []),
    searchAppleBooks(trimmed, signal).catch(() => []),
  ])

  const merged: CoverSearchResult[] = []
  const seen = new Map<string, number>()

  for (const result of openLibrary) {
    seen.set(matchKey(result), merged.length)
    merged.push(result)
  }

  for (const result of apple) {
    const key = matchKey(result)
    const existing = seen.get(key)

    if (existing === undefined) {
      seen.set(key, merged.length)
      merged.push(result)
      continue
    }

    // Same book from both. Keep Open Library's record — it has the ISBN — but
    // borrow Apple's artwork when Open Library has no picture of it. This is
    // the case that started all of this: the catalogue knows the book and
    // simply has no cover for it.
    const current = merged[existing]
    if (current.coverId === undefined && current.appleArtworkUrl === undefined) {
      merged[existing] = { ...current, appleArtworkUrl: result.appleArtworkUrl }
    }
  }

  // Covered books first — this app places cover art, so a result that can fill
  // a slot outranks one the reader would have to photograph themselves. The
  // coverless ones are kept rather than dropped: the title and author are the
  // tedious part to type, and a cover can be uploaded after.
  return merged.sort((a, b) => Number(hasCover(b)) - Number(hasCover(a)))
}

export function hasCover(result: CoverSearchResult): boolean {
  return result.coverId !== undefined || result.appleArtworkUrl !== undefined
}
