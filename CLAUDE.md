# Read Amour — project notes

A personal project of Ruthnie's (DeeBuilt). Built for her sister, who makes
monthly reading posters by hand: screenshot a cover, drag it onto a borrowed
Instagram template, export, repeat. This app collapses that to search-and-tap.

Dev server: **port 8204**. Served from GitHub Pages at **readamour.com** since
2026-08-15 — an apex domain, from the root. It was at
`deebuilt.github.io/read-amour/` before that, and that URL is dead: the base
path moved with the domain, so the old route serves a blank page. See "The app
has its own domain" below before touching `base` or `CNAME`.

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

## A grid item holding an image needs `min-width: 0`

Search results came out uneven and pushed past the edge of the drawer whenever
one cover's source image was larger than the rest — Apple artwork especially,
which arrives at whatever size the storefront supplies.

It looked like an image-sizing problem and was not. `.result` is a **grid item**,
and a grid item defaults to `min-width: auto`, which means it refuses to shrink
below the intrinsic width of its contents. A 600px-wide cover therefore widened
its own track past the `1fr` it was given, and the whole grid overflowed.

`object-fit: cover` does not prevent this, and that is the part worth
remembering: it governs how an image *paints inside its box*, not how large the
box is allowed to become. The track is sized before the paint ever happens.

The fix is `min-width: 0` on the item, plus an explicit `width: 100%` on the
tile and `max-width: 100%` on the image so nothing contributes an intrinsic
width to track sizing. **Any new grid of images wants all three.** The other
grids in the app — `.photos`, `.swatches`, `.options` — are safe: the first pins
its images to `width: 100%` inside an `aspect-ratio` box, and the other two hold
no images at all.

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

Cover bleed forces them off — with no gaps between the covers the stars read as
clutter, and the mode is about the books rather than the reviews. It overrides
at render time and leaves `board.showRatings` alone, so turning bleed off brings
them back rather than making the reader re-find the switch.

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

## A fixed catalogue of grid shapes, and rows never exceed columns

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
the whole catalogue — 1, 2, 4, 6, 8, 9, 10, 12, 15, 16, 20 books. Anything added
to it must satisfy rows ≤ columns. 5×5 (25) satisfies that and is still left out
on purpose: 152px slots on a 1080px poster are a postage stamp on a phone and
turn the star ratings into specks.

1×1 and 2×1 were added on 2026-08-16, below what had been a floor of four —
which forced a reader with one book she loved into a grid with three empty
rectangles. 1×1 was expected to strand margin and does not: `layoutGrid`'s
generous path lets a one-row grid claim the bottom clearance, so it lands
width-bound at the full 936px like every other shape. Only a caption *with* a
title plate pushes it to 852px.

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

## Shipped 2026-08-16 — Tier 1

Four items from `docs/NEXT_LEVEL.md`, plus the update prompt that was put ahead
of them. Full notes and the corrections to the plan are in that doc's progress
log; what follows is what a future session needs to know.

**The service worker now prompts rather than updating silently.**
`registerType` is `prompt`, not `autoUpdate`, and `UpdateBanner` offers the
reload. These two are a pair — flipping the config back would leave the banner
announcing something that had already happened. None of it can be tested on the
dev server; service workers need `npm run build` then `npm run preview`.

**Grounds are sampled from the covers.** `design/palette.ts` is pure and
`useCoverPalette` owns the async — extraction decodes blobs, so it cannot be a
`useMemo`. It keeps each source colour's *hue* and overrides saturation and
lightness: the literal dominant colour of a book cover is usually a near-black
or a blaring red, which behind sixteen covers competes with all of them. A
ground should recall the covers, not match them.

**Source colours must be separated by hue, not just ranked by population.** The
first version took the top three buckets, and a histogram of book covers is
dominated by *one* hue in slightly different shades — so the top three came back
as three reds, each yielded a pale and a deep ground, and the row showed what
was visibly the same swatch five times. Real output from four covers:
`#eddee0`, `#451c20`, `#eddedf`, `#451c1f`, `#eddee0`, `#451c20`. Two pairs
differ by a single hex digit.

Distinctness has to be a **condition of selection**, not a filter afterwards —
by the time both grounds are derived, the duplicate is already there, and an
exact-hex dedupe cannot see that `#eddee0` and `#eddedf` are the same colour.
`MIN_HUE_SEPARATION` is 0.08 of the wheel (~29°). Near-greys are held to a
saturation test instead, because hue is unstable below about 0.2 saturation and
two barely-tinted creams can report hues a third of the wheel apart.

**A ground must stay recognisably the colour it was sampled from.** The first
`asGround()` clamped saturation to 28% and forced lightness to 0.9 or 0.19,
which was defensible as theory and destroyed the feature in practice:
Fahrenheit 451's `#ce2a1e` came out `#eddfde`, a faintly pink off-white; The
Book of Koli's foliage green came out `#e7edde`, a faintly green off-white.
Nearly every cover collapsed to the same pale neutrals. Ruthnie's verdict —
"the colors don't seem to match my books... I don't know where they're pulling
the colors from" — was exactly right, and it is the only test that matters for
a row labelled *From your books*: **can you tell which book each colour came
from?**

The clamps are proportional now (`s * 0.7` capped at 0.5 for tints, `s * 0.85`
capped at 0.62 for shades; lightness 0.84 and 0.24). A muted cover yields a
muted ground and a bold cover a bold one. Contrast was re-verified across every
hue at six saturations after the change: worst case 10.1:1 on tints and 6.3:1 on
shades, no hue near the ink threshold.

`MIN_USEFUL_SATURATION` is 0.25, not the original 0.12. Below that a pixel is
cover ink or paper, and a grey ground labelled "from your books" is true and
useless. A genuinely monochrome set of covers now yields fewer swatches or none,
which is the honest outcome.

**The lesson for any future sampling work:** every constant in this file trades
safety against recognisability, and the first version tuned all of them for
safety. The result was a feature that could not be wrong and could not be
useful. Check output against real covers, not against a contrast table.

`inkForBackground()` now answers properly for `kind: 'color'` rather than
defaulting to white. A colour the app computed is knowable; only photography
has to be guessed at.

**A poster can hold one book, or two.** `GRID_LAYOUTS` gained 1x1 and 2x1.
Contrary to what the plan predicted, 1x1 is width-bound at the full 936px —
`layoutGrid`'s generous path lets a one-row grid claim the bottom clearance. It
only goes height-bound with a caption *and* a title plate.

**One book per poster can be marked the favourite.** `favouriteBookId` lives on
the `Board`, never on the `Book` — a book is shared across posters and can be
August's favourite without being September's. A **white crown** in the top
corner of the cover, sized from `slotWidth` like the ratings, on a soft radial
glow.

The glow is not decoration: cover art is unpredictable by definition, so a mark
of any one colour will land on a cover that swallows it. It is the rating band's
scrim problem at a size where a full band would be absurd, so a radial fade
gives the mark its own ground without an edge that would read as a badge.

## The favourite mark took three tries, and both failures are instructive

**A gold rule** across the foot of the cover. The reasoning — a badge reads as
UI chrome, a rule reads as artwork — was true on both counts and still produced
the wrong mark, because it never asked whether the mark *meant* anything. A
horizontal line does not say "favourite". Ruthnie: "a gold bar that doesn't
really read as favorite."

**A gold star**, which fixed the meaning and broke something else: the poster
already draws gold stars for ratings, so a favourite that was also rated showed
a gold star in the corner and four more along the foot — same glyph, same
colour, two unrelated meanings on one cover. Visible in her screenshot within
minutes. **A mark can never be the same symbol as the thing it must be
distinguished from**, and it should not borrow that thing's colour either.

**A white crown.** Says "best of these" with no legend, is used nowhere else in
the app, and cannot be read as a score however many stars sit below it.

The crown is an **inline SVG, not a glyph** — `CrownMark` in `PosterSlot.tsx`.
The Unicode crown is emoji-presentation on most platforms, so a glyph would be
full-colour on one device, monochrome on another, and tofu where no font has it.
Nothing baked into an exported PNG may be at the mercy of font fallback.

The `BookList` toggle uses antd's crown and the accent colour rather than gold,
for the same collision reason — each row can also show gold rating stars.

In cover-bleed mode the mark moves to the **bottom-left** corner: the poster
title overlays the covers behind a 560px scrim, which on a 2x2 swallows more
than half the top row. The foot is free there because bleed forces ratings off.

**A dangling favourite must never survive a slot mutation.**
`withValidFavourite()` in `domain/board.ts` runs inside `resizeGrid`,
`setSlotBook` and `fillSlots`; `clearSlots` drops the id outright. An id
pointing at a book that has left renders no mark, which reads as the feature
breaking — and worse, it comes back to life if that book is ever replaced,
marking something the reader never chose. Any new slot mutation goes through the
same guard.

## Cover bleed belongs to square grids only

`coverBleed` drops the margins, the gap and the title band, and the covers crop
to fill. How much of a cover survives is decided entirely by how far the slot's
aspect sits from 2:3, and the spread is brutal: 16% lost on the square shapes,
32% on 5x4, 44% on 3x2, 58% on 2x1, **66% on 5x2**.

The 16% is not luck. The frame is 9:16, so a grid whose columns-to-rows ratio
equals the frame's own yields slots that are themselves 9:16 — and those are
exactly the square shapes. `supportsCoverBleed()` encodes that, and the switch
in `DesignPanel` explains what the shape must be rather than letting the reader
produce a ruined poster and blame the mode.

The flag persists while an unsupported shape is selected, so returning to a
square grid restores the mode instead of silently forgetting it.

This is the one place the 2:3 lock is deliberately broken. Cropping is the point
of a bleed layout — but note that `supportsCoverBleed` is derived from the 9:16
frame, so **2.2 (other frames) would have to re-derive it** along with the grid
catalogue.

## The app has its own domain, and the library can leave the device

Read Amour is served from **readamour.com**, an apex domain, since 2026-08-15.
It was at `deebuilt.github.io/read-amour/` before that.

`base` in `vite.config.ts` is a single constant, `/`. It is not only the asset
prefix — the PWA `start_url`, `scope`, and all three icon paths are built from
it, so moving the app again means changing that line and nothing else. The old
`NODE_ENV` branch is gone; dev already served from root.

**`CNAME` lives in `public/`, not the repo root.** The workflow publishes `dist`
as the entire site and Vite copies `public/` into it verbatim. Setting the
domain through the Pages settings UI writes `CNAME` to the repo root, where the
workflow never sees it — the next deploy would ship a site with no `CNAME`, and
GitHub clears the custom domain when a deploy arrives without one. The domain
would silently drop on every push. Do not "tidy" that file to the root.

For the record, since it is the kind of thing that gets re-litigated: an apex
domain on GitHub Pages uses four A records at `185.199.108–111.153`, all four,
proxy **off**. Those are platform-wide anycast addresses rather than per-site
allocations, which is why they can be known in advance — verify with
`nslookup deebuilt.github.io`. Cloudflare's orange-cloud proxy in front of Pages
breaks the certificate handshake; SSL/TLS mode must be Full, never Flexible.

### Why the backup exists

**IndexedDB is partitioned by origin and there is no exception to that.** A
domain move does not carry the data — a reader arrives at the new address to an
empty app while their whole library sits intact and unreachable under the old
origin. Nothing is deleted; it is stranded, and the only way off an origin is a
file the user carries by hand.

So `storage/backup.ts` writes the whole library — boards, books, and cover blobs
as base64 — to one JSON file, and reads one back. It was built as a migration
tool and the migration is done. What outlives it is the second job: a reading
history held only in a browser database is one cleared cache from being gone,
and this app has no server to recover it from.

Three rules it must keep:

- **Restore merges, never replaces.** Books go through `saveBooks`, inheriting
  the field-by-field merge that stops a re-dropped CSV from stripping resolved
  covers. Posters already present are kept and reported as skipped. Restoring
  the same file twice is a no-op rather than a duplicate library. A restore that
  cleared storage first would turn one mis-picked file into exactly the loss the
  feature exists to prevent.
- **Order is images, then books, then boards.** Every record is written after
  the thing it points at, so an interrupted restore leaves covers with no book —
  which the orphan sweep already protects — rather than books pointing at covers
  that never arrived.
- **Boards restore through `putBoardVerbatim`, not `saveBoard`.** `saveBoard`
  stamps `updatedAt` with the current time, which is right for an edit and wrong
  for a restore: it would re-date a whole library to the moment the file was
  read, destroying the only record of when each poster was last worked on. The
  file holds that value and nothing else does.

Proven across three origins on 2026-08-15 — localhost to `deebuilt.github.io`,
then both to `readamour.com`, on desktop and phone. Two devices that had been
used separately merged cleanly, keeping the union of both libraries.

## The bottom bar is a nav, and Export is not called Save

Five items across, icon over label, in `components/chrome/BottomBar`. It had
been two icons, a circular Save, two icons, inline in `App.tsx` and unlabelled —
with a comment recording that five labelled buttons wrap at 375px.

That was true and it was measuring the wrong arrangement. It is true of labels
*beside* glyphs, which is what an antd `Button` with `icon` and children gives
you. It is not true of the stacked arrangement every mobile nav uses. Measured
in Archivo at 11px, the widest label is **"Posters" at 38.7px** in a 62.4px
column at 320px — the narrowest phone viewport in use — leaving 23.7px. Nothing
wraps at any width the app will ever see, and no breakpoint is needed.

Three things hold that up, and all three matter:

- **A grid of five `1fr` columns**, not a flex row. Equal division is what makes
  it read as a nav rather than five differently-sized blocks, and it centres the
  middle item by geometry rather than by balancing the side groups.
- **`min-width: 0` on the item.** Same trap as the search-results grid, one
  section up: a grid item defaults to `min-width: auto` and refuses to shrink
  below its contents, so a long label would widen its own track past the `1fr`
  and the columns would stop being equal.
- **Plain `button` elements, not antd Buttons.** A Button owns its inner layout,
  so stacking a glyph over a label means fighting `.ant-btn` for flex direction,
  height and padding. The hit target is set here regardless.

Labels made an active state necessary. Nothing marked the open panel before,
which was invisible when every item was a bare glyph and would read as an
omission now. `aria-current="page"` rather than `aria-pressed`: these are
destinations and only one is open.

**The centre item is Export, and the label has now been wrong twice in both
directions.** It was Save, then Download, then Save again. Every version named
one outcome as though it were all of them, and "Save" additionally promises the
thing that already happens by itself — posters save continuously to IndexedDB.
What the button opens is a choice of four: photo or video, to the device or to
the share sheet. The component it opens has been called `ExportSheet` the whole
time, which was the answer sitting in the filename.

The rows *inside* the sheet stay "Save photo" and "Save video". There the verb
genuinely is save-to-device and the contrast being drawn is photo vs. video, so
`SaveOutlined` is correct there and now means only that. The bar carries
`ExportOutlined` instead. The floppy disk had been chosen deliberately over a
download tray, with a note calling it "a slightly odd fit for an app with
nothing to save" — that oddness was the label's fault and left with it.

Export is a row item rather than the raised circle it replaced. A circle with a
caption underneath does not read as a nav item, and leaving it uncaptioned
beside four labels would look like its label had fallen off. It leads on accent
colour alone, which is enough among four quiet marks.

**A "More" menu was considered and deferred.** The nav will eventually hold
More, with Import and About tucked inside — but only once there is a second
thing to put there. Today it would hold Import, which is used constantly, and
About. Demoting a frequent action behind a tap to make room for features that do
not exist yet is a straight downgrade. Build Stats first; then the menu has
contents and the nav change has a reason. See `docs/STATS.md`.

## A transition must differ on an axis, not by a magnitude

The video's four transitions — **fade** (opacity), **rise** (position, up),
**drop** (position, down), **zoom** (scale) — each own a different axis, and
that is a rule rather than an accident of design.

The first version did not. It shipped `settle`, `fade`, `rise` and `bounce`,
where three of the four differed only in *how much* they scaled: 1.06→1.00, flat,
and 1.06→1.00 with a small dip. Peak on-screen difference between `settle` and
`bounce` was **3.6 pixels** on a 4x4 slot at 720p, for about two frames at 24fps.
Ruthnie exported all four and could name exactly one — `rise`, the only one that
moved the cover somewhere.

It got that way by overcorrecting. `bounce` was first written as a 0→1.15
overshoot, correctly judged too violent for a cover arriving at a slot that is
already waiting for it — and the correction pulled it into `settle`'s range
instead of moving it to another axis. **Fixing "too big" produced "identical."**

The floor, written into `posterVideo.ts`: a new transition needs at least ~40px
of on-screen divergence from *every* existing one, on a 4x4 slot at 720p,
sustained over more than a couple of frames. The weakest pair among the four is
106px. Below that floor it is the same transition with a different name.

Two consequences worth knowing before proposing more. **Overshoot is not
available** — it is what `bounce` was, and at any magnitude gentle enough for
this poster it is invisible. **Spin is available** and genuinely distinct, since
rotation is an axis nothing else uses; it is left out on taste, because a
rotating cover reads as a slideshow effect where the covers are the artwork.

Every transition must also converge exactly to rest at progress 1. `compose()`
blits the cover directly from the still at that point, so a curve that has not
arrived produces a visible snap on the handoff — and the last frame of the video
would stop being pixel-identical to the PNG export.

## The video's ground capture must hide everything drawn per book

`posterToVideo` takes two captures: the finished poster, and the poster with
`data-ra-hide-covers` set on the node, which is meant to be the poster with no
books on it. The second is the ground every frame is painted onto.

Until 2026-08-17 the rule hid the cover `img` and nothing else. A slot also
renders rating stars, the favourite crown, and a coverless book's fallback plate
— all drawn per book, none of them the cover `img` — so the ground carried stars
and crowns in every filled slot and each arriving cover painted a second copy on
top. It survived because `settle` and `fade` did not displace the cover, so the
two copies coincided exactly; `drop` and `zoom` separated them and it was
immediately visible.

**So `data-ra-cover` means "drawn from a book", not "is the cover image"**, and
all four elements carry it. The selector is
`.frame[data-ra-hide-covers='true'] [data-ra-cover='true']` — deliberately not
scoped to `img`, and deliberately not written against the class names, since
those live in `PosterSlot.module.css` while the attribute is on the frame in
`Poster.module.css` and CSS Modules scopes them separately.

**Anything new drawn inside a slot from book data needs the attribute**, and it
must stay `visibility: hidden` rather than `display: none` — the two captures
have to stay pixel-aligned, and a reflow between them would misplace every cover
in the video.

## Every reader-visible change updates the release notes

A PWA has no App Store listing, so the app is the only place that can tell a
reader what changed. `src/design/releases.ts` is that record, and keeping it
current is part of shipping rather than a separate chore.

**The rule: if a change is visible to a reader, it gets a line in `RELEASES`
before the commit that ships it.** That is in addition to the commit message,
not instead of it — the two are written for different people. A commit subject
is for the repo ("Give the bottom bar its labels back, and call export export");
a release note is for someone holding a phone ("You can see what each button
does").

**The exception is the important half of the rule: a build with no visible
change gets no entry.** Refactors, dependency bumps, comment passes, and
internal repairs are invisible by definition, and listing them trains people to
stop reading the notes. `UpdateBanner` falls back to "A new version is ready"
when a version has no entry, and that fallback is the honest outcome for an
internal release — not a gap to be filled.

The release ritual, in full:

1. Bump `version` in `package.json` — minor for features, patch for fixes.
2. Add the entry to `RELEASES`, newest first, with the same version string.
3. Commit, push, and confirm the deploy landed.

`__APP_VERSION__` is baked in from `package.json` by Vite's `define`, so the
version in a release entry must match it exactly — the running app finds its own
notes by that string, and a mismatch means the banner silently shows nothing.

Write the notes against `VOICE.md`. One sentence per change, saying what the
reader can now do; no version-number theatre; never a rule-of-three list.

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

`docs/STATS.md` holds the plan for a reading dashboard — books over time,
rating distribution, a few honest numbers, and plain-language observations.
Entirely local: every panel computes from `Book` records already in IndexedDB,
so it ships with no backend and no cost.

Read it before building any of it, chiefly for what it rules out. The schema
carries a **date, a rating, and an author** and nothing else — no page count, no
genre, and no start date, which makes reading *duration* unbuildable rather than
merely hard. It also records why the activity heat map from Ruthnie's Last Time
app does not port: that app logs hundreds of timestamped events a year, where a
reader finishes perhaps forty books, so the same grid here is ~330 empty cells
and reads as an accusation. What ports is that app's honesty rule — every
generator returns `null` unless the evidence is there, so a thin library gets
silence rather than a fabricated pattern.

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

**3. The About panel, which is now the app's front door and reads like a
footnote.** Four things, noted 2026-08-15 and deliberately left for a later
session:

- **A creator credit linking to Ruthnie's own site.** She is writing that site
  now; the URL does not exist yet, which is the only reason this is not built.
  It is the link she will attribute the app with, so it wants to be a real
  credit rather than a line of small print.
- **The local-only promise deserves better placement.** "Everything stays on
  this device" is the first thing a reader wonders about a reading app, and it
  is currently the second paragraph of a panel most people never open. The
  backup controls now sit directly under it, which is right — the promise raises
  the question and the answer should be next to it.
- **Collapsible credits.** The artwork list is the longest thing in the panel
  and the least often read. `PanelSection` already takes a `collapsible` flag;
  this is that pattern, not a new one.
- **Seven background images are uncredited.** Ten files in
  `src/assets/backgrounds/`, three rows in `CREDITS.txt`: august is complete,
  september is half done, and october, november and december have nothing. The
  file's own header warned that reconstructing this later would be miserable,
  and it was right — the photographers have to be found on Unsplash by hand.

**About opens by tapping the wordmark**, which is the whole problem. Nothing
about a title suggests it is a button, and Ruthnie — who built the app — had
never once clicked it. Moving the backup controls to the bottom bar was
considered and rejected on 2026-08-15: About is where they belong, and the bar
already has an Import button meaning the Goodreads CSV, so a second Import would
collide. **If this is fixed, fix the affordance, not the location.**

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
