import {
  MIN_BOOKS_FOR_TOP_AUTHOR,
  bestMonth,
  formatStatsMonth,
  monthOf,
  topAuthor,
  yearOf,
} from './stats'
import {
  GRID_LAYOUTS,
  MAX_GRID_CAPACITY,
  gridCapacity,
  type Book,
  type GridConfig,
} from '../types/domain'

/**
 * Posters the app offers to make, built from the library it already holds.
 *
 * Every poster in the app starts blank, which asks the reader to arrive already
 * knowing what she wants to make. A suggestion inverts that: the intention is
 * formed and the books are chosen, and the only thing left is to say yes.
 *
 * ## Same architecture as the observations, for the same reasons
 *
 * `stats.ts` solved this shape once — an array of pure generators, each
 * returning `undefined` unless the evidence clears a named minimum. That is
 * copied here deliberately rather than reinvented, and the three rules it
 * learned the hard way carry over intact:
 *
 * **A generator returns nothing below its own minimum.** Five-star reads over
 * two books offers a 2x1 poster or does not appear at all. It never pads a 4x4
 * with fourteen empty rectangles — which is the exact complaint that put 1x1 and
 * 2x1 into `GRID_LAYOUTS`.
 *
 * **Dates are sliced, never parsed.** `monthOf` and `yearOf` are imported from
 * `stats.ts` rather than rewritten here. `new Date('2026-08-01')` reads as UTC
 * and renders local, which moves a book to July 31 everywhere west of
 * Greenwich. That bug has been paid for once already.
 *
 * **Every suggestion must be falsifiable from the library.** If a reader cannot
 * open the book list and see why the sentence is true, it is a horoscope.
 *
 * ## What the data can honestly carry
 *
 * A `Book` holds a date, a rating, and an author. There is no genre, no page
 * count, and no start date, so "your longest reads", "your fantasy year", and
 * anything about reading speed are not merely hard here — they are unbuildable
 * until the field exists. See `docs/SUGGESTED_POSTERS.md` for the full
 * accounting, and do not add one of them without adding the field first.
 */

/* Evidence minimums ------------------------------------------------------- */

/**
 * Two five-star books make a poster.
 *
 * Deliberately far below the stats thresholds, and the difference is not
 * sloppiness — it is a different kind of claim. `MIN_RATED_FOR_SHAPE` guards a
 * statement *about the reader* ("you rate generously"), which two data points
 * cannot support. This is a *selection of books she explicitly rated*, and two
 * five-star books is simply true.
 */
export const MIN_FOR_FIVE_STARS = 2

/**
 * Below four dated books, "your year" overclaims.
 *
 * A year-in-review is a ranking rather than a filter — it takes the best of
 * whatever the year held — so it needs enough of a year to be ranking anything.
 * Under four, the five-star suggestion says the same thing more honestly.
 */
export const MIN_FOR_YEAR_IN_REVIEW = 4

/** A month poster needs more than a single book to be worth suggesting. */
export const MIN_FOR_BEST_MONTH = 3

/**
 * Distinct months of reading before a "biggest month" is a comparison.
 *
 * Without this the suggestion fires on a library where every book shares one
 * date — that month is "biggest" only because it is the sole month, and calling
 * it out says nothing about the reader. `standoutMonth` in `stats.ts` guards the
 * same claim with the same reasoning; this is a lower bar because a poster of
 * that month's books is worth making either way, where the *observation* is only
 * worth printing when the month genuinely stands out.
 */
export const MIN_MONTHS_FOR_BEST_MONTH = 2

/** Suggestions offered at once. Past this, none of them get read. */
export const MAX_SUGGESTIONS = 4

/* The shape ---------------------------------------------------------------- */

export interface Suggestion {
  /**
   * Stable key, so a dismissal survives the library changing underneath it.
   *
   * Content-stable but never content-identical: `five-stars-2026`, not a hash
   * of the book ids. A reader who dismisses "five stars this year" and then
   * finishes another five-star book has said no to the idea, not to that exact
   * set of nine books — and an id derived from the contents would resurrect the
   * row on the next book, which reads as the dismissal not having worked.
   */
  id: string
  /** The poster's title, and the row's headline. */
  title: string
  /** The poster's subtitle. Carried onto the artwork, not just the row. */
  subtitle: string
  /** Why this exists, in one line. Must be checkable against the book list. */
  reason: string
  books: Book[]
  /** Smallest offered grid that holds them. */
  grid: GridConfig
  /**
   * The month the poster is filed under.
   *
   * `board.month` is an import key and the source of a default title, never a
   * claim about the poster's contents — see "Posters, not months" in
   * `CLAUDE.md`. Most suggestions use the current month and let the title do the
   * talking; a best-month poster is the one that genuinely belongs to a month.
   */
  month: string
}

export type SuggestionGenerator = (
  books: readonly Book[],
  now: Date,
  context: SuggestionContext,
) => Suggestion | undefined

/**
 * What a generator needs to know beyond the library itself.
 *
 * Only best month uses it today, and it is a parameter rather than a lookup
 * inside so this module stays pure — the whole surface is testable against a
 * fixed clock and a fixed set of months.
 */
export interface SuggestionContext {
  /** Months that already have a saved poster, so one is not suggested twice. */
  monthsWithPosters: ReadonlySet<string>
}

/* Selection helpers -------------------------------------------------------- */

/**
 * The smallest offered shape that holds this many books.
 *
 * The reader is choosing a poster, not solving a geometry problem, and
 * `GRID_LAYOUTS` makes the answer safe: every offered shape satisfies
 * rows <= columns and therefore fills the frame. See the geometry note in
 * `types/domain.ts` rather than re-deriving it here.
 *
 * `undefined` above `MAX_GRID_CAPACITY`, which callers handle by truncating and
 * *saying so* — never by silently dropping the tail.
 */
export function gridFor(count: number): GridConfig | undefined {
  return GRID_LAYOUTS.find((grid) => gridCapacity(grid) >= count)
}

/**
 * Books a suggestion may draw on.
 *
 * One place rather than a filter in each generator, so a book excluded here is
 * excluded everywhere. Today that is the malformed-author case; when
 * `Book.status` lands, unread books join it here and nowhere else.
 */
function eligible(books: readonly Book[]): Book[] {
  return books.filter((book) => book.title.trim().length > 0)
}

/** A real star rating, with Goodreads' `0`-means-unrated encoding honoured. */
function ratingOf(book: Book): number {
  const rating = book.rating
  if (rating === undefined || rating <= 0) return 0
  return Math.min(5, Math.max(1, Math.round(rating)))
}

/**
 * Most recent first, undated last.
 *
 * String comparison on ISO dates, which is correct without parsing — the same
 * reasoning that makes `monthOf` a slice.
 */
function byDateDescending(a: Book, b: Book): number {
  if (!a.dateRead && !b.dateRead) return a.title.localeCompare(b.title)
  if (!a.dateRead) return 1
  if (!b.dateRead) return -1
  return b.dateRead.localeCompare(a.dateRead)
}

/**
 * Rating first, then recency.
 *
 * The tie-break matches `bestMonth`'s reasoning: between two equally rated
 * books, the recent one is the one the reader remembers.
 */
function byRatingThenDate(a: Book, b: Book): number {
  const difference = ratingOf(b) - ratingOf(a)
  if (difference !== 0) return difference
  return byDateDescending(a, b)
}

/**
 * Cut a selection down to something a poster can hold, and report the cut.
 *
 * Above twenty books there is no offered shape, and that is a real case — a
 * heavy reader's five-star year runs past it. Taking the top N is right;
 * doing it quietly is not. `fillSlots` drops overflow without a word, which the
 * import panel already had to learn to announce before the tap.
 */
function capped(books: Book[]): { books: Book[]; dropped: number } {
  if (books.length <= MAX_GRID_CAPACITY) return { books, dropped: 0 }
  return {
    books: books.slice(0, MAX_GRID_CAPACITY),
    dropped: books.length - MAX_GRID_CAPACITY,
  }
}

/** `2026-08` for the month containing `now`. Never derived from a parsed date. */
function monthKeyOf(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/* The generators ----------------------------------------------------------- */

/**
 * Five-star reads, this year.
 *
 * The obvious one and the best one: books the reader picked out herself, with
 * no interpretation laid over the top. The app has known about these the whole
 * time and never once mentioned them.
 */
const fiveStarYear: SuggestionGenerator = (books, now) => {
  const year = now.getFullYear()
  const found = eligible(books)
    .filter(
      (book) => ratingOf(book) === 5 && book.dateRead && yearOf(book.dateRead) === year,
    )
    .sort(byDateDescending)

  if (found.length < MIN_FOR_FIVE_STARS) return undefined

  const { books: chosen, dropped } = capped(found)
  const grid = gridFor(chosen.length)
  if (!grid) return undefined

  return {
    id: `five-stars-${year}`,
    title: 'Five stars',
    subtitle: String(year),
    reason:
      dropped > 0
        ? `Your ${chosen.length} most recent five-star reads this year, of ${found.length}.`
        : `${plural(found.length, 'book')} you gave five stars this year.`,
    books: chosen,
    grid,
    month: monthKeyOf(now),
  }
}

/**
 * The year, ranked.
 *
 * Where five stars is a filter, this is a ranking — it fills the poster from
 * whatever the year held, best first, so it exists even for a reader who rates
 * nothing five. That also makes it the one suggestion that can overlap the
 * five-star poster, which is why it sits second: a reader with nine five-star
 * books sees those offered as themselves first.
 */
const yearInReview: SuggestionGenerator = (books, now) => {
  const year = now.getFullYear()
  const dated = eligible(books).filter(
    (book) => book.dateRead && yearOf(book.dateRead) === year,
  )

  if (dated.length < MIN_FOR_YEAR_IN_REVIEW) return undefined

  const { books: chosen, dropped } = capped([...dated].sort(byRatingThenDate))
  const grid = gridFor(chosen.length)
  if (!grid) return undefined

  return {
    id: `year-${year}`,
    title: String(year),
    subtitle: 'Reading',
    reason:
      dropped > 0
        ? `Your ${chosen.length} highest-rated of the ${dated.length} books you finished this year.`
        : `Everything you finished in ${year}, best first.`,
    books: chosen,
    grid,
    month: monthKeyOf(now),
  }
}

/**
 * Everything by the author read most.
 *
 * `topAuthor` and `MIN_BOOKS_FOR_TOP_AUTHOR` are reused rather than recomputed.
 * Three books by one author is the threshold the dashboard already defends, and
 * two surfaces disagreeing about who the reader's most-read author is would be
 * worse than either of them being wrong alone.
 *
 * `topAuthor` also excludes `'Unknown'`, which is the importer's fallback for a
 * missing author column rather than a person — an "Everything by Unknown"
 * poster is true about the data and absurd about the reader.
 */
const oneAuthor: SuggestionGenerator = (books, now) => {
  const author = topAuthor(eligible(books))
  if (!author || author.count < MIN_BOOKS_FOR_TOP_AUTHOR) return undefined

  const theirs = eligible(books)
    .filter((book) => book.author.trim() === author.author)
    .sort(byRatingThenDate)

  const { books: chosen, dropped } = capped(theirs)
  const grid = gridFor(chosen.length)
  if (!grid) return undefined

  return {
    id: `author-${author.author.toLowerCase().replace(/\s+/g, '-')}`,
    title: author.author,
    subtitle: 'Everything I have read',
    reason:
      dropped > 0
        ? `${chosen.length} of the ${theirs.length} books you have read by ${author.author}.`
        : `${plural(theirs.length, 'book')} by the author you have read most.`,
    books: chosen,
    grid,
    // Filed under the current month like the rest: the poster is about an
    // author, not about a month, and the title says so.
    month: monthKeyOf(now),
  }
}

/**
 * The month with the most reading in it — only if that poster does not exist.
 *
 * This one overlaps the app's own month posters, which is the whole reason for
 * the check. Suggesting a poster the reader already built is noise, and it is
 * the kind of noise that teaches someone to stop reading the list.
 */
const biggestMonth: SuggestionGenerator = (books, _now, context) => {
  const usable = eligible(books)
  const best = bestMonth(usable)
  if (!best || best.count < MIN_FOR_BEST_MONTH) return undefined
  if (context.monthsWithPosters.has(best.month)) return undefined

  // "Your biggest month" is a comparison, so there has to be something to
  // compare against. A library whose books all carry one date has a biggest
  // month by arithmetic and not by reading.
  const months = new Set(
    usable.filter((book) => book.dateRead).map((book) => monthOf(book.dateRead as string)),
  )
  if (months.size < MIN_MONTHS_FOR_BEST_MONTH) return undefined

  const theirs = usable
    .filter((book) => book.dateRead && monthOf(book.dateRead) === best.month)
    .sort(byRatingThenDate)

  const { books: chosen, dropped } = capped(theirs)
  const grid = gridFor(chosen.length)
  if (!grid) return undefined

  const label = formatStatsMonth(best.month)

  return {
    id: `month-${best.month}`,
    title: label.split(' ')[0],
    subtitle: label.split(' ')[1] ?? 'Reading',
    reason:
      dropped > 0
        ? `${chosen.length} of the ${theirs.length} books you finished in ${label} — your biggest month.`
        : `${plural(theirs.length, 'book')} in ${label}, your biggest month, and no poster for it yet.`,
    books: chosen,
    // A best-month poster is the one suggestion that genuinely belongs to its
    // month, so it is filed there rather than under today.
    grid,
    month: best.month,
  }
}

/**
 * Ordered by how good the poster is, not by how easy the query is. Only the
 * first `MAX_SUGGESTIONS` survive, so the ordering is the priority.
 */
const GENERATORS: readonly SuggestionGenerator[] = [
  fiveStarYear,
  biggestMonth,
  oneAuthor,
  yearInReview,
]

/**
 * Every suggestion the library supports, minus the ones already dismissed.
 *
 * `now` is a parameter for the reason `computeStats` takes one: the whole
 * surface becomes deterministic for a given library, and "books this year" is
 * testable without mocking the clock.
 */
export function suggestPosters(
  books: readonly Book[],
  now: Date,
  context: SuggestionContext,
  dismissed: ReadonlySet<string> = new Set(),
): Suggestion[] {
  const found: Suggestion[] = []

  for (const generate of GENERATORS) {
    const suggestion = generate(books, now, context)
    if (!suggestion || dismissed.has(suggestion.id)) continue
    found.push(suggestion)
    if (found.length >= MAX_SUGGESTIONS) break
  }

  return found
}
