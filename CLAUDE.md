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

The rule: **`cover-*` keys are never swept.** They are content-addressed by
Open Library id and shared across posters, so they are always either in use or
about to be. Uploads (`bg-*`, `manual-cover-*`) are swept, but only outside a
10-minute grace period, which closes the same gap for hand-added covers.

If you add another image kind, decide which side of that line it is on before
storing the first blob.

## Shipped 2026-08-14

All three planned features, plus what the first real use turned up.

**1. Manual book entry.** A second tab in the slot editor. Cover upload is
required — a manual book without one places an empty rectangle. Goes through
`storeUploadedImage()`, so the blob path is identical to a search result's and
the export stays safe.

**Google Books was considered and not built.** Its new-release coverage really
is better, but its cover thumbnails (`books.google.com/books/content`) send no
CORS headers, so `fetch()` cannot read them into a blob. They can be *displayed*
and never *stored* — which means a result that looks fine in search and fails
at export, the exact failure the blob architecture exists to prevent. A
metadata-only fallback (Google for title/author, Open Library by ISBN for the
cover) is still possible; it is a smaller win than it looks, since a book Open
Library has never heard of still ends up needing a manual cover.

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

Months over 30 books show "· N won't fit" before you tap, since the grid maxes
at 5×6 and `fillSlots` silently drops the overflow.

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

**1. Google Books as a metadata fallback.** When Open Library returns nothing —
which happens for genuinely recent releases — fall back to
`https://www.googleapis.com/books/v1/volumes?q=` (keyless, CORS-open) for title,
author, ISBN and year, then hand the user straight to cover upload.

Covers cannot come from Google. `books.google.com/books/content` sends no
`Access-Control-Allow-Origin`, so `fetch()` cannot read those bytes into a blob
— and an unstorable cover cannot be exported, since the canvas would be
tainted. This is true in production as much as on localhost: the *server* being
fetched from decides, not where the app is hosted.

The shape to build is the CSV's: bring the text for free, get the picture
separately. That framing is Ruthnie's and it is the right one — metadata
without covers is clearly worth having, as the Goodreads importer already
proves.

**2. Bulk cover fetching with a cancel.** Cover resolution currently cannot be
aborted; closing the import drawer mid-fetch leaves the queue running. Wanted
alongside it: a summary of which covers failed, rather than silence.

Neither is urgent. Manual entry with cover upload already covers the case that
prompted the Google Books idea — a book the catalogue does not have can be
added today, it just takes typing. These are conveniences on top of that, not
gaps in what the app can do.

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

## Deliberately not built

- **Unsplash API at runtime.** Their terms require hotlinking from their CDN
  with a tracking parameter, which is incompatible with the blob approach that
  makes export work — and a key in a static bundle is public anyway. Images
  are curated and shipped as assets instead, which the Unsplash *license*
  (as distinct from the API terms) explicitly permits.
- **Goodreads sync.** The public API was shut down in December 2020 and issues
  no new keys. CSV export is the only path in, and it's wired.
- **Google Books covers.** No CORS headers on their cover CDN, so a cover can
  be displayed but never stored — and an unstorable cover cannot be exported.
  See the 2026-08-14 notes above for the metadata-only variant that is still
  open.
