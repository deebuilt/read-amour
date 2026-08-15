# Read Amour

Your month in book covers, ready to post.

Search a book, drop its cover into a slot, save the image. No account, no
server, nothing to sign up for — everything lives in your browser, which is
also why it keeps working with no signal.

Built for the thing people already do by hand: screenshot a cover, open a photo
editor, drag it onto someone else's template, export, repeat twelve times.

## What it does

- **Finds covers.** Search by title or author against Open Library, or import
  your Goodreads library and let it match by ISBN.
- **Fills a poster.** A 1080×1920 Instagram Story frame with an adjustable
  grid, seasonal backgrounds, three typefaces, and full control over the text.
- **Saves the image.** One tap for a PNG. On a phone it offers the share sheet
  instead, which hands the poster straight to Instagram.
- **Remembers.** Every month is its own board, stored locally. Editing August
  never touches July.
- **Installs.** It's a PWA — add it to a home screen and it runs like an app,
  offline included.

## Importing from Goodreads

Goodreads shut off its public API in December 2020 and issues no new keys, so
the CSV export is the only way in:

1. Goodreads → **My Books** → **Import and export** → **Export Library**
2. In Read Amour, tap **Import** and drop the CSV in
3. Pick a month — covers resolve by ISBN, and the grid fills itself

Only the `read` shelf is imported. Books still on `to-read` aren't finished
books and don't belong on the poster.

## Running it

```bash
npm install
npm run dev        # http://localhost:8204
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

### Adding a background

Drop a JPG into `src/assets/backgrounds/` named `<month>-<nn>.jpg` — for
example `october-03.jpg`. Use `general-<nn>.jpg` for anything seasonless. It
appears in the picker automatically; there's no registry to update.

The app decides how to place it by aspect ratio: square-ish images are treated
as repeating patterns and tiled, others are cropped to fill. Append `-tile` or
`-photo` to the filename to force it, or override it per board in the app.

Then credit the artist in `src/assets/backgrounds/CREDITS.txt`, and compress:

```bash
node scripts/compress-backgrounds.mjs
```

Sources come off Unsplash at 4000px for a poster that's 1080 wide. Compression
takes the bundle from ~7MB to under 1MB, which on a phone is the difference
between instant and broken. Originals are backed up to `scripts/.originals/`
so the script never compounds its own output.

### Regenerating icons

```bash
node scripts/generate-icons.mjs
```

## How it's built

Vite, React, TypeScript. Ant Design for the editing chrome; the poster itself
is hand-built, because the exported image needs typography no component library
will give you.

- **Storage** — IndexedDB via `idb`. Covers are stored as blobs, not URLs.
- **Covers** — Open Library, free and keyless.
- **Export** — `html-to-image` captures the poster at its true 1080×1920 size.

### Three decisions worth knowing

**Covers are fetched as blobs, never hotlinked.** Drawing a cross-origin image
onto a canvas taints it and blocks the export outright. Fetching to a blob
first sidesteps that, and makes the app work offline as a side effect.

**The poster renders at true size and is scaled down for preview.** The preview
and the export are the same DOM at the same intrinsic dimensions, so what you
see is what the PNG contains. Laying it out responsively and re-deriving it at
export time is how these tools ship images that don't match the preview.

**The poster ignores dark mode.** The app chrome follows the system theme; the
artwork does not. Its colours belong to the board, so the same poster exports
identically whatever time of day you save it.

## Credits

Cover art and book data from [Open Library](https://openlibrary.org), a project
of the Internet Archive. Background artwork is credited in
`src/assets/backgrounds/CREDITS.txt` and in the app's About panel.
