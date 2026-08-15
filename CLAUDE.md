# Read Amour — project notes

A personal project of Ruthnie's (DeeBuilt). Built for her sister, who makes
monthly reading posters by hand: screenshot a cover, drag it onto a borrowed
Instagram template, export, repeat. This app collapses that to search-and-tap.

Dev server: **port 8204**. Deployed to GitHub Pages at
`deebuilt.github.io/read-amour/`.

## The one rule that shapes everything

**The poster is an exported image, not a web page.** Every decision follows
from that:

- It renders at exactly **1080×1920** and is CSS-scaled for preview. The
  preview and the export are the same DOM at the same intrinsic size. Never
  introduce a second rendering path for export — that is how these tools ship
  images that don't match what the user saw.
- **Poster colours never come from theme variables.** `html-to-image` cannot
  resolve a CSS custom property, and a themed poster would export differently
  depending on the OS setting at save time. Poster ink is fixed hex
  (`color.posterInk`, `color.posterInkDark`); chrome uses `var(--ra-*)`.
  This bug has already happened once — a `var()` written into a saved board
  exported with an invisible title. `migrateBoard()` repairs those on load.
- **Cover images are blobs in IndexedDB, never hotlinked.** A cross-origin
  image drawn to canvas taints it and blocks export. This is also why the app
  works offline.

## Layout

Poster geometry lives in `src/domain/layout.ts`. Slot size is **derived**, not
fixed — constrained by both available width and height, so no grid shape can
overflow the frame. The title band is **measured** from the actual typeface,
whether there's a subtitle, and whether a title plate is on. Both of these
started as fixed guesses and both were bugs: grids ran off the bottom, and
plated titles overlapped the first row.

If you change `titleSize`, `platePaddingY`, or add a typeface, re-check that
`titleBlockHeight()` still reflects reality.

## Backgrounds

Files in `src/assets/backgrounds/`, named `<month>-<nn>.jpg`. Discovered by
`import.meta.glob` — no registry. In `src/assets/`, not `public/`, so Vite
fingerprints them and rewrites the base path for the Pages route.

Square-ish images tile (they're patterns); others crop. Overridable per file
(`-tile` / `-photo` suffix) and per board (the treatment controls).

**Always run `npm run compress:backgrounds` after adding images.** Sources come
off Unsplash at 4000px for a 1080px poster. Originals back up to
`scripts/.originals/`, so the script is safe to re-run.

Credit every image in `CREDITS.txt` — parsed at build time into the About
panel. Unsplash doesn't require it; we do it anyway.

## Conventions

- Ant Design for chrome, hand-built components for the poster.
- All design values come from `src/design/tokens.ts`. No raw pixel numbers in
  component files.
- No `any`. Typecheck with `npm run typecheck` as you go.
- Mobile-first: the poster owns the screen, controls live in a bottom drawer.

## Posters, not months

The app was built around a monthly reading poster, and `board.month` is still
a real indexed field — it is the key the Goodreads importer groups rows by, and
where a new poster's default title comes from.

**But nothing enforces a month, and the UI no longer claims one.** The title has
always been free text, so a year-in-review or a themed list was always as valid
as "August". The UI says *poster* everywhere; `month` stays underneath as an
import key and a default. Two posters may share a month — they are told apart
by their titles, which is what the switcher lists.

## The orphan sweep must never touch cover blobs

`pruneOrphanedImages()` deletes images nothing references. Covers are written
to the images store **before** the book that points at them is saved, and the
CSV import does not save books with their cover keys until an entire month has
resolved. So for the whole length of an import, every fetched cover is
unreferenced — and a sweep that equates "unreferenced" with "orphaned" deletes
covers that are actively arriving, across *every* poster, not just the one
being cleared.

This is not hypothetical. It wiped a month of resolved covers on 2026-08-14,
minutes after the sweep was wired into clear-poster and delete-poster.

The rule: **`cover-*` keys are never swept.** They are content-addressed — by
Open Library id (`cover-<id>`) or by Apple artwork URL (`cover-apple-<id>`) —
and shared across posters, so they are always either in use or about to be.
Apple covers sit under the same prefix deliberately, so they inherit this
protection. Uploads (`bg-*`, `manual-cover-*`) are swept, but only outside a
10-minute grace period, which closes the same gap for hand-added covers.

If you add another image kind, decide which side of that line it is on before
storing the first blob.

## Shipped 2026-08-14

All three planned features, plus what the first real use turned up.

**1. Manual book entry.** A second tab in the slot editor. Cover upload is
required *there* — someone typing a book in by hand has the cover to hand, and
a manual book without one places an empty rectangle. (Search is different: a
coverless catalogue hit is worth taking, since it saves the typing. See "Two
catalogues" below.) Goes through `storeUploadedImage()`, so the blob path is
identical to a search result's and the export stays safe.

**Google Books was considered and not built** — its cover CDN sends no CORS
headers. The metadata-only fallback floated here was killed the next day; Apple
Books does the job and returns real covers. See "Two catalogues" below.

**2. The book list.** `BookList` shows every book on the poster in slot order.
Rating and date render only when present, so a search-added book reads as a
complete row rather than one with two blanks. Tapping a row opens that slot.

**3. Posters panel.** Switch, create, rename in place, delete. Rename edits
`text.title` — a poster's name and its artwork title are the same thing by
design, not two fields that could drift.

**Metadata is editable everywhere now.** `BookDetailsEditor` puts rating, finish
date, and **Replace cover** on any book in a slot, whatever its source. The old
asymmetry — Goodreads books had ratings, searched books could never have them —
was an artifact of provenance that no reader has a reason to care about.
`source` still records origin; it no longer decides what can be filled in.

Replacing a cover deliberately leaves the old blob: an Open Library cover is
shared by every poster using that book, so deleting it would blank the others.

**Import now creates a poster per month.** `handleUseMonth` used to overwrite
whatever poster was open, which silently destroyed a month's work (it ate
August during this session). It now fills the poster for that month, creating
one if needed. The panel stays open so months can be tapped through in a row,
and each row checks the saved posters — done months show a checkmark and say
**Again**. That is also the answer to resuming an interrupted import: the saved
posters *are* the progress record, so it survives a closed tab with no state to
lose.

Months over the largest grid's capacity show "· N won't fit" before you tap,
since `fillSlots` silently drops the overflow. The threshold derives from
`MAX_GRID_CAPACITY` rather than being written down twice — it was 30 under the
old sliders and is 20 now. See "Only nine grid shapes" below.

**Save became Download.** Posters have always saved continuously to IndexedDB;
the button only ever exported a PNG. The old label promised the thing that
happens by itself.

## The book-to-cover link must exist in two places

A book pointed at its cover through exactly one field, `Book.coverBlobKey`, and
nothing else in storage recorded the relationship. When a bad write erased that
field across the library, the blobs were all still in `images` — intact,
correct, and anonymous. Neither the app nor a human reading IndexedDB by hand
could tell which cover belonged to which book. It looked exactly like
catastrophic data loss and was in fact a severed pointer.

So `StoredImage` now carries `bookIds` and `bookTitle`, written by
`tagImageOwner()` on every path that resolves a cover — search, CSV import,
manual upload, and cover replacement. `repairCoverLinks()` runs at startup and
rebuilds any `coverBlobKey` that has gone missing but whose image still claims
the book. It is a no-op on healthy storage.

**Never let the relationship live in one field again.** If a new store points
at an image, it records the ownership on the image too.

Related: `saveBooks()` merges rather than replaces. A Goodreads CSV has no
cover column, so a plain `put` of a re-parsed library strips `coverBlobKey`
from every book already resolved — which is what caused the loss above, on the
second drop of the same file. And `resolveCoverForBook()` checks the *stored*
book before going to the network, because the importer hands it objects parsed
straight from the CSV, which carry neither a blob key nor a cover id.

## Ratings on the poster

`showRatings` on the board, off by default (undefined reads as off, so older
boards keep their look). Filled stars only — a 3-star book shows three marks,
not three bright and two dim, which reads as artefacts at poster scale. Unrated
books show nothing rather than an empty row, so the grid never implies a zero.

Over cover art the stars sit in a gradient scrim, because white stars vanish on
a pale cover. Over a coverless book's tinted plate there is nothing to scrim, so
they take the poster's ink instead. Every colour involved is a literal hex —
this is inside the exported PNG.

## Two catalogues, because neither is enough

Search goes through `api/bookSearch.ts`, which queries Open Library and Apple
Books in parallel and merges them.

- **Open Library** is a library catalogue — print editions, real ISBNs, deep
  backlist, and the only one of the two that can be queried *by* ISBN. It stays
  primary.
- **Apple Books** is a storefront, so anything on sale necessarily has artwork.
  That makes it strong exactly where Open Library is weak: a book published
  weeks ago often has a reader-contributed record with **no cover at all**.
  Ebook editions only, so print-only and self-published titles can be missing.

The case that prompted it: *A Forsaken Prophecy* (July 2026) has two editions in
Open Library, both `covers: None`. The catalogue knows the book and has no
picture of it.

**Apple has no ISBN index.** `lookup?isbn=` returns nothing and an ISBN as a
search term matches nothing — every Apple query is fuzzy text. So a fallback
lookup for a known book gets a *ranked guess*, not an identity, and
`isConfidentMatch()` gates it: exact normalised title, plus a shared author
surname when an author is known. Without that gate the first row wins and a
poster shows the wrong cover, which looks correct and is worse than blank.
(It already earns its keep: ISBN 9781662512681 returns "Dangerous Play" from
Open Library, and Apple still finds the right art because it searches on the
book's own title and author rather than on that bad answer.)

**Coverless results are no longer discarded.** `searchBooks()` used to drop
every row without `cover_i` on the reasoning that a cover-placing app has no use
for one. That threw away too much — the title, author and ISBN are the tedious
part to type, and a cover can be uploaded after. Coverless rows now sort last
and render an "Add your own" placeholder.

Apple covers go through the same blob path as Open Library's, under the same
`cover-` key prefix — so the orphan sweep leaves them alone, for the same reason
it leaves Open Library's alone (shared across posters, content-addressed).

**Google Books remains impossible, and the reason is not localhost.** CORS is
decided by the server being fetched *from*, so hosting elsewhere changes
nothing. Verified with `Origin: https://deebuilt.github.io`:
`books.google.com/books/content` returns the image with **no**
`Access-Control-Allow-Origin` header, while Apple's CDN returns
`Access-Control-Allow-Origin: *`. An unreadable image cannot become a blob, and
drawing it to canvas taints the export. Separately, the keyless Google API is
quota-limited to zero from some networks (a hard 429 on 2026-08-15), so even the
metadata-only fallback would fail unpredictably. Apple supersedes that whole
plan.

## Only nine grid shapes, and rows never exceed columns

The grid used to be two sliders, 2–5 columns by 2–6 rows. Most of the shapes
they could reach did not fill the poster: a 2×6 grid strands **378px of margin
per side** and uses 30% of the frame width. 2×3 — a shape someone would
plausibly pick — strands 212px.

It is not a max-width and it is not a bug in `layoutGrid`. The frame is 9:16
and slots are locked to 2:3 so covers never crop, so a grid taller than it is
wide runs out of height before it runs out of width. The leftover width has
nowhere to go, because widening a slot makes it taller and it no longer fits.
It falls into the margins.

The rule this yields is exact: **rows may never exceed columns.** Every
square-or-wider shape is width-bound and fills the frame at the designed 72px
margin. Every taller-than-wide shape strands margin, in proportion to how tall.

So the shape is not a free choice, and `GRID_LAYOUTS` in `types/domain.ts` is
the whole catalogue — 4, 6, 8, 9, 10, 12, 15, 16, 20 books. Anything added to
it must satisfy rows ≤ columns. 5×5 (25) satisfies that and is still left out
on purpose: 152px slots on a 1080px poster are a postage stamp on a phone and
turn the star ratings into specks.

The picker offers these by **capacity first** — the user is choosing how many
books fit, not solving a geometry problem — with the shape shown underneath,
since on a poster the arrangement is a real preference.

`migrateBoard()` remaps boards saved under the old sliders. It reads the books
out in order and re-places them from the top rather than calling `resizeGrid`,
which keeps books by slot index and would drop one off the end when an early
slot was empty. Capacity never shrinks except for boards over 20 (old 4×6,
5×5, 5×6), where no offered shape can hold them.

## The design drawer collapses selectively, not wholesale

Eight sections in an 82vh sheet, with the two tallest — photo designs and
background swatches — at the top, meant scrolling past both to reach the
typeface or the words every time the drawer opened.

`PanelSection` takes a `collapsible` flag, and only three sections set it:
**Designs, Background, Typeface.** Those are tall, image-heavy, and chosen once
per poster. Everything else stays open, because collapsing all eight would
trade the scroll for a wall of closed rows and a tap before any control — worse,
not better. Layout stays open too despite its height; it is returned to often.

A closed section shows **what it is currently set to** next to its label. A
collapsed section that cannot answer "what is this poster using?" has only
moved the information behind a tap.

The drawer body is mounted as `panel === 'design' && <DesignPanel …>`, so the
panel unmounts on close and open/closed state resets each time. That is the
wanted behaviour — closed by default — but it does mean a section cannot stay
open across drawer visits. Lifting that state to `App` would be the change if
that ever becomes annoying.

## Grid-relative sizing

Star ratings size from `slotWidth`, not from a constant. This is the same trap
`layout.ts` already warns about for slot size and title height, and it caught
us again: stars fixed at 26px looked deliberate at 4x4 and like specks at 2x2,
where slots are nearly three times wider.

Anything drawn *inside* a slot — badges, marks, overlay type — takes its size
from the slot, never from a fixed number. `STAR_WIDTH_RATIO` in `PosterSlot.tsx`
is the one tuning constant.

## Light backgrounds must differ in temperature

`linen` was a warm off-white gradient averaging to almost exactly `paper`'s flat
tone, so the two were the same swatch in the picker. It is now `stone`, a cool
grey, and `migrateBoard()` maps the old id across.

A new light ground earns its place by differing in *temperature*, not by a few
points of lightness — at swatch size, lightness alone is invisible.

## Shipped 2026-08-15

Four changes, each with its own section above:

1. **Nine fixed grid layouts** replacing the columns/rows sliders, because most
   reachable shapes did not fill the poster.
2. **A selectively collapsible design drawer**, with real type hierarchy —
   section headings had been styled identically to the field labels inside them,
   which is why eight sections read as one grey list.
3. **Apple Books as a second catalogue**, and coverless search results kept
   rather than discarded.
4. **Designs grouped by month** in the picker. The months were always in the
   filenames and never once shown — the label lived only in an `aria-label`.

## Known gaps

- **Cover resolution cannot be cancelled.** Closing the import drawer mid-fetch
  does not stop the queue. Books now land on the right poster regardless, so
  this is wasted network rather than misdirected writes — but there is no abort
  and no summary of which covers failed.
- **Covers are still fetched per month.** "Make all N posters" creates every
  board instantly with its books placed, but no cover art — that is the honest
  split, since posters are small records and covers are one network request per
  book. Tapping a month fills its covers.

## Planned next

**1. ~~Google Books as a metadata fallback.~~ Superseded 2026-08-15 by Apple
Books**, which is better on every axis — it returns covers rather than metadata
alone, needs no manual upload afterwards, and is not quota-limited to zero. See
"Two catalogues" above.

**2. Bulk cover fetching with a cancel.** Cover resolution currently cannot be
aborted; closing the import drawer mid-fetch leaves the queue running. Wanted
alongside it: a summary of which covers failed, rather than silence.

Not urgent. Manual entry with cover upload already covers the case, and the
Apple fallback has narrowed how often a cover is missing at all.

## Deliberately not built

- **Unsplash API at runtime.** Their terms require hotlinking from their CDN
  with a tracking parameter, which is incompatible with the blob approach that
  makes export work — and a key in a static bundle is public anyway. Images
  are curated and shipped as assets instead, which the Unsplash *license*
  (as distinct from the API terms) explicitly permits.
- **Goodreads sync.** The public API was shut down in December 2020 and issues
  no new keys. CSV export is the only path in, and it's wired.
- **Google Books, entirely.** No CORS headers on their cover CDN, so a cover can
  be displayed but never stored — and an unstorable cover cannot be exported.
  The metadata-only variant is dead too: the keyless API returned a hard 429
  with `quota_limit_value: 0`. Apple Books does the same job and returns real
  covers; see "Two catalogues" above.
