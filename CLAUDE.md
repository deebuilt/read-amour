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

**The merge interleaves by rank; it must never concatenate.** Each catalogue
ranks its own results, and that ranking is the only relevance signal either one
gives — there is no score comparable across them. Appending Apple's list after
Open Library's threw Apple's away entirely: its best hit landed behind Open
Library's twentieth. Searching "forsaken" put *A Forsaken Prophecy* — Apple's
#10, absent from Open Library's top 20 — at **position 28**, which is found in
principle and invisible in practice. Rank leads the sort, a tie goes to the row
that can fill a slot, and a book both catalogues returned takes the better of
its two positions. Both limits are 20, matched so neither source dominates.

What this does **not** fix, correctly: a single word shared by dozens of titles.
Nine books are literally called *Forsaken*, so Apple ranks those first and
*A Forsaken Prophecy* sits at #10 of its list. That is honest ranking, not a
bug, and hand-tuning around one book would be worse. Any second word puts it
first.

**A half-typed word is never sent to the APIs.** Neither catalogue does prefix
matching, so a trailing fragment is matched as a whole word — it does not narrow
the search, it derails it. Typing toward "forsaken prophecy": "forsaken pro"
matched *Pro-Christian* and *GameShark*, "forsaken prophe" matched nothing at
all, and only the final "cy" snapped back. The list emptied out as the reader
got closer.

The fix is not a better query. One keystroke earlier the book was already on
screen — "forsaken" returns it — and the app threw that away to ask a question
no catalogue can answer. So `parseQuery()` splits the input: whole words go to
the APIs, and the trailing fragment filters the results locally, where a prefix
test is exact and free. The book now sits at #1 from "forsaken pr" onward, and
no keystroke blanks the list.

Two guards this needs. A fragment only counts with **no trailing space** — a
space means the word is finished. And the remaining words must be
**substantial**: "the hobbit" reduced to searching "the" returns whatever the
catalogue likes, none of it Tolkien, and then the fragment filters a set the
book was never in. If only articles and initials are left, the query goes whole.

**An abort must never be swallowed as an empty result.** `searchAllBooks` wraps
each fetch so one source failing does not sink the search — but the first
version caught *everything*, including `AbortError`. The caller debounces and
cancels the previous request on every keystroke, so a swallowed abort resolved
as "this source found nothing" and painted a partial list as though it were the
answer: same query, different results depending on typing speed. Aborts now
rethrow, and the caller's own `signal.aborted` guard drops them.

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

## Uploads are downscaled on the way in, and it is not optional

`scripts/compress-backgrounds.mjs` only touches the ten curated files in
`src/assets/backgrounds/`, at build time. Uploads never went near it —
`storeUploadedImage()` wrote the `File` into IndexedDB byte for byte.

So a background saved straight off Unsplash sat in the board at full camera
size: 4000px or more, for a poster that is 1080 wide. The browser then rescaled
roughly 24 megapixels on **every repaint**, which is felt precisely where
repaints are continuous — the design drawer stutters as it slides up, and the
wash slider trails the thumb. It reads as a slow app and is one oversized blob.

`shrinkForStorage()` in `api/resizeUpload.ts` is the build script's job done in
the browser, at the same numbers: 1400px longest edge, JPEG quality 82. It sits
inside `storeUploadedImage()`, which is the single choke point every upload path
goes through — backgrounds, manual covers, and cover replacement. Put it there,
not at the call sites, or the next upload path added will miss it.

It declines to act when acting would cost something: files under 400KB, images
already inside 1400px, SVGs, and any re-encode that came out larger than the
original (a transparent PNG flattened to JPEG can do exactly that). A small
cover with crisp type is not improved by a round trip.

**A deploy does not fix images already stored.** The shrink runs at upload time,
and new code does not touch existing bytes — refreshing just re-reads the same
fat blob. `shrinkStoredUploads()` in `storage/db.ts` rewrites them once, called
unawaited from `useBoard`'s load *after* `setIsLoading(false)`. Both details are
deliberate: it decodes full-size bitmaps, so blocking the first paint on it
would trade a stuttering drawer for a blank startup. It works sequentially for
the same reason — several full-size decodes at once is a memory spike on the one
device this app is built for.

It only ever touches `bg-*` and `manual-cover-*`. Catalogue covers arrive from
Open Library and Apple already sized for display, and they are content-addressed
and shared across posters — re-encoding bytes that several boards point at buys
nothing.

## Save and share are two different intentions

`downloadPoster()` used to check whether the browser could share files and, if
it could, hand the poster to the OS share sheet and return — the download line
never ran. On Android that branch is always taken, so the button labelled
*Download* had never once downloaded. The comment in the code stated the
assumption plainly: "on a phone that is the better outcome anyway, since it
hands the image straight to Instagram."

That was the app deciding what the poster was for. Posting it is one thing you
might do; keeping a copy is another, and the second one was silently
unavailable.

The share sheet is **Android's**, not ours. `navigator.share()` hands over a
file and the OS draws the panel — there is no API to add a "Save" item to it. So
the choice has to be made on our side of that handoff, which is what
`ExportSheet` is: one button in the bar, two rows in a modal.

`savePoster()` and `sharePoster()` are separate exports and capture identically;
only the destination differs. The iOS fallback still exists inside `savePoster`,
but as a **fallback** — `supportsDownload()` sniffs for iOS, because `<a
download>` does nothing for blob URLs there and a feature test cannot see that.
Android never reaches it. Never restore the old order, where sharing came first
whenever it was possible.

`canSharePoster()` decides whether the sheet offers a share row at all. A choice
that does nothing is worse than one choice.

## Shipped 2026-08-15 (second pass)

Both from the first real use on a phone, and both were the app quietly deciding
something on the user's behalf:

1. **Save vs share**, above. The export button opened Android's share sheet and
   never wrote a file.
2. **Uploads downscaled**, above, plus a one-time pass over images already
   stored. The upload button also now says whether a photo is already in use and
   shows while one is processing — replacing a background gave no sign it had
   worked, and a large photo takes a visible moment to shrink.

The bar button and the sheet's save row carry the same `SaveOutlined` mark, so
the save path reads as one action from the bar through to the choice. It is a
floppy disk, which is a slightly odd fit for an app with nothing to save — the
posters save themselves — but it was chosen deliberately over the download tray.

## What to build next

`docs/NEXT_LEVEL.md` holds the plan for where the poster goes from here, in
three tiers: composition (cover-derived palettes, cover-only bleed, a top-book
mark, non-uniform layouts), export (sticker-safe layout, other frames, motion,
carousels), and a share link.

Read it before starting design work. It records the reasoning, the file-level
landing spots, and what will bite on each — including the finding that a share
link needs **no backend**: covers travel as identifiers (an Open Library id or
an ISBN, ~13 characters) and are re-fetched on arrival, which puts a 20-book
poster under 1KB in a URL fragment. Encoding the actual cover blobs would be
~410KB against an 8–32KB ceiling, which is where the "this needs a database"
assumption came from.

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
