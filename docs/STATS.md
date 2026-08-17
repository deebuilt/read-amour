# Stats — the plan

A reading dashboard built from what is already in IndexedDB. No backend, no
network, no new dependency on anything that costs money. Everything below is
computable from `Book` records the app already stores.

Planned 2026-08-17. Not yet built.

---

## What the data actually supports

This is the constraint that shapes the whole feature, so it comes first.

A `Book` carries exactly four fields worth counting:

| field | type | how reliable |
|---|---|---|
| `dateRead` | ISO date, **optional** | present on Goodreads imports that have it; absent on most search-added and manual books unless the reader fills it in |
| `rating` | 0–5, **optional** | `0` means unrated, matching Goodreads' own encoding — it is not a zero-star review |
| `author` | string | always present, `'Unknown'` as fallback |
| `source` | `goodreads | search | manual` | always present |

That is a **date, a rating, and an author**. There is no page count, no genre,
no start date, no finish time, no re-read record, and no shelf. Anything the
dashboard says has to come out of those three columns.

### But more is available, and we are throwing it away

Checked live against both APIs on 2026-08-17. Neither catalogue is withholding
anything — the app simply never asked, and stores only what it needs to place a
cover.

**Open Library's `fields` parameter defaults to a small set.** Ask explicitly
and the same endpoint returns more:

```
?fields=title,author_name,number_of_pages_median,first_publish_year,publisher,language,subject
```

- **`number_of_pages_median` is the clean win.** 480 for *The Trials of Koli*,
  310 for *The Hobbit*, 190 for *Fahrenheit 451* — reliable across everything
  tested, and it needs nothing but the query change. This unlocks **pages read**,
  which is the number readers actually quote about themselves and the only one
  here that is fairly comparable between two people, since "books" silently
  rewards short ones.
- `first_publish_year` is already fetched and already on `CoverSearchResult`,
  just never stored on `Book`. Free. Gives "the oldest book you read this year"
  and a publication-decade spread.
- `publisher` and `language` are there. Neither is a stat anyone wants.

**`subject` is not the genre field it looks like.** *The Hobbit* returns 93
subjects including "Arkenstone" and "invisibility"; *The Midnight Library*'s
first entry is `nyt:combined-print-and-e-book-fiction=2020-10-18`. It is
crowd-contributed tags mixed with library-catalogue debris, and the real genre
is in there somewhere, unranked. Usable **only** behind a curated whitelist
mapping known-good terms onto a small fixed genre set. That is a design task,
not a field read.

**Apple is the better genre source, for the reason it is the worse catalogue.**
It is a storefront, so `genres` is a merchandising shelf and therefore
consistent: `['Science Fiction', 'Sci-Fi & Fantasy', 'Literary Fiction']`.
Ebook editions only, so print-only and self-published titles have none — same
coverage gap already documented for its covers.

**Both return a crowd rating** (`ratings_average`, `averageUserRating`). Store
it if you like — "you rate books higher than most people" is a genuinely fun
observation — but it is **not** `Book.rating` and must never be merged into the
ratings distribution. Goodreads showing 4.25 on a book the reader gave 3 stars
is exactly the confusion to avoid.

### The cost is the backfill, not the fetch

**A deploy does not touch stored records.** Every book already in the library
was saved without these fields, so adding them helps new books only. Populating
existing ones needs a one-time pass — the same shape as `shrinkStoredUploads()`
and `repairCoverLinks()`, both of which this codebase has already written — plus
**one network request per book**, which is the part that makes it a session of
its own rather than a line of code.

So, in order of cost:

1. **Now, with the stats work:** add `number_of_pages_median` and
   `first_publish_year` to the Open Library field list and store them on `Book`
   as `pageCount` and `publishYear`. One query change, both optional, no
   migration. Every book added from today carries them, and the pages panel
   renders as soon as enough books have one.
2. **Its own session:** genre. Apple as the source, a whitelist for Open
   Library, and a decision about what the small fixed genre set even is.
3. **Its own session, with genre:** the backfill pass over existing books.

Do not block the dashboard on any of this. Books-over-time and the rating
distribution need nothing new.

Two consequences that kill otherwise-obvious features:

**There is no reading *duration*.** `dateRead` is when a book was finished.
Nothing records when it was started, so "how long you take to read a book",
"your fastest read", and "books in progress" are all unbuildable. Not hard —
unbuildable, from this schema.

**Date grain is the day, but density is monthly at best.** A heavy reader
finishes 40–60 books a year. Spread across 365 days that is one book every
6–9 days.

### On mirroring Last Time

Last Time's dashboard is good, and the temptation to port it is the thing to
resist. It records **events with timestamps** — every completion and every
deferral, at a moment in time — across ~20 recurring tasks that fire weekly or
more. That is hundreds of data points a year, dense enough that a day-grain
activity heat map is mostly full.

Read Amour has one optional date per book, roughly 40 a year. **The same heat
map here is a grid of ~330 empty cells and ~35 single-count ones.** It would
render as a nearly blank rectangle and read as an accusation — "you barely
read" — about someone with an excellent reading year. The visual honestly
represents task-completion density and dishonestly represents reading.

So: **no heat map, no day-of-week analysis, no streaks, no cadence drift.**
Those need event density this domain does not have. Weekday analysis is
particularly bogus here — Goodreads' `Date Read` is frequently the day the
reader *logged* the book rather than the day they finished it, so "you finish
books on Sundays" would mostly measure when someone sits down to update
Goodreads.

**What ports is the honesty rule, and it is the most valuable thing in that
file.** Every generator in `last-time/src/lib/analytics.ts` returns `null`
unless there is enough signal to say something true, with named minimum
constants (`MIN_COMPLETIONS_FOR_CADENCE`, `MIN_WARMUP_RUNS`) rather than
inline magic numbers. A dashboard that fabricates a pattern from three books is
worse than one that says nothing. Carry that discipline over exactly; leave the
metrics behind.

---

## What to build

Four panels, in the order they should be built. Each is independently
shippable — stop after any one and the page still makes sense.

### 1. Books over time — a bar chart, monthly

The headline. Books finished per month, last 12 months, one bar per month.

Monthly is the right grain because it is the app's own grain: `board.month` is
the natural key of a poster, so a bar is the poster it corresponds to. Tapping
a bar opening that month's poster is the obvious interaction, and it makes the
chart a navigation surface rather than an ornament.

- Empty months render as **zero-height bars, not gaps** — a month with no
  reading is data, and collapsing it distorts the spacing.
- Books with no `dateRead` are excluded from this chart and **counted in a
  footnote** ("12 books not dated"), never silently dropped. A reader whose
  library is half undated should be told that, not shown a chart that quietly
  represents half of it.
- Fewer than 2 months with any data → do not render the panel.

### 2. Ratings distribution — five bars

How many 1★, 2★, 3★, 4★, 5★. Horizontal bars, since the labels are stars and
read better on the left.

- **`rating: 0` is "unrated", not zero stars.** Excluded from the five bars and
  reported separately. Getting this wrong turns every unrated book into a
  savaging.
- Show the mean alongside, to one decimal — the number readers actually quote
  about themselves.
- Fewer than 5 rated books → do not render.

The interesting thing this reveals is rating *shape*: most readers cluster at
4–5 because they abandon books they dislike, and seeing that is a genuine
"huh" moment. Worth a one-line observation when the top two ratings hold ≥70%
of the distribution.

### 3. A few honest numbers

Not a "rule of three" card grid — see the visual rules in the global
`CLAUDE.md`. A short typographic list, one number per row, label beside it.

- Books this year
- Books all time
- Average rating
- Best month, named ("You read 9 books in March")
- Most-read author, but **only at 3+ books** — at two it is a coincidence, and
  claiming a favourite author from two books is the exact fabrication the
  honesty rule exists to stop.

Each row omits itself when its condition is not met, rather than showing a
placeholder or a zero.

### 4. Observations — the Last Time idea, ported carefully

Two or three plain-language readings of the data, in Ruthnie's voice (see
`VOICE.md` before writing a single one of these strings — they are the most
human-facing copy in the app).

Same architecture as `getInsights()`: an array of generator functions, each
returning `Insight | null`, each with a named minimum-evidence constant.
Render whatever survives, cap at three.

Candidates that the data genuinely supports:

- **Rating shape** — "You're a generous rater" (≥70% at 4–5, needs ≥10 rated)
  or "You're hard to impress" (median ≤3, needs ≥10 rated).
- **Pace change** — this half-year against the same span last year, needs both
  spans to hold ≥5 dated books. "You're reading more than last year."
- **Best month, in context** — only when it is ≥2× the median month.
- **Author concentration** — top author holds ≥15% of a library of ≥20 books.

Explicitly rejected, for the reasons above: anything about weekdays, streaks,
gaps between books, or reading speed.

**Every observation must be falsifiable from the data on screen.** If a reader
cannot look at the charts and see why the sentence is true, it is a horoscope.

---

## Where it goes

**Build the page before the "More" menu, not after.** The nav currently holds
five items and every one earns its place; a "More" containing one thing is a
demotion of Import for no gain. Once Stats exists there are two things to put
in it, and the menu is worth building.

Sequence:

1. Build Stats, reached temporarily from the About panel or the Posters panel.
2. Then add More, and move Import + About + Stats into it.

That ordering also means the nav change is one commit with a clear reason,
rather than a speculative container.

### Files

- `src/domain/stats.ts` — **pure functions over `Book[]`, no React, no
  storage.** Every function here is trivially testable and that is the point.
  Mirrors the shape of `last-time/src/lib/analytics.ts`.
- `src/hooks/useStats.ts` — reads all books once, memoises the computation.
- `src/components/stats/StatsPanel.tsx` — the panel body.
- `src/components/stats/` — chart components.

### Charts: build them, do not install them

Recharts or similar is ~100KB for two bar charts drawn from a fixed dataset.
This app already hand-builds every poster component and ships a service worker
sized for offline use.

Both charts here are **flat lists of labelled magnitudes**. A bar is a `div`
with a percentage width or height, in a CSS grid, with the tokens the rest of
the app already uses. No axes to compute, no scales, no interpolation, no
tooltips (the same bottom-of-viewport problem the nav has).

Read the `dataviz` skill before designing them, but the implementation is CSS.

### Design

Read `artifact-design` conventions and the visual rules in the global
`CLAUDE.md` before laying this out. Specifically:

- **No three-up card grid.** It is named in the global rules as the single
  clearest AI tell, and a stats page is where the temptation is strongest.
- Type carries it. A big number in the display face with a quiet label beside
  it is the whole design.
- The accent colour is already the app's; bars use it at varying opacity rather
  than introducing a second hue.
- Mobile-first at 375px, like everything else. Twelve monthly bars fit
  comfortably; twelve *labels* do not — abbreviate to initials, or label every
  third.

---

## The empty state is the hard part

Most readers open this with a thin library, and the failure mode is a page of
zeroes and empty axes that says "there is nothing here" when the truth is "keep
reading and this fills in."

- **Below 5 dated books:** no charts. One line naming what unlocks them.
- **Books present but undated:** this is the likely case for search-added
  libraries, and it needs its own message — the books exist, the dates do not.
  Say so, and link to where a date is set (`BookDetailsEditor`, already built
  and already on every book).
- **Never render an axis with no bars.**

The undated case is worth dwelling on: the app has only ever *needed*
`dateRead` for import grouping, so a reader who built posters by search has a
full library and an empty dashboard. Stats give `dateRead` a second reason to
exist, and the page should ask for it where it is missing rather than just
being blank.

---

## Deliberately not in scope

- **Genre and series.** Genre is reachable but not free — see the backfill
  section above. Series is in neither catalogue's search response.
- **Page count is *not* out of scope any more** — see above. It is one query
  parameter away for new books, and only the backfill of existing ones is
  deferred.
- **Reading pace / duration** — no start date exists. See above.
- **Goals** ("read 50 this year") — a different feature with its own state, not
  a statistic. Worth doing, later, on its own.
- **Anything requiring accounts.** All four panels are local. That is the
  point: this ships without infrastructure, and it is the honest test of
  whether people return weekly before any backend is paid for.

---

## Shipped 2026-08-17

All four panels, plus the More menu — which the plan above had sequenced as a
second step and which was built in the same pass. The reason that is not a
violation of the sequencing note: the objection was that a "More" holding one
item demotes Import for nothing. Building Stats first satisfies the condition
rather than skipping it, since the menu had three real destinations the moment it
existed. What the plan actually ruled out was a speculative container, and this
is not one.

### Files, as planned

- `src/domain/stats.ts` — pure, no React, no storage, `now` passed in as a
  parameter so the whole dashboard is deterministic for a given library.
- `src/hooks/useStats.ts` — reads every book once on mount, memoises.
- `src/components/stats/StatsPanel.tsx`, `MonthlyBars.tsx`, `RatingBars.tsx`.
- `src/components/chrome/MoreSheet.tsx` — the nav change.

### The honesty rule, as named constants

Ported exactly as the plan asked. Every threshold is a named export at the top of
`stats.ts` rather than an inline number: `MIN_DATED_FOR_CHARTS` (5),
`MIN_MONTHS_FOR_TIMELINE` (2), `MIN_RATED_FOR_DISTRIBUTION` (5),
`MIN_BOOKS_FOR_TOP_AUTHOR` (3), `MIN_RATED_FOR_SHAPE` (10),
`MIN_PER_SPAN_FOR_PACE` (5), `MIN_BOOKS_FOR_CONCENTRATION` (20). Each generator
returns `undefined` below its own minimum, and `statLines` pushes rows under
their conditions instead of mapping a fixed template with blanks — so a thin
library gets a short list, never a long one full of dashes.

### Four things the plan did not anticipate

**Dates must be sliced, never parsed.** `new Date('2026-08-01')` is read as UTC
midnight and then rendered in local time, which in every timezone west of
Greenwich moves the book to July 31 — and therefore into the previous month's
bar. `monthOf` and `yearOf` read the substring instead. This is the same class of
bug as the poster's `var()` colours: correct on the machine it was written on,
wrong for everyone else.

**'Unknown' had to be excluded from the author count.** It is the importer's
fallback for a missing author column, so a library with a few malformed CSV rows
would eventually name Unknown as someone's most-read author — true about the data
and false about the reader.

**Rating bars scale to the tallest bar, not to the library.** Against the library
total, a reader with 80% five-star books gets one full bar and four slivers, and
the chart becomes a worse version of the numbers beside it.

**The pace observation compares two equal six-month spans**, not year-to-date
against a full previous year. The obvious version reports a collapse every
January that is only the calendar. It also needs a margin of 3 books, so a 13-to-12
swing is not announced as a change in habit.

### Empty states

Three, not one, because they have three different answers: no books at all (the
library is empty), books but no dates (the likely case for a search-built
library — the message links to the book list, where `BookDetailsEditor` sets a
date), and too few dated books (name the threshold, draw no axis). No axis ever
renders without bars.

### The footnote had to become a door — added the same day

First real use found the gap immediately. Ruthnie counted 15 books in Goodreads
against 7 on the chart, worked out on her own that the difference was books she
had entered by hand without a finish date, and confirmed it by opening one and
setting a date. The diagnosis was right and the app made her do all of it.

The plan was satisfied here and the feature still was not: the footnote said
*how many* books had no date, which is what "counted in a footnote, never
silently dropped" asked for. But it could not say **which**, and there was
nowhere to go and find out — **the count is over the whole library while the book
list shows one poster**, so no screen in the app could display the set the
sentence was describing. The only route was opening posters one at a time.

Three changes:

- **`UndatedPanel`** — every undated book in the library, sorted by title, with a
  date picker on each row. Rows leave the list as they are dated, so the list is
  a queue that empties and its own length is the progress bar.
- **The footnote is the link to it.** "8 books aren't on this chart. They have no
  finish date yet. **Add them**". It is a mode of `StatsPanel` rather than a new
  drawer panel, because the reader is answering a question the chart asked and
  going somewhere else would lose the thread.
- **`BookList` marks undated rows** — "No date" in faint italic where the date
  would be. An undated row was previously indistinguishable from a dated one,
  which is what made the books unfindable in place. Not a warning colour and not
  an icon: nothing is wrong with the book, it just sits out of the charts.

**A real bug came out of this.** `useStats` gained a `reload`, and the first
version returned the per-call `cancelled` closure that `useEffect` had been
using. Two problems: the caller discarded it, and `reload` did not invalidate a
read already in flight — so dating several books quickly could let an older
`listBooks` settle last and put the stale numbers back. Replaced with a
generation counter in a ref, which is the shape this needs whenever a manual
refetch sits beside a mount effect.

### Still open, and unchanged by this work

`number_of_pages_median` and `first_publish_year` were **not** added to the Open
Library field list. The plan put them in step 1 "with the stats work", and they
are genuinely one query change — but they buy nothing until books carry them, and
every book already in the library predates them. Pages read stays the strongest
remaining panel and it wants the backfill session the plan already scoped, not a
field that only new books have. Genre and the backfill are untouched, as planned.
