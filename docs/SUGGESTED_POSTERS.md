# Suggested posters — the plan

The app knows what you read. It has never once offered to make something of it.

Planned 2026-08-18. Not yet built.

---

## What this is, and why it is the strongest thing left to build

Every poster in the app today starts from a blank one. The reader arrives
holding an intention — a month, a shape, a set of books — and the app's job is
to not get in the way of it. That is a good tool and it asks a lot: you have to
know what you want to make before the app is any use.

A suggestion inverts that. It arrives with the intention already formed and the
books already chosen, and the reader's only job is to say yes. **The app knows
you gave nine books five stars this year and it has never mentioned it.**

This is also the feature neither of the platforms will build. StoryGraph and
Goodreads are trackers — their output is a shelf and a stats page. A 1080x1920
image built for Instagram is not a thing either of them wants to make, because
posters are not their product. Read Amour is an image-maker that happens to know
your books, and a suggestion engine only makes sense if the output is a poster.
See "Why not StoryGraph's API" at the foot of this doc.

---

## The data this can honestly stand on

Same three columns the dashboard runs on, and the same constraint —
`docs/STATS.md` has the full accounting and it is worth re-reading before
designing any generator here.

| field | notes |
|---|---|
| `dateRead` | optional; present on Goodreads imports, usually absent on search-added books |
| `rating` | 0-5, optional; **`0` means unrated**, never a zero-star review |
| `author` | always present, `'Unknown'` as the importer's fallback |
| `source` | `goodreads \| search \| manual` |

Nothing else exists yet. No page count, no genre, no start date. Every
suggestion below is built from a date, a rating, and an author, and the ones
that would need more are named in "Not buildable" rather than left to be
rediscovered.

**`'Unknown'` must be excluded from any author-based suggestion**, exactly as
`topAuthor` already excludes it. It is a malformed-CSV artifact, and an
"Everything by Unknown" poster is true about the data and absurd about the
reader.

---

## The architecture: generators, ported from the observations

`src/domain/stats.ts` already solved this problem once. Its observation
generators are an array of pure functions, each returning `undefined` unless the
evidence clears a **named minimum constant** — `MIN_RATED_FOR_SHAPE`,
`MIN_BOOKS_FOR_CONCENTRATION`, and so on. Render whatever survives, cap the
list.

Suggested posters are the same shape, and should be written the same way:

```ts
interface Suggestion {
  /** Stable key, so a dismissal can be remembered. */
  id: string
  /** The poster's title, and the row's headline. Written per generator. */
  title: string
  /** Why this exists, in one line. "9 books you gave five stars." */
  reason: string
  books: Book[]
  /** Smallest offered grid that holds them. */
  grid: GridConfig
}

type SuggestionGenerator = (books: readonly Book[], now: Date) => Suggestion | undefined
```

`now` is a parameter rather than read inside, for the reason `computeStats`
already does it: the whole surface becomes deterministic for a given library,
and "books this year" is testable without mocking the clock.

Three rules carried over from the stats work, each of which was learned the hard
way there:

**A generator returns nothing below its own minimum.** Five-star reads with two
books offers a 2x1 poster or does not appear. It never pads a 4x4 with three
empty rectangles — which is the exact complaint that put 1x1 and 2x1 into
`GRID_LAYOUTS` in the first place.

**Dates are sliced, never parsed.** `new Date('2026-08-01')` is read as UTC and
rendered local, which moves the book to July 31 everywhere west of Greenwich.
Reuse `monthOf` and `yearOf` from `stats.ts` rather than writing new date
handling. This bug has already been paid for once.

**Every suggestion must be falsifiable from the library.** If the reader cannot
open the book list and see why the sentence is true, it is a horoscope. Same
test the observations are held to.

### The grid is derived, never chosen

A suggestion picks the **smallest offered shape that holds its books**:

```ts
function gridFor(count: number): GridConfig | undefined {
  return GRID_LAYOUTS.find((g) => gridCapacity(g) >= count)
}
```

Twelve five-star books lands on 4x3. This is the whole "we build it for you"
promise, and `GRID_LAYOUTS` makes it safe — every offered shape satisfies
rows <= columns and therefore fills the frame. See the geometry note in
`types/domain.ts`; do not re-derive it here.

Above `MAX_GRID_CAPACITY` (20) there is no shape, and that is a real case: a
heavy reader's five-star year can run past twenty. **Take the top N rather than
dropping the suggestion** — sorted by rating then by date, most recent first —
and say so in the reason line ("Your 20 highest-rated this year"). Silently
truncating is the `fillSlots` overflow trap, which the import panel already had
to learn to announce.

---

## The suggestions worth generating

Ordered by how good the poster is, not by how easy the query is.

### 1. Five-star reads, this year

The obvious one and the best one. `rating === 5`, `dateRead` in the current
year, sorted most recent first.

Minimum: **2 books.** Lower than the stats thresholds on purpose — this is not a
claim about the reader's habits, it is a selection of books they explicitly
rated. Two five-star books is a true and postable fact; two data points is not
enough to say "you are a generous rater". Different claims, different floors.

Default title: `"Five stars"`, subtitle the year.

### 2. Year in review

Top-rated N from the current year, filling the largest shape the count supports.
Where five-star reads is a filter, this is a **ranking** — it always fills the
poster if the year holds enough books at all.

Minimum: **4 dated books this year.** Below that "the year" is overclaiming, and
the five-star suggestion covers it better.

Tie-break on rating goes to the more recent book, matching `bestMonth`'s
reasoning: it is the one the reader remembers.

### 3. Everything by one author

`topAuthor` already computes this and already carries
`MIN_BOOKS_FOR_TOP_AUTHOR` (3). Reuse both rather than recomputing —
three books by one author is the threshold the dashboard already defends, and
two suggestions disagreeing about who your most-read author is would be worse
than either.

Default title: the author's name. That is the poster.

### 4. Your best month

`bestMonth` exists and returns `{ month, count }`. The poster is that month's
books.

This one overlaps the app's own month posters, so it earns its place **only when
that poster does not already exist**. A suggestion to build a thing already
built is noise. Check the saved boards the way the import panel does — it
already reads them to mark months done, and that pattern is the one to copy.

### 5. Read next — the TBR poster

**The one to build carefully, because it needs a field that does not exist.**

There is no shelf, no want-to-read flag, and no status on `Book`. A book is in
the library or it is not. So a TBR poster cannot be *derived* — it has to be
*declared*, and that is a schema change rather than a generator.

The smallest honest version:

```ts
/**
 * Whether this is a book the reader has finished or one they intend to read.
 * Undefined reads as 'read', so every book already in a library keeps its
 * meaning — the app has only ever stored books that were read.
 */
status?: 'read' | 'toRead'
```

On `Book`, not on `Board`. This is unlike `favouriteBookId`, which lives on the
board because a book can be August's favourite and merely present in September.
A book's read-status is a fact about the reader's relationship with the book and
does not vary by poster.

Consequences to handle in the same change, none of them optional:

- **`status: 'toRead'` books must be excluded from every statistic.** A book you
  have not read is not part of your reading history, and letting one into
  `booksPerMonth` or the rating distribution corrupts the dashboard. Filter at
  the `useStats` boundary, once, rather than in each generator.
- **They are excluded from the other suggestion generators too**, for the same
  reason — a five-star TBR book is a rating of something unread.
- **The undated panel must skip them.** A to-read book has no finish date
  *correctly*, and listing it in a queue of books needing dates would make that
  queue impossible to empty.
- Where the flag is set: `BookDetailsEditor`, which is already on every book in
  every slot, and the manual-entry tab. A search result added to a TBR poster
  gets it implicitly.

**Ruthnie's "in progress" variant, and the honest answer to it.** The idea was a
poster mixing books finished this month with books currently being read. Half of
that is unbuildable and it is worth being exact about which half: there is no
start date on `Book`, so "currently reading" cannot be *inferred* — a book with
no `dateRead` is indistinguishable from one the reader simply never dated, which
is the single most common state in a search-built library.

With the `status` field above it becomes buildable, but only as a **third
declared state** (`'reading'`), not as a derivation. That is a real feature and
the poster is genuinely good — "finished / reading next" is a shape neither
platform makes an image of. The recommendation is to ship `'read' | 'toRead'`
first, see whether the declaration friction is acceptable at all, and add
`'reading'` only if it is. A status a reader will not maintain is worse than no
status, because the poster it builds is quietly wrong.

If `'reading'` ships, the mixed poster wants a **visual distinction between the
two groups** — the covers alone cannot say which is which, and a poster that
implies you finished sixteen books when you finished nine is the fabrication
this whole doc is trying to avoid. Simplest version that works: finished books
first in reading order, then a gap, then the to-read. Do not invent a badge
system for it.

### 6. Undated books

Every book with no `dateRead`. Not a stat — these are invisible on every chart
by definition — but perfectly postable, and it turns a data-quality problem into
something the reader wants anyway.

Low priority. `UndatedPanel` already serves the readers who care about the
dates.

---

## Not buildable, and why

Recorded so they are not rediscovered as ideas in six months. All of these are
schema limits, not difficulty.

- **Anything by genre or page count.** Neither is stored. Both are reachable —
  see the field-by-field accounting in `docs/STATS.md` — and both need the
  backfill session that doc already scoped. "Your longest reads" and "your
  fantasy year" are the two best suggestions in the app and neither can be
  written today.
- **Anything about reading duration or speed.** No start date. Unbuildable
  rather than hard.
- **Seasonal or mood groupings.** No genre, no mood, no tags. StoryGraph's CSV
  carries moods; ours does not store them, and see the note on that below.
- **"Books like these".** No recommendation data, and no backend to hold any.

---

## Where it lives

Ruthnie's instinct here was right, and the code agrees with it more than she
knew.

### The header, top left

The header is `Wordmark` centred, `ThemeToggle` right, and — on the left — a
44px `.headerSpacer` that exists **only to balance the toggle so the wordmark
sits optically centred**. There is a permanent, hand-sized, empty slot in the
app's most persistent chrome, currently holding nothing.

That is where this goes. Replace the spacer with the button; it is already the
right width, and the wordmark stays centred by the same arithmetic that centres
it today.

**Why not the More menu.** More is where things go that have *an end* — Import
is used once, About is read once, What's new is read per release. Suggestions
are the opposite: they change every time the library changes, and they are the
one surface in the app with something new to say on a normal Tuesday. Burying a
feature whose whole job is to be noticed behind a tap labelled "More" is a
contradiction. More stays as it is.

**Why not the bottom bar.** Five items, each earning its slot, and the doc on
that bar is emphatic about not adding a sixth for something speculative. It also
measured the label widths at 320px with no room to spare.

**The icon.** A sparkle, per Ruthnie — antd ships `ThunderboltOutlined` and
`BulbOutlined`, neither of which says this; `StarOutlined` is out on the same
collision rule that killed the gold-star favourite mark, since the poster
already draws stars for ratings. If nothing in antd's set reads as a sparkle,
hand-draw it as an inline SVG the way `CrownMark` is drawn, and for the same
reason: a Unicode sparkle is emoji-presentation on most platforms.

The mark should carry a **quiet count or dot when suggestions are waiting** and
nothing at all when none are. An empty state behind a permanently lit button
trains the reader to stop pressing it.

### The panel

A `PanelKind` of `'suggestions'`, in the bottom drawer like every other panel.
Rows, not cards — matching `MoreSheet` and `ExportSheet`, and pointedly not a
three-up grid of suggestion cards, which is the exact layout the global rules
name as the clearest AI tell.

Each row: the title, the reason line, and a strip of the actual cover
thumbnails. **The covers are the pitch** — a row saying "Five stars, 9 books" is
a sentence, and a row showing nine covers is the poster. The thumbnails are
already blobs in IndexedDB, so this costs nothing.

---

## The interaction, and the one thing that must not go wrong

**A suggestion is a preview. Tapping one must never write a poster into the
library.**

This is not caution, it is a bug this codebase has already shipped:
`handleUseMonth` used to overwrite whatever poster was open and it silently
destroyed a month of work. The whole import flow was reshaped around not doing
that. A suggestion engine that writes on tap is the same bug with a friendlier
face, and it would be worse — the reader did not even choose the books.

The flow:

1. Tap a suggestion → build a `Board` in memory via `createBoard` + `fillSlots`,
   and show it in the poster stage as a preview.
2. The preview is clearly not-yet-saved. **Keep** and **Discard**, plainly
   labelled.
3. Keep → save it as a new board and switch to it. Discard → return to the
   poster that was open, untouched.

Never replace the open board. A suggestion always becomes a **new** poster, for
the same reason import now creates one per month.

`createBoard(month, title)` takes the title already, so a suggestion's title
flows straight in. Which month a non-monthly poster belongs to is a real
question and the answer is already settled by the app: `board.month` is an
import key and a default, not a claim — see "Posters, not months" in
`CLAUDE.md`. Use the current month and let the title do the talking, which is
what a year-in-review poster does today.

### Dismissal

A suggestion the reader does not want should be dismissible, and stay dismissed.
`Suggestion.id` is the key; a small set of dismissed ids in the same store the
app already uses for preferences.

Make the id **content-stable but not content-identical**: `five-stars-2026`
rather than a hash of the book list. Dismissing "five stars this year" and then
finishing another five-star book should not resurrect the row — the reader said
no to the idea, not to that exact set of nine books.

### Covers are the cost

A suggestion assembled from Goodreads-imported books may have **no covers
resolved**, since covers are fetched per month by the import flow and a
cross-month selection cuts across that. The preview would build instantly and
render empty rectangles.

Handle it the way the import panel does: build the poster immediately, resolve
covers after, and show that it is happening. Do not block the preview on the
network. And note the known gap while you are in there — cover resolution still
cannot be cancelled, and a suggestion preview is a new way to start a fetch the
reader may immediately abandon.

---

## StoryGraph import

Worth doing, cheap, and it widens the door. `src/import/goodreads.ts` is ~90% of
it — the parse-to-`Book` shape, the month grouping, `ImportResult`, and the
whole downstream flow are format-agnostic already.

### What is confirmed

StoryGraph's export columns, verified 2026-08-18:

```
Title | Authors | Contributors | ISBN/UID | Format | Read Status | Date Added |
Last Date Read | Dates Read | Read Count | Moods | Pace |
Character- or Plot-Driven? | Strong Character Development? | Loveable Characters? |
Diverse Characters? | Flawed Characters? | Star Rating | Review |
Content Warnings | Content Warning Description | Tags | Owned?
```

Everything the app needs is there: **Title, Authors, ISBN/UID, Last Date Read,
Star Rating.**

### What must be verified against a real file first

The column *names* are confirmed; these details are not, and each one is a
silent-wrong-data bug if guessed:

- **Date format in `Last Date Read`.** Goodreads writes `YYYY/MM/DD` and
  `parseDate` rejects anything else — correctly, since a malformed date is worse
  than none. StoryGraph's format is unconfirmed. A wrong guess yields an import
  where every book is undated, which looks like the file failing.
- **`Dates Read` encoding.** Reported as possibly holding multiple reads in one
  cell. Use `Last Date Read` and ignore this column entirely; a re-read is not a
  case the app models.
- **`Star Rating` range.** StoryGraph supports **half stars** (0.0-5.0), where
  Goodreads is integers. `Book.rating` is used by `ratingBreakdown` to bucket
  into five bars, so a 3.5 needs a decision. **Round to nearest, ties up** — the
  distribution is five bars and inventing ten would change a shipped chart for
  every existing reader to accommodate a format most of them do not use. Record
  the rounding where the reader can see it if it ever matters.
- **`Read Status` values.** Presumably `read` / `currently-reading` /
  `to-read`, unconfirmed. This is the interesting one: **it maps directly onto
  the `status` field the TBR poster needs**, which means a StoryGraph import
  could populate to-read shelves for free where a Goodreads import cannot. Build
  the two features aware of each other.
- **Whether ISBNs carry Goodreads' `="..."` armour.** `cleanIsbn` strips
  non-ISBN characters regardless, so this is likely already handled — but the
  column is `ISBN/UID` and may hold a non-ISBN identifier, which would reach
  Open Library and match nothing.

### Verified against a real export, 2026-08-18

Every question above is now answered from an actual StoryGraph file (60 rows).
The findings are better than the plan assumed, and the risk it was guarding
against does not exist.

- **`Last Date Read` is `YYYY/MM/DD`** — byte-identical to Goodreads. The
  existing `parseDate` works unchanged, and the every-book-undated failure the
  plan feared cannot happen.
- **`Star Rating` carries no half stars in practice** — the file holds `5.0`,
  `4.0`, `3.0`, `1.0` and empty. `parseFloat` already reads those. Round to
  nearest anyway, since the format permits halves and this file simply has none.
- **`Read Status` is `read` / `currently-reading` / `to-read` /
  `did-not-finish`** — four values, not the three the plan guessed. It maps onto
  the `status` field the TBR poster wants, and `did-not-finish` is a fourth
  state to decide about rather than a surprise to discover mid-build.
- **ISBNs are bare** — no `="..."` armour, so the Goodreads trap is absent. But
  three rows hold **Amazon ASINs** (`B08VS8Z8ZR`) in `ISBN/UID`, which is the
  "may hold a non-ISBN identifier" case the plan flagged. `cleanIsbn` already
  rejects them on length, so this is handled rather than needing handling.
- **`Dates Read` does hold ranges** (`2023/06/30-2023/07/02`, three rows),
  confirming the instruction to ignore that column and read `Last Date Read`.

Two columns are empty throughout this export and should not be relied on:
`Moods` and everything from `Pace` to `Flawed Characters?`. Out of scope
regardless, per the note below.

### Shape of the change

Do **not** fork the importer. Detect the format from the header row and map
columns to a common intermediate, then share everything downstream:

- `src/import/goodreads.ts` and `src/import/storygraph.ts` each export a row
  mapper.
- A small `detectFormat(headers)` picks between them. `Read Status` and `Moods`
  are unique to StoryGraph; `Exclusive Shelf` and `Book Id` to Goodreads.
- `ImportResult`, month grouping, and the panel stay exactly as they are.

The UI change is smaller than it looks: the More row currently reads "Import
from Goodreads". It becomes "Import your library" with both named in the
description, and the panel says which format it detected. **Detect rather than
ask** — a reader who exported a file knows where it came from and should not
have to tell the app.

`Moods`, `Pace`, and `Tags` are tempting and out of scope. They are the only
genre-adjacent data any import carries, but storing a field only StoryGraph
users have produces a feature that works for some libraries and not others —
which is the coverage problem already documented for Apple's genre data. Revisit
with the genre session in `docs/STATS.md`, not here.

---

## Why not StoryGraph's API

Asked and answered on 2026-08-18, so it is not re-litigated.

**There is no public API.** The request has sat on StoryGraph's own roadmap
since **March 2021**, filed as "Long-term" — not planned, not in progress. The
founder, in 2021: *"There isn't an ETA... I'm a team of one app/web developer at
the moment and this isn't a priority."* Nothing has moved in the five years
since, across 280+ upvotes.

**The unofficial scrapers do not help us.** They exist — Python packages, a set
of Netlify functions — and all of them are *server-side*, because scraping
thestorygraph.com from a browser is blocked by CORS. This is the same wall that
killed Google Books: CORS is decided by the server being fetched from, and a
static site with no backend cannot get around it. Read Amour has no server, by
design.

So CSV is the only door, exactly as it is for Goodreads. That is not a
limitation to work around; it is the same door, and the importer is already
built.

---

## Build order

Each step is independently shippable.

1. **The generator module and the three that need no schema change** —
   five-star reads, year in review, everything by one author. Pure functions
   over `Book[]`, testable, no UI.
2. **The header button and the panel.** Preview, Keep, Discard. This is the
   whole feature working end to end.
3. **Best month**, once the "does this poster already exist" check is written.
4. **StoryGraph import.** Independent of all of the above; do it whenever, but
   verify the date format against a real export first.
5. **`Book.status`, then the TBR poster.** The schema change and its four
   exclusion consequences, then the poster. `'reading'` only after `'toRead'`
   has proven a reader will maintain it.

Dismissal can land with step 2 or after it. It is not needed until there are
enough suggestions for one to be unwanted.

---

## Progress — 2026-08-18

**Shipped: steps 1, 2 and 3.** The generator module, the header button and the
panel, and best month — the whole feature working end to end. Version 0.5.0.

Not built, and unchanged from the plan: **StoryGraph import** (step 4) and
**`Book.status` and the TBR poster** (step 5). Both are independently shippable
and neither is blocked by anything here.

### What was built

- `src/domain/suggestions.ts` — the four generators, pure over `Book[]`.
- `src/hooks/useSuggestions.ts` — reads the whole library, computes, dismisses.
- `src/storage/dismissedSuggestions.ts` — localStorage, alongside the theme and
  last-seen-version rather than in the library database. A dismissal is a UI
  preference, and putting it in IndexedDB would carry it into the backup file
  and across devices, which is not what saying "no thanks" to a row means.
- `src/components/controls/SuggestionsPanel.tsx` — rows with a cover strip.
- `src/components/controls/PreviewBar.tsx` — Keep and Discard.
- `src/components/chrome/SuggestButton.tsx` — the sparkle, drawn as inline SVG.

### Corrections to the plan

**`monthOf` and `yearOf` were not exported.** The plan says to reuse them from
`stats.ts` rather than writing new date handling, which is right — but both were
module-private, so following the instruction literally was impossible and the
tempting move was to copy them. They are exported now. Copying would have put a
second implementation of the UTC-slicing rule in the codebase, which is how that
bug comes back.

**`useCoverUrls` had to widen to the *displayed* board.** The plan does not
mention it. The hook took the board from `useBoard` — the saved one — so a
preview built in memory would have rendered with no covers at all. It now takes
whichever board is on screen, which is the honest statement of its job. `App`
holds `displayed = preview ?? board` and every render, export and label reads
that rather than the saved board.

**Export had to follow.** `posterRef` renders `displayed`, but `runExport` read
`board` for the filename and the video. Exporting a preview would have named the
file after the poster hiding underneath it and animated that poster's slot
count. Four call sites, all switched.

**A preview must be dropped when the reader asks for a different poster.**
Not in the plan and a real bug while it lasted: `displayed` prefers the preview,
so switching posters behind one left the suggestion on the stage while the board
underneath silently changed. The switch read as having failed, and the reader
could then export the preview believing it was what they had chosen.
`handleSwitchPoster`, `handleStartPoster` and `handleUseMonth` all discard first.

**Slot editing is ignored while previewing.** Every slot mutation goes through
`updateBoard`, which writes. Tapping a slot on a preview would have either saved
it silently or applied the edit to the poster underneath.

**Best month needed a second minimum the plan did not have.**
`MIN_MONTHS_FOR_BEST_MONTH` (2). With only the book-count minimum, a library
whose books all carry one date produced "your biggest month" — true by
arithmetic, meaningless as a claim, since there was no other month to be bigger
than. Caught by running the generators over made-up libraries rather than by
reading them. `standoutMonth` in `stats.ts` guards the same claim with
`BEST_MONTH_MULTIPLE`; the bar here is lower on purpose, because a poster of
that month's books is worth making even when the month is not remarkable enough
to *print a sentence about*.

### Decisions taken while building

**Covers resolve after the preview is on screen, and the books are saved even if
the poster is not.** The plan says not to block the preview on the network,
which is followed. The part it leaves open is what happens to a cover fetched
for a poster that gets discarded — and the answer is that it stays. A resolved
cover is a fact about the book, not about this preview; it belongs to the
library either way, and throwing it out would make Discard quietly expensive.
Only books with no `coverBlobKey` are fetched, so a library that has been
through an import makes no requests at all.

**Keep dismisses the suggestion it came from.** Otherwise the app carries on
offering a poster that now exists — the same noise the best-month "does this
poster already exist" check is there to prevent.

### Still open

- **Cover resolution in a preview cannot be cancelled**, the same known gap the
  import flow has. Discarding a preview mid-fetch leaves the queue running. It
  is wasted network rather than misdirected writes — the books are saved to the
  library regardless — but it is a new way to start a fetch and abandon it.
- **The panel shows covers from `coverUrls`, which is keyed on the displayed
  board.** A suggestion whose books are not on the open poster shows blank
  plates in its strip until it is previewed. Correct, and it holds the row's
  rhythm, but the strip is at its least persuasive exactly where the plan says
  the covers are the pitch. Worth revisiting with a small dedicated read.

---

## The import bleed — found 2026-08-18, not yet fixed

Ruthnie, on seeing a suggestion offer a poster for **June 2023**, a month she
never selected during an import:

> "It would really confuse someone if they say, hey, I didn't even pull in that
> month. Why is it showing me that month?"

She is right, and the suggestion engine is not where it goes wrong.

### What actually happens

There is **one `books` store**, and everything writes to it. A book searched for
and placed on a poster, a book typed in by hand, and all four hundred rows of a
CSV dropped once are the same kind of record in the same place.

`ImportPanel.handleFile` calls `saveBooks(parsed.books)` the instant the file
parses — before the month list renders, before a single month is chosen. From
that moment those rows are indistinguishable from books the reader picked.
`listBooks()` returns them, `computeStats` counts them, and
`suggestPosters` builds posters out of them.

`Book.source` already records `'goodreads' | 'search' | 'manual'`, so the app
*knows* where a book came from — but nothing reads that field to decide whether
a book counts. It is decoration.

**So the defect is that the app cannot tell a parsed row from a chosen book.**
The month list implies the reader is selecting what comes in; storage already
took everything. The UI promises selection and the write already happened. "I
didn't pull in that month" is exactly what the interface taught her to think.

### Three designs, and why the third won

**Commit — one and done.** Say plainly that importing takes the whole file, and
let Stats count everything. Consistent, but it makes the import irreversible by
design and throws away the reader's intent entirely.

**Staging.** A second store for pending rows. Rejected: it invents hidden state
with lifetime rules, a second invisible library, and promotion logic — and the
maintenance of it lands back on the reader in a subtler form. Ruthnie's standing
rule is that this must not fall on the user.

**Keep the data, mark it, and use it.** Ruthnie's, and the best of the three:

> "If we're storing the CSV anyway, let's let the user know that. Importing
> stores it, but it doesn't count it... But if the user wants to go back and
> select books again from their history, just say, hey, we already have some
> here. Do you wanna link these? Why don't we expand it and use what we already
> are storing?"

This turns the import from a liability into a resource. The rows stay, they stop
counting, and they become something the app can *offer* — a reader searching for
a book she imported two years ago should be told the app already has it, with
its ISBN, offline, rather than sent to Open Library.

### The field

One boolean on `Book`. **No status enum** — the state is binary, and a second
value would invent a distinction that does not exist.

```ts
/**
 * Whether this book arrived in a CSV and was never placed on a poster.
 *
 * Set on the file drop, cleared the moment the book lands on a poster. Books
 * added by search or by hand never carry it.
 */
imported?: boolean
```

**Settled 2026-08-18, and the reasoning matters because it was argued the wrong
way first.** The proposal was to call it `chosen`, on the theory that a reader
might import a CSV *and then* place those books, making `imported` unable to
answer "is this sitting unused."

Ruthnie corrected that, and she is right: **selecting a month always places it.**
`handleUseMonth` creates the board and fills it in one call — there is no path
that imports a month without making its poster. So "imported" and "never placed"
describe exactly the same set of books, and the extra name bought nothing.

The rows that need marking enter one step earlier than the argument assumed.
`saveBooks(parsed.books)` runs on the **file drop**, before the month list
renders — so every month in the file is written, and only the months tapped
become posters. The rest are residue. That is the whole bug.

- CSV drop → every parsed book written with `imported: true`.
- Placed on a poster, by any path → the flag is cleared.
- Stats and suggestions → books without the flag.
- Cleanup → `imported === true` is the whole query.

**The backfill is the part that must be right, and it runs in the safe
direction.** Every book already in storage predates the field, so the migration
decides what the existing library means. It must mark `imported: true` only for
books that are **on no poster at all** — walk the boards, collect every book id
in use, and flag the rest. Getting this backwards, or defaulting the field to
`true` for everything, means the first cleanup deletes books that are on
posters. Runs at startup beside `repairCoverLinks()`; a no-op once done.

A book on no poster that came from search or manual entry is a real edge: it was
deliberately added and then removed from every poster. The migration should key
on `source === 'goodreads'` as well, so only CSV rows are ever flagged.

### What this unlocks, in order

1. **Stats and suggestions stop counting rows nobody adopted.** This is the
   reported bug, and it also explains the observation that most books on
   "Everything you finished in 2026" have no poster — that suggestion ranks the
   whole library, unadopted rows included. Verify rather than assume.
2. **"Clear books I never used."** Impossible today at any level: the store
   cannot separate them, so even picking through IndexedDB by hand means judging
   records by eye. With `imported` it is a query and a button, and it belongs in
   About beside the backup controls.
3. **Search checks the reader's own history first.** The reuse Ruthnie asked
   for: a title already in the library is offered from storage — instantly,
   offline, with its ISBN — instead of being fetched. This is the payoff that
   justifies keeping the rows rather than refusing to store them.

### The import drawer surfaces what is already stored

The flag is not only bookkeeping for a cleanup button. It is the **index of the
library that has not been placed yet**, and that makes the import drawer into
two doors onto one list.

**The problem it solves, which is worse than it looks.** `ImportResult` lives in
`ImportPanel`'s React state. Drop a CSV, get the month list, close the drawer —
**the list is gone.** The books are still in IndexedDB, every one of them, but
the only way back to that month list is to find the file and drop it again. The
app makes the reader re-import a file whose contents it already holds.

Nothing is lost from *storage*, and that is worth stating plainly because it
reads like data loss and is not. `parseGoodreadsCsv` puts every read-shelf row
into `books`, and `saveBooks(parsed.books)` saves all of them. What dies with the
drawer is the **grouping**, not the books — and `dateRead` is on every record, so
the grouping can be rebuilt from storage exactly as it was built from the file.

So the drawer gets a second entry point:

- **Drop a CSV** — parses, writes rows as `imported: true`, shows the months.
- **Already in your library** — the same month list, grouped from stored books
  where `imported === true`, with the same **Use** / **Again** buttons and the
  same "Make all N posters".

Both hand the panel an identical `Map<string, Book[]>`. The panel does not need
to know which door it came through, which is why this is cheap: the grouping,
the row UI, and `handleUseMonth` all already exist. The new part is one query.

**This is what makes the flag earn its place.** Importing stops meaning "drop a
file" and starts meaning **"put these on a poster"** — which is what the month
list always implied and never did. The CSV drop becomes what it honestly is:
loading a reading history into the app.

**The cleanup button belongs here, not in About.** The list and the clear action
are the same feature seen twice — one adopts what is stored, the other discards
the rest. Put the clear at the foot of that list, where the reader can see what
would go.

**Undated books stay out of it, and already have a home.** A row with no
`dateRead` has no month to file under, so it does not appear in this list — the
same as today. It is not stranded: `UndatedPanel`, reached from Stats, lists
every undated book and takes a date, at which point the book files itself under a
month on its own. No new process needed.

**Stats says nothing about what it is leaving out.** Ruthnie, asked directly:
no callout, no "340 books in your library are not on a poster yet." Unplaced
books simply do not count. The dashboard reports `undatedCount` because a missing
date is a thing the reader can fix on that screen; an unplaced book is not a data
problem and does not want a footnote.

### Shipped 2026-08-18 — the flag, the second door, and the cleanup

Version 0.6.0. The whole of this section is built, and the StoryGraph questions
below were answered against a real export in the same session.

**What was built**

- `Book.imported` — set on the file drop, cleared on placement, never re-set.
- `src/domain/library.ts` — `isAdopted()`, the single predicate `useStats` and
  `useSuggestions` both filter on, so the dashboard and the suggestion engine
  cannot drift about which books are yours.
- `backfillImportedFlag()` in `storage/db.ts`, awaited at startup in `useBoard`
  beside `repairCoverLinks()`.
- `markBooksPlaced()`, `listUnplacedBooks()`, `deleteBooks()`.
- `groupByMonth()`, exported out of `import/goodreads.ts` so both doors of the
  import drawer group identically.
- `ImportPanel` — the stored-library door, the copy explaining what storing
  means, and the cleanup at the foot of the list.

**The merge rule was wrong twice, and both would have shipped silently.**
The plan says the flag is cleared on placement and never re-set, which is right
and is not the whole rule — `saveBooks` merges field by field, so the *merge*
had to be decided too. It was first written as
`book.imported === false ? false : book.imported && existing.imported`, which
fails two real cases:

- A fresh CSV row landing on a book stored **before the field existed** —
  `true && undefined` is `undefined`, so re-dropping a file over an existing
  library left every row unflagged and counting. That is the reported bug
  surviving the fix meant to remove it.
- A write that sets no flag at all landing on an **already-cleared** book —
  `undefined && false` is `undefined`, which erases a clearing that had already
  happened. The preview cover-save does exactly this write.

The rule that holds is **`false` on either side wins, otherwise the incoming
value fills in**: `(a === false || b === false) ? false : (a ?? b)`. Verified
against the eight real merge cases rather than by reading it — neither failure
is visible in the code, and both are obvious in a table.

**The backfill was verified for the disaster case specifically.** Run over a
library mixing placed and unplaced Goodreads rows with searched and hand-added
books, the cleanup's delete list contains nothing that sits on a poster, and
`source !== 'goodreads'` books are never flagged at all.

**Clearing the flag had to move into `ImportPanel`.** The plan implies App
clears it on placement, and for three of the four paths it does. The month
import is the exception: `onUseMonth` is typed `=> void` and App fires it as
`void handleUseMonth(...)`, so the panel cannot await a write made inside it —
refreshing the list straight after would re-read storage before the flag was
cleared and show the month it had just used as still unplaced. The panel has the
books in hand already, so it marks them itself and then announces.

**The month list now prefers a fresh parse and falls back to storage.** Dropping
a file shows that file's months; otherwise the drawer opens on what is already
stored. Both are the same `Map<string, Book[]>` through the same rows, which is
what made this cheap.

**The migration had to become awaitable, and the bug looked like something
else.** With `backfillImportedFlag()` awaited inside `useBoard`'s load, the
suggestion list still offered a poster for a month that had never been placed —
which read as a stale suggestion left over from a previous session. It was a
startup race. `useSuggestions` and `useStats` read the library on their own
mounts, beside `useBoard` rather than after it, and React gives no ordering
between sibling effects: the read landed before the migration had written a
single flag, so every unplaced CSV row still looked adopted.

`ensureImportedFlagBackfilled()` memoises the **promise**, not a boolean, and
every hook that reads books awaits it. A second caller arriving mid-migration
waits for the same run instead of starting its own or reading past one in
flight. Stats hid the same race behind timing — that panel is opened long after
startup, so its read won in practice — which is exactly the kind of bug that
comes back as "it only happens sometimes."

**Not built, deliberately:** search checking the reader's own history first
(item 3 of "what this unlocks"). It is a genuinely good payoff and it is a
change to the search path rather than to the import flag, so it wants its own
session against `api/bookSearch.ts`.

### The open edge

**What happens when a book is removed from every poster.** The flag is cleared
on placement and never re-set, so a book taken off every poster stays unflagged
and survives cleanup. That is the safe direction and probably correct — it was
deliberately placed once. The alternative, re-flagging it, would make the
cleanup able to delete something the reader chose by hand. Confirm before
building, but the default is: **never re-set the flag.**

---

## Also raised 2026-08-18

- **The posters drawer should show cover thumbnails**, the way the suggestions
  rows do. Today it lists titles only, so telling which posters are filled and
  which are empty means opening each one. Its own session.
- **Flourish on the poster itself** — headings alone at present. Undefined on
  purpose; a design sprint, not a bug.
