import type { Book } from '../types/domain'

/**
 * Everything the dashboard knows, computed from `Book` records alone.
 *
 * Pure functions over `Book[]` — no React, no storage, no network. That is what
 * makes every number here checkable by reading the function rather than by
 * running the app.
 *
 * A `Book` carries a date, a rating, and an author. There is no page count, no
 * genre, and no start date, so a whole class of obvious reading stats is not
 * merely hard here but unbuildable: nothing records when a book was begun, which
 * rules out reading duration, fastest read, and books in progress. Do not add
 * them without adding the field first.
 *
 * ## The honesty rule
 *
 * Every generator below returns `undefined` — or omits its row — unless there is
 * enough evidence to say something true. The minimums are named constants rather
 * than inline numbers, so the threshold for each claim can be read and argued
 * with in one place.
 *
 * This matters more here than it looks. A reader opening a dashboard over eleven
 * books will be told something about themselves, and a dashboard that fabricates
 * a pattern from three books is worse than one that says nothing at all: it
 * spends the trust that makes the true observations worth reading. Silence is a
 * valid output of every function in this file.
 */

/* Evidence minimums ------------------------------------------------------- */

/** Below this many dated books, no chart renders at all. */
export const MIN_DATED_FOR_CHARTS = 5

/** A monthly chart of one month is a single bar, which is not a distribution. */
export const MIN_MONTHS_FOR_TIMELINE = 2

/** Five bars over four books shows shape that is not there. */
export const MIN_RATED_FOR_DISTRIBUTION = 5

/**
 * Two books by one author is a coincidence. Three is a habit — and calling
 * someone's favourite author from two books is exactly the fabrication the
 * honesty rule exists to stop.
 */
export const MIN_BOOKS_FOR_TOP_AUTHOR = 3

/** Reading a rating *shape* off a distribution needs more than the five bars do. */
export const MIN_RATED_FOR_SHAPE = 10

/** Each half-year span in a pace comparison needs this many dated books. */
export const MIN_PER_SPAN_FOR_PACE = 5

/** Author concentration is only meaningful against a library of some size. */
export const MIN_BOOKS_FOR_CONCENTRATION = 20

/** At or above this share of 4s and 5s, a reader rates generously. */
const GENEROUS_SHARE = 0.7

/** At or above this share of the library, one author dominates it. */
const CONCENTRATION_SHARE = 0.15

/** A best month has to clear this multiple of the median to be worth naming. */
const BEST_MONTH_MULTIPLE = 2

/** How many months the timeline covers. */
export const TIMELINE_MONTHS = 12

/** Observations shown at once. More than this and none of them get read. */
export const MAX_OBSERVATIONS = 3

/* Shared shapes ------------------------------------------------------------ */

export interface MonthCount {
  /** `YYYY-MM`. */
  month: string
  count: number
}

export interface RatingCount {
  /** 1 to 5. Zero is unrated and is never a bar — see `ratingBreakdown`. */
  stars: number
  count: number
}

export interface RatingBreakdown {
  counts: RatingCount[]
  /** Books with a real star rating. */
  ratedCount: number
  /**
   * Books carrying no rating.
   *
   * `rating: 0` is Goodreads' encoding for "unrated" and the app kept it, so a
   * zero must never be counted as a zero-star review. Getting this wrong turns
   * every book someone simply never rated into a savaging.
   */
  unratedCount: number
  /** Mean of the rated books only, or `undefined` below the minimum. */
  mean?: number
}

export interface AuthorCount {
  author: string
  count: number
}

/**
 * A row in the numbers list. Every row is optional by construction: a stat that
 * cannot be computed is absent from the array rather than present with a zero or
 * a placeholder, so the list never pads itself out.
 */
export interface StatLine {
  key: string
  label: string
  value: string
}

export interface Observation {
  key: string
  text: string
}

export interface ReadingStats {
  /** Every book in the library, dated or not. */
  totalBooks: number
  /** Books carrying a `dateRead`. Only these can appear on the timeline. */
  datedCount: number
  /**
   * Books with no date. Reported rather than dropped: a reader whose library is
   * half undated is looking at a chart of half their reading and deserves to be
   * told which half.
   */
  undatedCount: number
  timeline?: MonthCount[]
  ratings: RatingBreakdown
  lines: StatLine[]
  observations: Observation[]
}

/* Date handling ------------------------------------------------------------ */

/**
 * `dateRead` is stored as an ISO date string, and the month is the first seven
 * characters of it. Sliced rather than parsed on purpose: `new Date('2026-08-03')`
 * is parsed as UTC midnight and then read back in local time, which in any
 * timezone west of Greenwich moves the book to the previous day — and for a book
 * finished on the 1st, into the previous month. A poster would lose a book to
 * the month before it.
 */
function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/** Same reasoning as `monthOf`: read the year off the string, never off a Date. */
function yearOf(isoDate: string): number {
  return Number.parseInt(isoDate.slice(0, 4), 10)
}

/** A `YYYY-MM` key is comparable as a string, so ordering needs no parsing. */
function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** "2026-08" → "August 2026". */
export function formatStatsMonth(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** "2026-08" → "A". The timeline is twelve bars on a 375px screen. */
export function monthInitial(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'narrow' })
}

/* Timeline ----------------------------------------------------------------- */

/**
 * Books finished per month, ending with the month containing `now`.
 *
 * Empty months are zero-height bars, never gaps. A month with no reading is
 * data — collapsing it would compress the axis and make a three-month drought
 * look like three consecutive weeks.
 *
 * `undefined` below `MIN_MONTHS_FOR_TIMELINE` distinct months with any reading:
 * one bar and eleven zeroes is not a distribution, it is a single fact rendered
 * as a chart.
 */
export function booksPerMonth(
  books: readonly Book[],
  now: Date,
  months = TIMELINE_MONTHS,
): MonthCount[] | undefined {
  const counts = new Map<string, number>()
  books.forEach((book) => {
    if (!book.dateRead) return
    const key = monthOf(book.dateRead)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const window: MonthCount[] = []
  for (let back = months - 1; back >= 0; back -= 1) {
    // Built by walking the month index backwards through `Date`, which rolls
    // the year over for us — December of the previous year is month -1.
    const cursor = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const key = monthKey(cursor.getFullYear(), cursor.getMonth())
    window.push({ month: key, count: counts.get(key) ?? 0 })
  }

  const monthsWithReading = window.filter((entry) => entry.count > 0).length
  if (monthsWithReading < MIN_MONTHS_FOR_TIMELINE) return undefined

  return window
}

/* Ratings ------------------------------------------------------------------ */

/**
 * The five bars, plus what was left out of them.
 *
 * `rating: 0` and a missing rating are the same thing — unrated — and neither
 * is a bar. The mean is over rated books only, so a library of five 4-star books
 * and fifty unrated ones averages 4.0 rather than being dragged to 0.4.
 */
export function ratingBreakdown(books: readonly Book[]): RatingBreakdown {
  const counts = new Map<number, number>()
  let ratedCount = 0
  let unratedCount = 0
  let total = 0

  books.forEach((book) => {
    const rating = book.rating
    if (rating === undefined || rating <= 0) {
      unratedCount += 1
      return
    }
    // Guards against a hand-edited or restored record carrying something
    // outside 1-5, which would otherwise render as a sixth bar.
    const stars = Math.min(5, Math.max(1, Math.round(rating)))
    counts.set(stars, (counts.get(stars) ?? 0) + 1)
    ratedCount += 1
    total += stars
  })

  return {
    counts: [1, 2, 3, 4, 5].map((stars) => ({ stars, count: counts.get(stars) ?? 0 })),
    ratedCount,
    unratedCount,
    mean: ratedCount >= MIN_RATED_FOR_DISTRIBUTION ? total / ratedCount : undefined,
  }
}

/* Authors ------------------------------------------------------------------ */

/**
 * The author read most, at `MIN_BOOKS_FOR_TOP_AUTHOR` books or more.
 *
 * A tie is broken alphabetically so the answer is stable between renders rather
 * than depending on the order books came out of IndexedDB.
 */
export function topAuthor(books: readonly Book[]): AuthorCount | undefined {
  const counts = new Map<string, number>()
  books.forEach((book) => {
    const author = book.author.trim()
    // 'Unknown' is the importer's fallback for a missing author column, not a
    // person. Counting it would eventually name Unknown someone's most-read
    // author, which is true of the data and false about the reader.
    if (!author || author === 'Unknown') return
    counts.set(author, (counts.get(author) ?? 0) + 1)
  })

  let best: AuthorCount | undefined
  counts.forEach((count, author) => {
    if (!best || count > best.count || (count === best.count && author < best.author)) {
      best = { author, count }
    }
  })

  if (!best || best.count < MIN_BOOKS_FOR_TOP_AUTHOR) return undefined
  return best
}

/* The numbers -------------------------------------------------------------- */

/** The month with the most books, over the whole library rather than the window. */
export function bestMonth(books: readonly Book[]): MonthCount | undefined {
  const counts = new Map<string, number>()
  books.forEach((book) => {
    if (!book.dateRead) return
    const key = monthOf(book.dateRead)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  let best: MonthCount | undefined
  counts.forEach((count, month) => {
    // Ties go to the more recent month: it is the one the reader remembers.
    if (!best || count > best.count || (count === best.count && month > best.month)) {
      best = { month, count }
    }
  })
  return best
}

function booksInYear(books: readonly Book[], year: number): number {
  return books.filter((book) => book.dateRead && yearOf(book.dateRead) === year).length
}

/**
 * The numbers list, as rows that exist only when they can be filled.
 *
 * Each entry is pushed under its own condition rather than mapped from a fixed
 * template with blanks, so a thin library gets a short list instead of a long
 * one full of dashes.
 */
export function statLines(
  books: readonly Book[],
  ratings: RatingBreakdown,
  now: Date,
): StatLine[] {
  const lines: StatLine[] = []
  const year = now.getFullYear()

  const thisYear = booksInYear(books, year)
  if (thisYear > 0) {
    lines.push({
      key: 'this-year',
      label: `Finished in ${year}`,
      value: String(thisYear),
    })
  }

  if (books.length > 0) {
    lines.push({
      key: 'all-time',
      label: 'In your library',
      value: String(books.length),
    })
  }

  if (ratings.mean !== undefined) {
    lines.push({
      key: 'mean',
      label: 'Average rating',
      value: ratings.mean.toFixed(1),
    })
  }

  const best = bestMonth(books)
  if (best && best.count > 1) {
    lines.push({
      key: 'best-month',
      label: 'Your biggest month',
      value: `${formatStatsMonth(best.month)} · ${best.count}`,
    })
  }

  const author = topAuthor(books)
  if (author) {
    lines.push({
      key: 'top-author',
      label: 'Read most',
      value: `${author.author} · ${author.count}`,
    })
  }

  return lines
}

/* Observations ------------------------------------------------------------- */

/**
 * Plain-language readings of the data, each one falsifiable from the charts
 * above it. If a reader cannot look at the bars and see why a sentence is true,
 * it is a horoscope and it does not belong here.
 *
 * Each generator returns `undefined` unless its own named minimum is met. They
 * are ordered by how interesting they are rather than how easy they are to
 * compute, since only the first `MAX_OBSERVATIONS` survive.
 */
type ObservationGenerator = (books: readonly Book[], ratings: RatingBreakdown, now: Date) =>
  | Observation
  | undefined

/**
 * Rating shape — the one most readers have never seen about themselves.
 *
 * Most people cluster at 4 and 5 because they abandon books they dislike, and
 * the distribution is a record of what survived rather than of how they judge.
 */
const ratingShape: ObservationGenerator = (_books, ratings) => {
  if (ratings.ratedCount < MIN_RATED_FOR_SHAPE) return undefined

  const high = ratings.counts
    .filter((entry) => entry.stars >= 4)
    .reduce((sum, entry) => sum + entry.count, 0)
  const share = high / ratings.ratedCount

  if (share >= GENEROUS_SHARE) {
    return {
      key: 'rating-shape',
      text: `${Math.round(share * 100)}% of the books you rated got four or five stars. Either you pick well or you put down the ones you don't like.`,
    }
  }

  // The other tail, and it needs a different sentence: a low mean over ten-plus
  // books is a reader who finishes things she is unsure about.
  if (ratings.mean !== undefined && ratings.mean <= 3) {
    return {
      key: 'rating-shape',
      text: `Your average is ${ratings.mean.toFixed(1)}. You finish books you're not sure about, which most readers don't.`,
    }
  }

  return undefined
}

/**
 * This half-year against the same span last year.
 *
 * A half-year rather than a calendar year, so the comparison is available in
 * June instead of only in January — and both spans are the same length, so
 * January-to-date against a full previous year cannot report a collapse that is
 * only the calendar.
 */
const paceChange: ObservationGenerator = (books, _ratings, now) => {
  const spanStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const lastYearStart = new Date(spanStart.getFullYear() - 1, spanStart.getMonth(), 1)
  const lastYearEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1)

  const startKey = monthKey(spanStart.getFullYear(), spanStart.getMonth())
  const lastStartKey = monthKey(lastYearStart.getFullYear(), lastYearStart.getMonth())
  const lastEndKey = monthKey(lastYearEnd.getFullYear(), lastYearEnd.getMonth())

  let recent = 0
  let previous = 0
  books.forEach((book) => {
    if (!book.dateRead) return
    const key = monthOf(book.dateRead)
    if (key >= startKey) recent += 1
    else if (key >= lastStartKey && key < lastEndKey) previous += 1
  })

  if (recent < MIN_PER_SPAN_FOR_PACE || previous < MIN_PER_SPAN_FOR_PACE) return undefined
  // A margin, so a 13-to-12 swing is not reported as a change in habit.
  if (Math.abs(recent - previous) < 3) return undefined

  return recent > previous
    ? {
        key: 'pace',
        text: `You've read ${recent} books in the last six months, against ${previous} in the same stretch last year.`,
      }
    : {
        key: 'pace',
        text: `${recent} books in the last six months, down from ${previous} over the same stretch last year.`,
      }
}

/** A best month worth naming has to clear twice the median month. */
const standoutMonth: ObservationGenerator = (books) => {
  const dated = books.filter((book) => book.dateRead)
  if (dated.length < MIN_DATED_FOR_CHARTS) return undefined

  const counts = new Map<string, number>()
  dated.forEach((book) => {
    const key = monthOf(book.dateRead as string)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  if (counts.size < 3) return undefined

  const values = [...counts.values()].sort((a, b) => a - b)
  const median = values[Math.floor(values.length / 2)]
  const best = bestMonth(books)
  if (!best || median <= 0 || best.count < median * BEST_MONTH_MULTIPLE) return undefined

  return {
    key: 'standout-month',
    text: `${formatStatsMonth(best.month)} was your biggest month by some distance — ${best.count} books, against ${median} in a normal one.`,
  }
}

/** One author holding a real share of a library of some size. */
const authorConcentration: ObservationGenerator = (books) => {
  if (books.length < MIN_BOOKS_FOR_CONCENTRATION) return undefined
  const author = topAuthor(books)
  if (!author) return undefined

  const share = author.count / books.length
  if (share < CONCENTRATION_SHARE) return undefined

  return {
    key: 'author-concentration',
    text: `${author.author} is ${Math.round(share * 100)}% of your library. ${author.count} of ${books.length} books.`,
  }
}

const GENERATORS: readonly ObservationGenerator[] = [
  ratingShape,
  standoutMonth,
  paceChange,
  authorConcentration,
]

export function observations(
  books: readonly Book[],
  ratings: RatingBreakdown,
  now: Date,
): Observation[] {
  const found: Observation[] = []
  for (const generate of GENERATORS) {
    const result = generate(books, ratings, now)
    if (result) found.push(result)
    if (found.length >= MAX_OBSERVATIONS) break
  }
  return found
}

/* Undated books ------------------------------------------------------------ */

/**
 * Books with no finish date, newest-looking first.
 *
 * The dashboard reports how many of these there are, and that count is over the
 * whole library — but the book list only ever shows one poster, so before this
 * existed there was no screen that could show the books the footnote was talking
 * about. A reader was told "8 books aren't on this chart" and then had to open
 * posters one at a time looking for them.
 *
 * Sorted by title, since the thing that would normally order a reading list —
 * the date — is by definition absent here.
 */
export function undatedBooks(books: readonly Book[]): Book[] {
  return books
    .filter((book) => !book.dateRead)
    .sort((a, b) => a.title.localeCompare(b.title))
}

/* The whole dashboard ------------------------------------------------------ */

/**
 * `now` is a parameter rather than a `new Date()` inside, so every function here
 * is testable against a fixed clock and the whole dashboard is deterministic for
 * a given library.
 */
export function computeStats(books: readonly Book[], now: Date): ReadingStats {
  const datedCount = books.filter((book) => book.dateRead).length
  const ratings = ratingBreakdown(books)

  return {
    totalBooks: books.length,
    datedCount,
    undatedCount: books.length - datedCount,
    // The chart minimum is checked here rather than inside `booksPerMonth`, so
    // that function stays a plain grouping and this one owns the policy.
    timeline: datedCount >= MIN_DATED_FOR_CHARTS ? booksPerMonth(books, now) : undefined,
    ratings,
    lines: statLines(books, ratings, now),
    observations: observations(books, ratings, now),
  }
}
