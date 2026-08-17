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

- **Genre, page count, series** — not in the schema. Would need a third
  catalogue lookup per book and a migration; a separate project.
- **Reading pace / duration** — no start date exists. See above.
- **Goals** ("read 50 this year") — a different feature with its own state, not
  a statistic. Worth doing, later, on its own.
- **Anything requiring accounts.** All four panels are local. That is the
  point: this ships without infrastructure, and it is the honest test of
  whether people return weekly before any backend is paid for.
