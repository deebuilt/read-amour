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

## Planned next (2026-08-15)

Shipped to Ruthnie's sister and her reading friends; these came out of that
first real use.

**1. Manual book entry with cover upload.** Open Library has no record of some
2026 releases, so a book simply cannot be added. Let the user upload a cover
image and fill in title/author/rating by hand. `storeUploadedImage()` already
handles the blob side — this is mostly a form plus a `source: 'manual'` path,
which the `Book` type already allows.

Worth trying first, and possibly cheaper: **Google Books as a search fallback**
(`https://www.googleapis.com/books/v1/volumes?q=`, keyless). Its new-release
coverage is better than Open Library's. Manual entry is still worth having for
books in neither, but the fallback may solve the common case.

**2. Surface the book data we already hold.** Every book on a board already
stores title, author, ISBN, `dateRead`, and `rating` — and none of it is ever
displayed. A "books this month" list under the poster is buildable today with
no new data, and it gives manually-added metadata somewhere to live.

Note the asymmetry: books added by *search* have no `dateRead` or `rating`
(Open Library does not know them), while books from the *Goodreads CSV* do. Any
list view has to read well when those fields are absent.

**3. Saved months, new month, and reset.** Partly built already: the `boards`
store, `getBoardByMonth()`, and `startNewBoard()` all exist, and `useBoard()`
opens the most recent board. Missing is the UI — a month switcher, a "start
September" action wired to `startNewBoard`, and a clear-this-board action
(`clearSlots()` exists; a full reset also needs `pruneOrphanedImages()` so
dropped covers do not leak storage).

## Deliberately not built

- **Unsplash API at runtime.** Their terms require hotlinking from their CDN
  with a tracking parameter, which is incompatible with the blob approach that
  makes export work — and a key in a static bundle is public anyway. Images
  are curated and shipped as assets instead, which the Unsplash *license*
  (as distinct from the API terms) explicitly permits.
- **Goodreads sync.** The public API was shut down in December 2020 and issues
  no new keys. CSV export is the only path in, and it's wired.
