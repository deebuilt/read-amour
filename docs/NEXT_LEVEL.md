# Read Amour — taking the poster further

Planning doc, written 2026-08-15. Ordered so a build session can take one item
at a time without reading the rest.

Each item states what it is, why it's worth doing, where it goes in the code,
and what will bite. Nothing here is committed to — this is the menu.

---

## The constraint everything is shaped by

**The poster is a flat exported PNG.** Instagram renders a Story or a feed post
as an image; there is no tap, no hover, no embedded audio. So "make the poster
interactive" cannot mean interactivity *inside* the artwork. It splits into
three places the work can actually live, and that is what the tiers are:

- **Tier 1** — make the image carry more, using data the app already holds.
- **Tier 2** — make the export more than one static frame.
- **Tier 3** — put the interactivity at the far end of a link.

Tier 3 is deferred, and the reason is in its own section. Read it before
building anything there — the URL-encoding finding changes what it costs.

---

# Tier 1 — Composition

The app holds `rating`, `dateRead`, `author`, `isbn13`, and cover blobs with
real colour in them. The poster shows covers, and optionally stars. Everything
else is discarded at render time. Tier 1 is mostly about spending data that is
already sitting there.

---

## 1.1 Cover-derived palettes

**What.** Sample the dominant colours out of the covers currently on the board
and offer them as background and ink choices — a "From your books" row in the
Background section, alongside the builtin swatches.

**Why this one first.** Highest visual payoff per hour in the document. A
poster whose ground was pulled from its own covers looks *composed* rather than
decorated, and no two months land the same. It also needs no new decisions from
the reader — the swatches simply appear, and the existing background flow takes
them from there.

**Where it goes.**
- New `src/design/palette.ts` — extraction, pure, no React.
- `Background` already has `{ kind: 'color'; value: string }`. Nothing in
  `types/domain.ts` needs to change.
- `DesignPanel.tsx` — a swatch row inside the existing Background
  `PanelSection`, above "Upload a photo".
- `PosterBackground.tsx` already handles the `color` kind. Verify.

**How the extraction works.** Draw each cover blob to a small offscreen canvas
(64×96 is plenty — you want the average, not the detail), read `getImageData`,
bucket pixels into a coarse colour histogram, and take the most populous
buckets. Quantise hard: shifting each channel right by 4 bits gives 4096
buckets, which is enough to cluster and cheap to count.

**What will bite.**

- **Canvas tainting is not a risk here, and that is only true because of the
  blob rule.** Covers are same-origin object URLs, so `getImageData` is legal.
  If anything in this feature ever reaches for a remote image URL directly, it
  will throw a `SecurityError` — and the same rule that protects the export
  protects this.
- **Raw dominant colours are usually ugly as a poster ground.** Book covers are
  saturated and high-contrast; the literal top colour is often a near-black or
  a blaring red. Push each extracted colour toward a usable ground: clamp
  saturation, and take lightness to one of two ends (a pale tint or a deep
  shade) rather than using it as sampled. The colour should *recall* the covers,
  not match them.
- **Ink has to follow.** `inkForBackground()` in `domain/board.ts` returns white
  for anything that isn't a builtin, because uploads are unknowable. A sampled
  colour is entirely knowable — compute its luminance and pick
  `posterInk` / `posterInkDark` the same way the builtins do. `isLightInk` in
  `design/inkColors.ts` is the existing helper.
- **Recompute on book change, not on every render.** Extraction over 20 covers
  is not free. Memoise on the set of cover keys.
- **Fixed hex only.** The value is written into `board.background` and ends up
  inside the exported PNG. Never a `var()` — that bug already happened once.

**Done when** a poster with covers offers 4–6 grounds sampled from them, ink
flips correctly on each, and the export matches the preview.

---

## 1.2 Cover-only mode (edge to edge)

**What.** A flag on the board that drops the margins, the gap, and the title
band, and runs the covers full-bleed to all four edges.

**Why.** It is a completely different-looking poster for very little code, and
it is the one layout that says "this is about the books" without any words. Good
counterweight to the typographic default.

**Where it goes.**
- `Board` gains an optional flag. Name it for what it is —
  `coverBleed?: boolean` — and let `undefined` read as off, matching the
  `showRatings` precedent so existing boards keep their look.
- `layoutGrid()` in `domain/layout.ts` takes the flag and returns zero margins,
  zero gap, and a `gridTop` of 0.
- `Poster.tsx` hides the header and footer when it is on.

**What will bite.**

- **Covers are 2:3 and the frame is 9:16. They do not tile it.** Crop is the
  honest answer — cropping is the point of a bleed layout — and it breaks the
  app's oldest promise, "slots match 2:3 so covers never crop", which is written
  into `tokens.ts`. For this mode only that is correct; say so in the comment or
  the next reader will read it as a bug.

  **Resolved 2026-08-15, and the arithmetic decides more than the crop.** How
  much of a cover survives depends entirely on how far the slot's aspect sits
  from 2:3, and across the catalogue that ranges from a trim to a mutilation:

  | shape | cover lost |
  |---|---|
  | 2x2, 3x3, 4x4 (and 1x1) | **16%** |
  | 5x4 | 32% |
  | 4x3 | 37% |
  | 3x2 | 44% |
  | 5x3 | 49% |
  | 2x1, 4x2 | 58% |
  | 5x2 | **66%** |

  The 16% row is not a coincidence: the frame is 9:16, so a grid whose
  columns-to-rows ratio equals the frame's own produces slots that are
  themselves 9:16 — the square shapes. So **bleed cannot be a free flag on any
  layout**; on a 5x2 it destroys the artwork with no warning, and the reader
  would have no way to tell that the shape rather than the mode was at fault.
  `supportsCoverBleed()` gates it to square grids.
- **The title has nowhere to go.** Either it is off in this mode, or it
  overlays the covers with a scrim. Overlaid is the better poster — pick that,
  and reuse the gradient-scrim approach `PosterSlot` already uses for stars.
- **Ratings get busy fast** with no gaps between covers. Consider forcing them
  off in this mode, or accept it and let the reader decide.

**Done when** the flag produces a full-bleed poster that exports identically to
the preview, and turning it off restores the previous look exactly.

---

## 1.3 A top-book mark

**What.** Mark one book on the poster as the month's favourite — a small
typographic mark on its cover, or a subtly heavier treatment of its slot.

**Why.** It is the single most-asked question about anyone's reading month, and
right now a 5-star book and a 2-star book are the same size on the poster.
Cheap, and it makes the poster read as authored.

**Where it goes.**
- `Board` gains `favouriteBookId?: string`. On the board, not the book — the
  same book can be a favourite in one month and background in another, and
  `Book` is shared across posters.
- `PosterSlot` takes an `isFavourite` prop and renders the mark.
- Set it from `BookDetailsEditor`, and/or `BookList` — a star toggle on the row.

**What will bite.**

- **The mark must be sized from `slotWidth`**, exactly like `STAR_WIDTH_RATIO`.
  This trap has now caught the project twice, and it is written up under
  "Grid-relative sizing" in `CLAUDE.md`. Do not introduce a fixed px.
- **It must survive `resizeGrid` and `clearSlots`.** If the favourite book falls
  off the poster, clear the id — a dangling `favouriteBookId` will render
  nothing and confuse the next edit. Handle it in `domain/board.ts` where the
  slot mutations live, not in the component.
- **Fixed hex, again**, if the mark is coloured.
- **What the mark actually is** is a design decision worth making deliberately.
  A gold corner fold, a thin rule under the cover, a small numeral. Avoid a
  badge — a rounded pill on a cover reads as UI chrome, not artwork.

---

## 1.35 Very small posters — one book, two books

**What.** Grid shapes below the current floor of four. A single book filling the
poster; two side by side or stacked.

**Why.** The smallest poster the app offers is 2x2, which forces a reader with
one book they loved into a grid with three empty rectangles. A single-book
poster is also a genuinely different object — closer to a book announcement or a
favourite-of-the-year than to a reading list — and it is the shape most likely
to be posted on its own.

**Where it goes.** `GRID_LAYOUTS` in `types/domain.ts` gains `{ columns: 1, rows:
1 }` and `{ columns: 2, rows: 1 }`. Both satisfy rows <= columns, so the
geometry rule holds and `layoutGrid` needs no change to place them.

**What will bite.**

- ~~**A 1x1 slot will come out height-bound, around 620px wide.**~~ **Wrong —
  checked 2026-08-15.** It lands at the full **936px, width-bound**, at the
  designed 72px margin like every other offered shape. The prediction only
  considered the comfortable height; `layoutGrid` also has a *generous* path
  that lets a tall grid claim the bottom clearance down to `gridBottomMin`, and
  at one row that is more than enough. The single case that does go
  height-bound is a caption **with** a title plate, which drops it to 852px and
  114px side margins — a mild stranding on the poster least likely to be
  crowded. No taste call needed.
- **`{ columns: 2, rows: 1 }`** is width-bound and fills the frame too.
- **A single cover carries the whole poster**, so cover quality matters much more
  than it does at 4x4. Worth pairing with 1.3's top-book mark, or with the
  book's title set large beneath it.
- ~~**Adding shapes below the floor changes what an old oversized board
  migrates to.**~~ **Wrong — checked 2026-08-15.** `nearestOfferedGrid` first
  *filters* to layouts whose capacity is >= what the old board held, and only
  then sorts. A shape smaller than the floor can never enter that set for a
  board that was oversized. `migrateBoard` is unaffected.
- **`MAX_GRID_CAPACITY` is unaffected** — it takes the max, and these are minima.

**Recommendation.** Do `2x1` first and look at `1x1` on a real cover before
committing to it.

## 1.4 Non-uniform layouts

**What.** Compositions that are not equal cells in reading order. A hero layout
(one cover at double size, the rest ranged beside it), a shelf, a ranked column.

**Why.** This is the real design work in Tier 1, and the thing that would make
two people's posters look genuinely unalike. The nine grid shapes are all the
same *idea*; this adds an axis the app does not currently have.

**Where it goes.** This is the item that needs an architectural change rather
than a flag.

- `layoutGrid()` currently returns **one** `slotWidth`/`slotHeight` for the
  whole board. A hero layout means geometry becomes **per-slot**.
- The change: return a `slots: SlotBox[]` array — `{ index, x, y, width,
  height }` — and let the uniform grid be one generator among several. The
  existing nine layouts become `uniformLayout(grid)`, and `heroLayout()`,
  `shelfLayout()` sit beside it.
- `Poster.tsx` stops using CSS grid and absolutely positions each slot from its
  box. That is a real rewrite of the render, but a small one, and it makes the
  poster geometry fully explicit — which is the direction `layout.ts` already
  leans.

**What will bite.**

- **The 2:3 lock and the "rows ≤ columns" rule are consequences of uniform
  geometry.** Once slots differ in size, the rule stops applying as written and
  each composition has to be checked on its own for stranded margin. Do the
  arithmetic per layout; do not assume.
- **`GRID_LAYOUTS` is currently the whole catalogue and several things read it**
  — `MAX_GRID_CAPACITY`, `nearestOfferedGrid`, the import overflow warning, and
  `migrateBoard`. If compositions have capacities, they need to participate in
  that or be explicitly excluded. Decide before writing code.
- **`migrateBoard` must leave old boards alone.** Every existing board is a
  uniform grid; the migration path only needs to not break, not to convert.
- **The picker gets harder.** `GridPicker` currently offers capacity-first,
  which is right for uniform grids. Compositions are a *shape* choice, so they
  probably want their own control rather than being mixed into the capacity
  list.

**Recommendation.** Do this after 1.1–1.3. It is the most valuable Tier 1 item
and the only one that can destabilise what already works.

---

# Tier 2 — Beyond the single PNG

## 2.05 Tell the reader when a new version is ready

**What.** A small prompt when the service worker has a new build waiting, with
one tap to take it.

**Why.** The app is a PWA with `registerType: 'autoUpdate'`, so new versions are
already fetched in the background — but they activate silently on some later
load. That is why pulling to refresh works *sometimes*: it depends on whether
the worker happened to finish, and there is no way to tell from the outside.
Installed to a home screen there is no address bar either, so the gesture is the
only lever available, and it is a guess.

This turns "pull down a few times and hope" into "a new version is ready, tap
to load it."

**Where it goes.** `vite-plugin-pwa` exposes `useRegisterSW` (from
`virtual:pwa-register/react`), which gives a `needRefresh` signal and an
`updateServiceWorker(true)` call that activates the waiting worker and reloads.
The plugin is already configured in `vite.config.ts`; this is the client half
that was never wired up.

A small banner above the action bar is enough — this is not a modal-worthy
event, and it must not cover the poster.

**What will bite.**

- **`registerType: 'autoUpdate'` and a manual prompt are slightly at odds.** With
  autoUpdate the plugin registers a worker that skips waiting on its own. To
  offer a real choice, this wants `registerType: 'prompt'` instead — otherwise
  the banner is announcing something that already happened.
- **A virtual module needs its types.** Add `vite-plugin-pwa/client` to the
  `types` array in `tsconfig`, or the import will not typecheck.
- **It cannot be tested on the dev server.** Service workers only behave
  realistically against a built, served app — `npm run build` then `npm run
  preview`, or the deployed Pages site.
- **Two tabs open on the same app** both get the prompt. Harmless, but the
  reload in one does not dismiss the other.

**Worth doing before the tier work**, since every tier item ships through this
same update path and "did my change actually land?" is a question that will come
up on every single one.

## 2.1 Sticker-safe layout

**What.** A layout mode that reserves a clean, empty band sized for an Instagram
poll or question sticker, so the reader can drop "which should I read next?"
onto the poster without covering a cover.

**Why.** This is the cheapest honest answer to "make sharing interactive." The
app does not build interactivity — Instagram already has it, in the sticker
layer — and the app's job is to leave room for it. The precedent already exists:
`gridBottom` is 260 rather than a visual value precisely because Instagram
overlays reply controls.

**Where it goes.** `tokens.poster` gains a sticker reserve; `layoutGrid`
subtracts it when the mode is on. Almost entirely a tokens-and-arithmetic
change.

**What will bite.** The band has to be big enough to actually hold a sticker
(a poll is roughly a third of the frame width and ~180px tall at 1080×1920) and
placed where people put them, which is the lower-middle third. Reserving too
little is worse than not reserving — it implies safety that isn't there.

---

## 2.2 Other frames — 1:1 and 4:5

**What.** Export square for the feed, and 4:5 for the taller feed post.

**Why.** Stories expire; feed posts don't. A reading poster is exactly the kind
of thing people keep.

**Where it goes.** `POSTER` in `tokens.ts` is already
`{ width, height, aspectRatio }`, and `layoutGrid` derives from it — so the
mechanism is closer than it looks.

**What will bite.**

- **`POSTER` is a module-level `const` and is imported directly in at least
  `Poster.tsx`, `layout.ts`, and `exportPoster.ts`.** Making the frame a board
  property means threading it through all three. Not hard, but not a one-liner.
- **The nine grid shapes are derived from 9:16.** "Rows ≤ columns" comes from
  the frame being tall and the slots being 2:3. At 1:1, the constraint is
  different and the offered shapes change. Each frame needs its own catalogue,
  derived the same way rather than guessed.
- **`gridBottom: 260` is a Story-specific value** — it exists for Story reply
  controls, which a feed post does not have. It should not carry over unchanged.
- **`posterFileName()` needs the frame in the name**, or exports overwrite each
  other.

---

## 2.3 Motion

**What.** Export a short video — covers landing one at a time, background
drifting — instead of a still.

**Why.** It is the only item in this document that changes how the post
*performs* rather than how it looks. Stories accept video, and motion in a feed
is a genuine advantage.

**Where it goes.** A new export path beside `posterToBlob`, not a change to it.

**What will bite — read before committing to this one.**

- **`html-to-image` produces one frame.** It is not an animation tool. Motion
  means either capturing N frames and encoding them, or animating a real canvas.
  Both are a different rendering path from the poster DOM — which runs directly
  against the app's founding rule that preview and export are the same DOM.
  That rule is why exports match. Breaking it for video is *defensible*, because
  a video is a different artefact from the poster, but it must be a deliberate
  decision and the still export must not start going through the new path.
- **`toBlob` per frame is far too slow** for anything beyond a couple of seconds
  — expect hundreds of ms per frame. A 3-second clip at 30fps is 90 captures.
  The realistic approach is to capture the poster **once** as a still, then
  animate *that image* on a canvas (pan, fade, covers revealing via clipping) and
  record with `MediaRecorder`. One capture, real-time encode.
- **`MediaRecorder` output is WebM on most browsers, and Instagram wants MP4.**
  Safari on iOS — the most likely device for this app — has the weakest support
  of the lot. Check `MediaRecorder.isTypeSupported` before offering the button
  at all, and expect to fall back to the still.
- **This is the heaviest item in the document.** Budget a week, not an evening,
  and treat it as optional.

---

## 2.4 Multi-page export

**What.** Split a long month across two posters and export both — a carousel.

**Why.** Twenty books at 5×4 is dense; two posters of ten is comfortable, and
Instagram carousels perform well.

**Where it goes.** Mostly a loop over the existing export, plus a way to say
"books 1–10 / 11–20." Least risky item in Tier 2.

**What will bite.** Naming, so the pair stays in order (`-1of2`), and the fact
that `navigator.share` takes an array of files — which is better than two
separate downloads on a phone.

---

# Tier 3 — The shared link (deferred, but cheaper than it looked)

**Do not build this yet.** It is deferred by decision, not by difficulty. But
the cost estimate in the original discussion was wrong in an important way, and
the correction is worth having written down before the decision gets revisited.

## The finding: the covers do not go in the URL

The instinct that a share link needs hosted storage assumes the *images* have to
travel. They do not. A book on a poster is an **identifier** — an Open Library
cover id, or an ISBN13. Thirteen characters. The receiving app re-fetches the
covers from the same two catalogues `api/bookSearch.ts` already queries.

The arithmetic:

- Base64-encoding the actual cover blobs: ~25KB per cover, ×1.37 for base64,
  ×12 books ≈ **410KB**. Practical URL limits are 8–32KB. Impossible.
- Encoding identifiers instead: ~13 chars per book, plus title and author for
  the coverless case, plus the board's design settings. A 20-book poster lands
  in **well under 1KB**, and compresses further.

So a share link is a **URL, not a database**. No server, no accounts, no
per-user cost, no bandwidth bill — and, crucially, the app stays exactly as
offline and private as it is now. It also stays on GitHub Pages.

## What that would look like

- `encodeBoard(board, books) → string` — design settings plus a compact book
  list. Use `CompressionStream('deflate-raw')` (available in every modern
  browser, no dependency) then base64url. Not JSON in the URL directly; it
  wastes the budget on punctuation.
- A route that reads the hash, decodes, and rebuilds a board in local storage —
  then resolves covers through the existing `resolveCoverForBook()` path, which
  already handles "I know the ISBN, find me a cover."
- **Put the payload in the URL fragment (`#`), not the query string.** A
  fragment is never sent to the server, which on GitHub Pages means it cannot
  hit a request-length limit or land in an access log.
- A QR code is the same string, and is the better handoff in person — which is
  the actual use case here (a sister, two friends).

## What still argues against it

- **A long URL is ugly to share**, and this is a real objection, not a cosmetic
  one. A QR code fixes in-person handoff; it does not fix pasting a 900-character
  link into a DM.
- **Cover re-resolution can fail.** The receiving side gets identifiers, and
  Open Library may not have the cover the sender had — manual uploads
  especially, which have no identifier at all and simply cannot travel this way.
  The received poster is a *reconstruction*, and will occasionally have holes.
  That is honest and should be shown, not hidden.
- **There is no demand yet.** Four people, all of whom can be handed a phone.

## If it ever does become a hosted app

The Vercel + Upstash instinct is sound and the shapes are small. Two notes for
that future session:

- The app's data model is already clean enough to move — boards and books are
  plain serialisable objects and `storage/db.ts` is a narrow seam. Swapping
  IndexedDB for a remote store is a repository-shaped change, not a rewrite.
- **Covers are the only hard part.** They are blobs, and blobs are the thing
  that does not want to live in a key-value store. Blob storage (Vercel Blob,
  or equivalent) is the piece that turns this from a weekend into a bill.
- Do the URL version first regardless. It is a fraction of the work, it answers
  the same need for a group this size, and if it turns out nobody uses it, that
  is the cheapest possible way to learn it.

---

# Suggested order

~~0. **2.05 The update prompt**~~ — **shipped 2026-08-15.**
~~1. **1.1 Cover-derived palettes**~~ — **shipped 2026-08-15.**
~~2. **1.2 Cover-only mode**~~ — **shipped 2026-08-15**, gated to square grids.
~~3. **1.3 Top-book mark**~~ — **shipped 2026-08-15.**
~~—. **1.35 Small posters**~~ — **shipped 2026-08-15**, both 1x1 and 2x1.

Remaining, in order:

1. **2.1 Sticker-safe layout** — nearly free, and the honest answer to the
   interactivity question.
2. **1.4 Non-uniform layouts** — the real design work, and now the only Tier 1
   item left. It touches `layoutGrid` for everyone, so it wants a session of its
   own. Note that `bleedLayout()` is already a second generator sitting beside
   the uniform one — the shape this item proposes is half-started.
3. **2.4 Multi-page export** — low risk, real benefit for long months.
4. **2.2 Other frames** — worthwhile, but re-derive the grid catalogue per
   frame rather than reusing 9:16's. Note that `supportsCoverBleed` is derived
   from the 9:16 frame too, and would need re-deriving with it.
5. **2.3 Motion** — heaviest, most optional, and needs its own decision about
   the second rendering path.

Tier 3 stays parked. Revisit when someone outside the four people asks for it.

---

## Progress log

*(Append dated entries here as items ship — what landed, which files, what was
found along the way, what was left.)*

- **2026-08-15** — Doc written. Nothing from the tiers built yet.

- **2026-08-15** — Two bugs found in real use and fixed. Neither is a tier item;
  both are noted here because they touch code the tiers will build on.

  **Export split into save and share.** `downloadPoster()` opened the OS share
  sheet whenever the browser could take files, so the download never ran on
  Android — the button labelled Download had never downloaded. Now
  `savePoster()` / `sharePoster()` / `canSharePoster()` in
  `export/exportPoster.ts`, behind a two-row `ExportSheet` modal. **Relevant to
  Tier 2:** multi-page export (2.4) and motion (2.3) both add export paths, and
  they should be new rows in that sheet rather than new buttons in the bar.

  **Uploads are downscaled before storage.** `storeUploadedImage()` wrote the
  `File` in byte for byte, so an Unsplash background sat in IndexedDB at 4000px+
  for a 1080px poster and the browser rescaled ~24 megapixels per repaint. New
  `api/resizeUpload.ts` (1400px longest edge, quality 82 — the same numbers the
  build script uses) plus `shrinkStoredUploads()` in `storage/db.ts` for images
  already stored, run unawaited after first paint. **Relevant to Tier 1.1:**
  cover-derived palettes sample stored blobs, and they are now predictably
  sized — extraction will not be handed a 24-megapixel bitmap.

  Both are written up in `CLAUDE.md` under their own headings.

- **2026-08-15** — **Tier 1 built, plus 2.05.** Four items shipped in one
  session, in the order the doc suggested. Two of the doc's own predictions
  turned out to be wrong; both are corrected in place above and recorded here.

  **2.05 The update prompt.** `UpdateBanner` in `components/chrome/`, using
  `useRegisterSW`. `registerType` flipped from `autoUpdate` to `prompt` in
  `vite.config.ts` — the pair the doc called out, and it is a real pair: under
  autoUpdate the banner would announce something that had already happened.
  `vite-plugin-pwa/client` added to `tsconfig.app.json`. The banner sits between
  the stage and the action bar in the shell's flex flow, so it never covers the
  poster. **Cannot be verified on the dev server** — service workers need a
  built, served app.

  **1.1 Cover-derived palettes.** New `design/palette.ts` (pure, no React) and
  `hooks/useCoverPalette.ts`. Six grounds — a pale and a deep treatment of each
  of the three most populous colours across all the board's covers, counted in a
  4096-bucket histogram. The doc's warning about raw dominant colours was right:
  extraction keeps the *hue* and overrides saturation and lightness, so the
  ground recalls the covers rather than matching them. Near-black, near-white
  and near-grey pixels are skipped, or every poster comes out the same grey.
  `inkForBackground()` now answers properly for `kind: 'color'` instead of
  defaulting to white — a colour the app computed is knowable.

  Worth noting for 1.4: extraction is **async** (it decodes blobs), so it could
  not be a `useMemo`. The doc's "recompute on book change" understated it.

  **1.35 Small posters.** `1x1` and `2x1` added to `GRID_LAYOUTS`.

  Two doc claims corrected. **`nearestOfferedGrid` was never at risk** — it
  filters to layouts with capacity >= the old board's, so shapes below the floor
  can never be selected for an oversized legacy board. And **1x1 is not
  height-bound**: the doc predicted ~620px wide with stranded margin, but
  `layoutGrid`'s generous path lets a tall grid claim the bottom clearance, so
  it lands at the full 936px, width-bound, at the designed 72px margin like
  every other shape. The one exception is a caption *with* a title plate, which
  drops it to 852px. So 1x1 is a good shape, not a taste gamble.

  **1.3 Top-book mark.** `favouriteBookId` on `Board` — on the board, not the
  book, for the reason the doc gives. The mark is a **gold rule** across the
  foot of the cover, sized from `slotWidth` via two ratios beside
  `STAR_WIDTH_RATIO`. Not a fold: the poster is flat ink on flat art everywhere
  else and a fold implies a depth nothing else has. Gold rather than a new
  accent, since the poster already reads gold as "this book scored well".

  Dangling ids are cleared by `withValidFavourite()` in `domain/board.ts`,
  applied in `resizeGrid`, `setSlotBook` and `fillSlots`, with `clearSlots`
  dropping it outright. Domain, not component, as the doc asked.

  The toggle is a star on each `BookList` row. That meant restructuring the row:
  it was a single `<button>`, and the star cannot nest inside one.

  **1.2 Cover-only mode.** `coverBleed` on `Board`, `bleedLayout()` in
  `layout.ts`, scrimmed title and caption over the covers.

  **The doc left the crop question open and the arithmetic answers it.** With
  zero margin and gap, how much of each cover survives depends entirely on how
  far the slot's aspect sits from 2:3 — and it is not close for most shapes:
  5x2 loses **66%** of every cover, 2x1 and 4x2 lose 58%, 3x2 loses 44%. But
  every shape whose columns-to-rows ratio equals the frame's own 9:16 lands on
  the same **16%** — a trim off the top and bottom that looks intentional. Those
  are exactly the square grids.

  So bleed is **not a free flag on any layout**. `supportsCoverBleed()` gates it
  to square shapes, and the switch explains what the shape must be rather than
  producing a ruined poster silently. The flag persists across an unsupported
  shape so returning to a square grid restores the mode. Ratings force off in
  bleed (`board.showRatings` untouched), and empty slots lose their inset rule —
  with covers meeting edge to edge it would draw a grid over a single surface.

  **Left for its own session: 1.4 non-uniform layouts**, unchanged from the
  doc's recommendation. It rewrites `layoutGrid`'s return type for every board.

- **2026-08-16** — **Two fixes from Ruthnie's first look at the Tier 1 work.**
  Both were cases of correct reasoning reaching a wrong result.

  **The palette showed the same swatch five times.** Selecting the top three
  buckets by population gave three shades of one red, because that is what a
  book-cover histogram looks like. Real output from four covers: `#eddee0`,
  `#451c20`, `#eddedf`, `#451c1f`, `#eddee0`, `#451c20` — two pairs differing by
  one hex digit, which the exact-match dedupe could not see. Source colours are
  now required to be separated on the hue wheel *at selection time*, with
  near-greys held to a saturation test instead since hue is noise down there.
  Same simulated input now yields six genuinely different grounds.

  **The favourite mark did not read as a favourite.** It was a gold rule across
  the foot of the cover, argued for on the grounds that a badge reads as UI
  chrome and a rule reads as artwork. Both true, and it was still wrong: a
  horizontal line does not *mean* anything, and on a busy cover it was invisible
  besides. Ruthnie: "a gold bar that doesn't really read as favorite."

  Now a gold star in the top corner on a soft radial glow — the star carries the
  meaning with no legend, and the glow solves the same contrast problem the
  rating band solves with a scrim, without an edge that would read as a badge.
  In bleed mode it moves to the bottom-left, since the title scrim is 560px deep
  and swallows the top row on a 2x2.

  **The lesson worth keeping:** the rule was chosen by reasoning about what a
  mark should *look* like and never checking whether it would be *understood*.
  A mark on the artwork has to answer "what does this tell me about this book?"
  before it answers "does this look like part of the design?"

- **2026-08-16 (second pass)** — Ruthnie put a real poster on screen, and both
  1.1 and 1.3 needed another round. Both had shipped defensible reasoning that
  did not survive contact with actual covers.

  **The favourite star collided with the rating stars.** Her screenshot showed
  *The Boy on the Bridge* with a gold star in the corner and four gold rating
  stars along the foot — same glyph, same colour, two meanings. She had flagged
  the risk before it was visible ("we already have star ratings... that might be
  confusing if both of those settings were turned on") and suggested a crown.

  Now a **white crown** on the radial glow, drawn as an inline SVG (`CrownMark`)
  rather than a glyph — the Unicode crown is emoji-presentation on most
  platforms and would render differently per device or not at all, which is
  unacceptable inside an exported PNG. White rather than gold so it cannot
  borrow the rating's colour. The `BookList` toggle follows, in accent rather
  than gold, since those rows show gold stars too.

  **The palette's grounds did not look like the books.** "Three different types
  of kind of, like, off whites... I don't know where they're pulling the colors
  from." Correct: `asGround()` clamped saturation to 28% and lightness to
  0.9/0.19, so Fahrenheit 451's `#ce2a1e` became `#eddfde` and Koli's foliage
  green became `#e7edde` — nearly every cover collapsing to the same neutrals.
  The clamps are proportional now, so a bold cover gives a bold ground:
  Fahrenheit yields `#ebc5c2` / `#631c17`, Koli's green `#d9e0cc` / `#424f2b`.
  `MIN_USEFUL_SATURATION` went 0.12 → 0.25 so cover ink stops producing greys.
  Contrast re-verified after the change: 10.1:1 worst on tints, 6.3:1 on shades.

  **The lesson, and it is the same one twice:** both features were tuned for
  the failure mode that could be reasoned about in the abstract — an ugly
  ground, a mark that looked like UI chrome — and neither was checked against
  the question a user actually asks. "Where did this colour come from?" and
  "what does this mark mean?" are the tests. A contrast table cannot answer
  either.

  **Also caught:** `npx tsc --noEmit` passed on a reference to a constant that
  did not exist (renamed declaration, un-renamed use). Only `oxlint` saw it, via
  the orphaned declaration. It would have been a `ReferenceError` on any poster
  with a favourite. Run both.

  **And a pre-existing bug, unrelated to the tiers.** Search results came out
  uneven and pushed past the drawer's edge when one cover's source image was
  larger than the others. Not an image problem: `.result` is a grid item, grid
  items default to `min-width: auto`, and so a wide cover widened its own track
  past the `1fr` it was allotted. `object-fit: cover` does not help, because it
  governs painting inside the box rather than how big the box may get. Fixed
  with `min-width: 0` on the item plus explicit widths on the tile and image;
  written up in `CLAUDE.md` as its own heading, since any future grid of images
  will hit it.

- **2026-08-15** — Caption legibility. The handle was set at 30px against the
  1080px export canvas *and* dimmed to 0.85 opacity, which on a phone previewing
  at ~360px rendered around 10 CSS pixels of knocked-back type over a busy
  background. Unreadable. Now 40px at full opacity, and the title plate covers
  the caption as well — same `TitlePlate` object, so the two pieces of type
  cannot drift apart in colour or corner radius.

  The plate's padding then pushed the last row about 2px into the handle on the
  square grids, so `layoutGrid` derives its bottom floor from what is actually
  printed at the bottom rather than a fixed 150. `GRID_TO_CAPTION_GAP` is 64
  rather than the 24 that technically cleared — a hairline between covers and
  handle reads as a collision whatever the arithmetic says. Costs about 3% of
  slot width on 2x2, 3x3 and 4x4; the wider shapes are untouched.

  **Noted while checking it, not addressed:** there is more space above the
  title than the design needs. `titleTop` is 132 and the title band sits at the
  top of a 1920px frame, so a poster with a short title reads as slightly
  bottom-heavy. Fine as it stands, and worth a look during any layout work —
  particularly 1.4, which rebuilds the geometry anyway.
