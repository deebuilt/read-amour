import { searchAppleBooks } from './appleBooks'
import { searchLibrary } from './librarySearch'
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

/**
 * Comparable form of a title, author or query: lowercase, no punctuation, no
 * leading article. Open Library and Apple punctuate and capitalise
 * differently, and a reader types a third way again.
 */
function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/^(a|an|the)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Loose identity for de-duplication across two catalogues. */
function matchKey(result: CoverSearchResult): string {
  // Surname alone: "Stacey McEwan" and "McEwan, Stacey" are one author.
  const surname = normaliseText(result.author).split(' ').filter(Boolean).pop() ?? ''
  return `${normaliseText(result.title)}|${surname}`
}

/**
 * The complete words of a query, and any trailing fragment, kept apart.
 *
 * Neither catalogue does prefix matching. A half-typed word is matched as a
 * whole word, so it does not narrow the search — it *derails* it. Typing toward
 * "forsaken prophecy": "forsaken pro" matches "Pro-Christian" and "GameShark",
 * "forsaken prophe" matches nothing at all, and only the final "cy" snaps back
 * to the right book. The list empties out as the reader gets closer, which
 * reads as broken.
 *
 * The answer is not to ask the APIs harder. One keystroke earlier the correct
 * book was already on screen — "forsaken" returns it — and then the app threw
 * that away to ask a question no catalogue can answer.
 *
 * So the fragment is never sent. Whole words go to the APIs; the fragment
 * filters what comes back, locally, where a prefix test is exact and free.
 *
 * A trailing word is treated as a fragment only when the reader is plainly
 * still typing it — no trailing space, and at least one complete word before
 * it. "the sea" keeps "sea" as a real search term the moment a space follows.
 */
/** Words too common to narrow a catalogue search on their own. */
const STOP_WORDS = new Set(['and', 'the', 'for', 'her', 'his', 'its', 'our'])

interface ParsedQuery {
  /** Sent to the catalogues. Always at least one word. */
  search: string
  /** Filters the results locally. Empty when the query looks finished. */
  fragment: string
}

function parseQuery(raw: string): ParsedQuery {
  const endsOpen = !/\s$/.test(raw)
  const words = raw.trim().split(/\s+/).filter(Boolean)

  if (words.length < 2 || !endsOpen) {
    return { search: words.join(' '), fragment: '' }
  }

  const head = words.slice(0, -1)

  /*
   * Holding back the last word only helps if what remains can still find the
   * book. "the hobbit" reduced to a search for "the" returns whatever the
   * catalogue feels like — none of it Tolkien — and then the fragment filters
   * a set the book was never in. Articles and initials carry no search weight,
   * so if nothing substantial is left, send the query whole and let the APIs
   * match it as words.
   */
  const substantial = head.filter(
    (word) => normaliseText(word).length > 2 && !STOP_WORDS.has(normaliseText(word)),
  )
  if (substantial.length === 0) {
    return { search: words.join(' '), fragment: '' }
  }

  return {
    search: head.join(' '),
    fragment: normaliseText(words[words.length - 1]),
  }
}

/**
 * Whether a result could still be what the reader is typing.
 *
 * The fragment must begin a word in the title or the author — "prophe" matches
 * *A Forsaken Prophecy*, and "mce" matches Stacey McEwan. Matching mid-word
 * would let "roph" match, which is not how anyone types a title.
 */
function matchesFragment(result: CoverSearchResult, fragment: string): boolean {
  if (fragment.length === 0) return true

  const words = `${normaliseText(result.title)} ${normaliseText(result.author)}`.split(' ')
  return words.some((word) => word.startsWith(fragment))
}

export async function searchAllBooks(
  query: string,
  signal?: AbortSignal,
): Promise<CoverSearchResult[]> {
  const { search, fragment } = parseQuery(query)
  if (search.length === 0) return []

  /*
   * One source failing must not sink the search — half a list beats an error.
   * But an ABORT is not a failure, and swallowing it as an empty result is a
   * real bug: the caller debounces and cancels the previous request on every
   * keystroke, so a swallowed abort resolves as "this source found nothing" and
   * paints a partial list over the screen as though it were the answer. Same
   * query, different results depending on typing speed.
   *
   * Rethrowing lets the caller's own `signal.aborted` guard drop the stale
   * response, which is what it is already written to do.
   */
  const tolerate = async (
    search: Promise<CoverSearchResult[]>,
  ): Promise<CoverSearchResult[]> => {
    try {
      return await search
    } catch (cause) {
      if (signal?.aborted) throw cause
      return []
    }
  }

  /*
   * The reader's own books are searched alongside the catalogues, on the FULL
   * query rather than on `search` — a stored book is matched locally, so a
   * trailing fragment narrows it exactly instead of derailing it the way it
   * would derail a catalogue query.
   *
   * Reading IndexedDB cannot fail the way a fetch can, and it is not abortable,
   * so it needs no `tolerate` wrapper.
   */
  const [library, openLibrary, apple] = await Promise.all([
    searchLibrary(query),
    tolerate(searchBooks(search, signal)),
    tolerate(searchAppleBooks(search, signal)),
  ])

  /*
   * Fold every row into one list, keeping each source's own position.
   *
   * Position is the whole point. Both catalogues rank their results, and that
   * ranking is the only relevance signal either one gives us — there is no
   * score to compare across them.
   *
   */
  interface Entry {
    result: CoverSearchResult
    rank: number
    fromApple: boolean
  }

  const byKey = new Map<string, number>()
  const ranked: Entry[] = []

  const absorb = (results: readonly CoverSearchResult[], fromApple: boolean): void => {
    results.forEach((result, rank) => {
      const existing = byKey.get(matchKey(result))

      if (existing === undefined) {
        byKey.set(matchKey(result), ranked.length)
        ranked.push({ result, rank, fromApple })
        return
      }

      // Same book seen again. Keep Open Library's record — it has the ISBN —
      // but borrow Apple's artwork when Open Library has no picture of it. This
      // is the case that started all of this: the catalogue knows the book and
      // simply has no cover for it.
      const current = ranked[existing]
      if (
        current.result.coverId === undefined &&
        current.result.appleArtworkUrl === undefined &&
        result.appleArtworkUrl !== undefined
      ) {
        current.result = { ...current.result, appleArtworkUrl: result.appleArtworkUrl }
      }

      // A book both catalogues returned is likelier to be the one meant, so it
      // takes the better of its two positions.
      current.rank = Math.min(current.rank, rank)
    })
  }

  absorb(openLibrary, false)
  absorb(apple, true)

  /*
   * The reader's own copies go in front, and replace the catalogue row for the
   * same book.
   *
   * In front because a book already in the library is the strongest possible
   * match for what was typed: the reader has read it. Replacing rather than
   * appending because the alternative is the same title twice in one list, once
   * from storage and once from Open Library, which reads as a bug and makes the
   * reader choose between two rows that mean the same thing.
   *
   * A stored book with no cover still wins the slot. It carries the ISBN and
   * the reader's own rating and date, which is the record worth keeping — and a
   * cover can still be fetched for it later.
   */
  const fromLibrary: Entry[] = []
  library.forEach((result, rank) => {
    const existing = byKey.get(matchKey(result))
    if (existing !== undefined) {
      // Keep the catalogue's artwork if the stored copy has none of its own.
      const current = ranked[existing]
      const merged: CoverSearchResult = {
        ...result,
        coverId: result.coverId ?? current.result.coverId,
        appleArtworkUrl: result.appleArtworkUrl ?? current.result.appleArtworkUrl,
        isbn13: result.isbn13 ?? current.result.isbn13,
      }
      // Blank the catalogue row in place; the library row carries it now.
      ranked[existing] = { ...current, result: merged, rank: Number.MAX_SAFE_INTEGER }
      fromLibrary.push({ result: merged, rank, fromApple: false })
      return
    }
    fromLibrary.push({ result, rank, fromApple: false })
  })

  const withoutReplaced = ranked.filter((entry) => entry.rank !== Number.MAX_SAFE_INTEGER)
  ranked.length = 0
  ranked.push(...withoutReplaced)

  /*
   * Interleave by rank rather than concatenating.
   *
   * Appending Apple's list after Open Library's threw away Apple's ranking
   * entirely: its best hit landed behind Open Library's twentieth. Searching
   * "forsaken" put `A Forsaken Prophecy` — Apple's #10, and absent from Open
   * Library's top 20 — at position 28, which is found in principle and
   * invisible in practice.
   *
   * Sorting on rank alone would still lose, since a source's #1 must not sit
   * behind the other's #1. Rank leads, and a tie falls to the row that can
   * actually fill a slot.
   */
  const ordered = [...fromLibrary, ...ranked.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank

      const coverGap = Number(hasCover(b.result)) - Number(hasCover(a.result))
      if (coverGap !== 0) return coverGap

      // Open Library first at equal rank: it carries the ISBN and the print
      // edition, which is the better record when both describe the same book.
      return Number(a.fromApple) - Number(b.fromApple)
    })].map((entry) => entry.result)

  /*
   * Narrow by the half-typed word, locally.
   *
   * The results are already the right set — they came back for the complete
   * words. The fragment only decides which of them the reader is still heading
   * toward, and that is a prefix test we can do exactly.
   *
   * If it matches nothing, the fragment is shown as typed rather than as an
   * empty screen: a reader mid-word has not made a mistake, and blanking the
   * list is what made this feel broken in the first place.
   */
  if (fragment.length === 0) return ordered

  const narrowed = ordered.filter((result) => matchesFragment(result, fragment))
  return narrowed.length > 0 ? narrowed : ordered
}

export function hasCover(result: CoverSearchResult): boolean {
  return result.coverId !== undefined || result.appleArtworkUrl !== undefined
}
