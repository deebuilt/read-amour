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

## 2.1 Sticker-safe layout — DROPPED 2026-08-16

**Not deferred. Dropped, and the reasoning is better than the plan's.**

Ruthnie: *"You don't even know if it's accurate until you actually export and
then load it into the story. So I don't see the point in bothering with a
feature just to make some space."*

That is the section's own warning followed through to its conclusion. The
original text below says reserving too little is worse than not reserving,
because it implies a safety that is not there — but the band's correctness can
only be confirmed by exporting, opening Instagram, and dropping a real sticker
on it. A reserve that cannot be verified from inside the app is a guess the
poster pays for in slot width on every square grid, forever.

The sticker layer is also just an overlay the user positions by hand. Nothing
stops them putting a poll on a finished poster today.

Two further things found while assessing it, kept in case it is ever revived:
`bottomReserve()` in `layout.ts` is already the shape this needed — a derived
floor with a conditional term — so the arithmetic was genuinely small. And the
caption is in the way: `captionBottom` is 84 and the handle prints along the
bottom edge, so a lower-middle band is the caption block *plus* the sticker band
*plus* both gaps, not a simple `max`.

*Original section follows.*

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

## 2.2 Other frames — DROPPED 2026-08-16

**Dropped on demand, not on difficulty.** Ruthnie confirmed the 9:16 poster does
not fit a feed post — and in the same breath that *"everyone I know typically
just posts their reading history to their stories."*

Those two facts together kill the item rather than justify it. The frame does
not fit the feed; nobody is posting to the feed. Building a per-frame grid
catalogue so that a post nobody makes fits properly is plumbing for a use case
that does not exist. Revive it the day someone asks for a feed post.

Two corrections to the original section, so a future session does not
re-discover them:

- **`POSTER` is imported in six places, not the three listed below.** The two
  missed are `hooks/usePosterSize.ts` (fits the preview to the stage via
  `aspectRatio`; `MAX_POSTER_WIDTH` of 460 stops meaning what it means at 1:1)
  and `components/poster/PosterBackground.tsx` (tile size is
  `POSTER.width / TILE_REPEATS_ACROSS`).
- **`supportsCoverBleed()` is a 9:16 answer wearing a general disguise.** It
  reads `columns === rows`, which is *derived* from the frame being 9:16 and
  slots being 2:3 — see its own comment. At 1:1 it survives by coincidence; at
  4:5 it would silently return the wrong answer with no type error. The ordering
  notes flagged this; the section itself did not.

*Original section follows.*

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

## 2.3 Motion — the poster building itself, as a GIF

**Scoped and committed 2026-08-16.** The section below replaces the original,
which proposed a video and budgeted a week. What is actually being built is
smaller, and the reason it is smaller is that two constraints were removed by
decision rather than by cleverness: **no video, and no configuration.**

**What.** A third row in `ExportSheet` — *Save as a GIF* — that exports a
two-second animation of the poster assembling itself, covers appearing one at a
time in slot order.

**Why the original plan was wrong to price this at a week.** It budgeted for the
codec problem: `MediaRecorder` emits WebM where Instagram wants MP4, iOS Safari
is the weakest implementation of the lot, and proving what a given phone accepts
means testing across devices before a line of polish is worth writing. Choosing
GIF deletes all of that. Every platform takes a GIF, Instagram Stories convert
it to video on upload, and there is no format negotiation to get wrong.

### The founding rule is not broken, and that is load-bearing

The app's oldest rule is that preview and export are the same DOM. Motion looks
like it must break that, and the original section said so.

It does not, because of the shape chosen: **the poster is captured once**,
through the existing `posterToBlob` path, and the animation is produced by
drawing *that captured still* onto a canvas repeatedly with progressively more
of it revealed. There is no second rendering of the poster. What animates is the
PNG the user would otherwise have saved.

Slot rectangles come from `layoutGrid`, which already computes exactly the
geometry the reveal needs. Nothing new has to know how the poster is laid out.

### Where it goes

- New `src/export/posterGif.ts` — frame composition and encode. Beside
  `exportPoster.ts`, not inside it.
- `src/types/gifenc.d.ts` — the encoder publishes no types (~30 lines).
- `ExportSheet.tsx` — a third row. Its `busy` prop is already
  `'save' | 'share'`; it gains `'gif'`.
- `posterFileName()` needs an extension parameter. It hardcodes `.png` today.

### The encoder: gifenc

Researched 2026-08-16. `npm i gifenc` — **~4KB gzipped, pure ESM, MIT, no worker
file and no WASM.** That last part decided it: the app deploys to a
`/read-amour/` base path, and any encoder needing a separately-loaded runtime
asset means hand-plumbing `import.meta.env.BASE_URL` into a worker URL — the
class of thing that works locally and breaks on deploy.

| | size (min+gz) | last publish | worker/asset file | licence |
|---|---|---|---|---|
| **gifenc** | **~3.9KB** | 2021 (repo active 2024) | **none** | MIT |
| gif.js | ~28KB + worker | **2016** | **mandatory** | MIT |
| gifshot | ~40KB | 2017 | yes | MIT |
| modern-gif | ~14KB + 32KB worker | 2026 | optional | MIT |
| gifski-wasm | 688KB unpacked | 2025 | yes (.wasm) | **AGPL-3.0** |

Why each of the others is out:

- **gif.js** is the one everyone reaches for and it was last published in
  **December 2016** — 94 open issues, no maintainer. Its mandatory
  `gif.worker.js` is the base-path problem above, and Vite has a stack of open
  issues on exactly it. The popular `gif.js.optimized` fork is also from 2016.
- **gifshot** wraps gif.js and inherits everything.
- **gifski-wasm** produces the best-looking GIFs and is **AGPL-3.0**. Shipping
  it in a public client bundle is a distribution, which would put a copyleft
  obligation on this app. Ruled out on licence before weight.
- **modern-gif** is the honest runner-up — maintained, real types — but 3.5x the
  bundle and it wants a base-path-resolved worker asset too.

**There is no native path and none coming.** WebCodecs specifies `AudioEncoder`
and `VideoEncoder` only — video codecs, not image formats. `ImageDecoder` exists
and *reads* animated GIF, which is the confusing part, but there is no encoder
side and `ImageEncoder` is not in the spec at all. Do not re-check this.

### What will bite

- **gifenc has no dithering**, and its author says plainly it suits flat vector
  graphics rather than photographs. Book covers are photographs. This is the one
  real risk in the plan. Two settings carry it:

  **Use `rgb565`, never `rgb444`.** The repo's own worker example uses 444 — do
  not copy it, it was tuned for 150 frames at 1024². At 24 frames the speed
  difference is irrelevant and 565 is markedly better on gradients and skin.

  **Quantise the FINAL frame and use that palette for every frame.** This is
  specific to this animation and it is the good idea in the research: the last
  frame is the fully assembled poster, so it holds every colour that will ever
  appear and its palette is the correct superset. Per-frame palettes would make
  covers shift colour subtly as the poster builds — palette flicker, the ugliest
  artefact available here. It is also free file size, since every frame after
  the first then writes no colour table at all.

  If banding shows on gradient grounds, a Bayer 4x4 ordered dither is ~20 lines.
  Do not write it before seeing a real poster.

- **Capture at 540x960 directly, not 1080x1920 downscaled.** Twenty-four
  full-size bitmap decodes is the same memory spike that made
  `shrinkStoredUploads()` run sequentially. Halve on the way out of
  `html-to-image`.
- **No worker.** Encoding is ~0.3–0.6s on desktop Chrome and ~1.5–3s on a
  mid-range Android — fast enough on the main thread with a yield between
  frames. The capture dominates total time, not the encode.
- **The still export must not start going through this path.** Unchanged from
  the original section, and still the rule that matters most.

### Numbers

**Two seconds, ~12fps, 540x960.** Expect **~2–2.5MB**. The animation is ideal
for GIF frame differencing — a static ground means most of each frame is
unchanged pixels and LZW collapses those, so the first frame is heavy (~200KB)
and the rest are cheap.

Levers if it comes in fat: **405x720** (44% fewer pixels; Instagram recompresses
anyway) or **10fps**. Both barely perceptible on an assembling animation.

**Duration is fixed and frames divide among however many covers there are.** A
2x2 reveals four covers over two seconds, a 4x4 reveals sixteen over the same
two. That difference is real and the reader feels it — but she finds out by
making one, not by reading about it in a drawer. It also keeps file size
predictable across every grid shape.

### The UI: nothing before export

No GIF settings anywhere in the design drawer, no animation preview, no timing
control. The poster is built exactly as it is today; the choice appears at Save,
as a third row in the sheet that already exists.

This is not the cheap option, it is the correct one: **the animation has no
parameters.** Covers appear in slot order, which is the order she already
arranged them in. Duration is fixed. Frame size is derived. A settings panel
would be a panel of one button, and a live preview would be an animation looping
in the drawer while she is trying to pick a typeface.

Changing the poster and exporting again gives a different GIF, the same way it
gives a different PNG. There is no saved GIF state that can drift from the
poster.

**Progress.** The GIF takes visibly longer than the PNG. `ExportSheet` already
locks itself and relabels a busy row, so `'gif'` slots into that. Start with
"Building…" and only add a percentage if it feels long in testing — the encode
loop knows its frame index, so it is available.

### Two assumptions, recorded rather than blocked on

Both are taste calls that are cheaper to judge from a real GIF than to decide in
advance. Defaults chosen; overrule on sight.

1. **The ground does not move.** Covers reveal over a static background. The
   alternative — ground fades in first, then covers — is a beat longer and a
   bigger file for a subtler read.
2. **The title is present from frame one.** Having it type in makes the export
   read as a slideshow rather than as a poster assembling itself.

---

## 2.4 Multi-page export — DROPPED 2026-08-16

**Dropped for want of the problem.** It exists to rescue a month holding more
books than the largest grid's twenty. Twenty books in a month is a lot of books,
and 5x4 is already dense enough that this section calls it uncomfortable. The
case has not come up.

The real version of this problem is a **year in review**, not a month — and that
wants its own poster and its own design, not a carousel of two 20-grids.

One finding worth keeping if it is revived: this is *not* purely a loop over the
existing export, because **there is only ever one `Poster` in the DOM**
(`App.tsx` renders a single instance into `posterRef`). A second page means
either mutating `board.slots` and capturing between renders — which is visible
to the user and races the 50ms settle in `runExport` — or rendering a hidden
second `Poster` with a sliced slot array and its own ref. The second is right,
and it does not break the one-rendering-path rule: same component, same
intrinsic size.

*Original section follows.*

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

**Tier 2 was assessed in full on 2026-08-16 and three of its four items were
dropped.** Not deferred — dropped, each for a stated reason in its own section.
What survived is the one Ruthnie actually wanted, and it got cheaper in the
scoping.

Remaining, in order:

1. **2.3 Motion, as a GIF** — the poster building itself. Re-scoped from a week
   to a couple of hours by dropping video for GIF, and by having no
   configuration at all. Encoder chosen (`gifenc`). **In build.**
2. **1.4 Non-uniform layouts** — the real design work, and now the only other
   item left in the document. It touches `layoutGrid` for everyone, so it wants
   a session of its own. Note that `bleedLayout()` is already a second generator
   sitting beside the uniform one — the shape this item proposes is
   half-started.

~~**2.1 Sticker-safe layout**~~ — dropped: the reserve cannot be verified from
inside the app.
~~**2.4 Multi-page export**~~ — dropped: twenty books in a month has not
happened.
~~**2.2 Other frames**~~ — dropped: the poster does not fit the feed, and nobody
is posting to the feed.

**One consequence of the three drops worth noticing.** `GRID_LAYOUTS`,
`MAX_GRID_CAPACITY`, `supportsCoverBleed`, `nearestOfferedGrid` and
`posterFileName` were shared ground between 1.4 and 2.2, and the document
noticed it in two places without connecting them — a catalogue restructure that
would have had to be decided once and would in practice have been decided twice,
weeks apart, with a migration in between. With 2.2 gone, **1.4 owns that
catalogue alone.** Only `posterFileName` is touched by 2.3, and only to take an
extension.

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

- **2026-08-16 — Tier 2 assessed, three items dropped, one re-scoped and
  committed.** No code yet; this entry is the decision record the build works
  from. Every drop is written into its own section above with the reasoning.

  **What survives: 2.3 Motion, as a GIF.** The one item the original document
  ranked last, called "heaviest, most optional", and budgeted a week for. Two
  decisions collapsed it:

  **GIF instead of video.** The week was the codec problem — `MediaRecorder`
  emits WebM where Instagram wants MP4, iOS Safari is the weakest of the lot,
  and proving what a phone accepts means device testing before any polish is
  worth writing. Ruthnie: *"I don't wanna have to face compatibility issues."*
  GIF has none to face. Every platform takes it, and Instagram converts it to
  video on upload.

  **No configuration.** The animation has no parameters worth exposing — covers
  appear in slot order, duration is fixed, frame size is derived. So there is no
  drawer section, no preview, no timing control: a third row in the export sheet
  and nothing else. Ruthnie proposed this shape herself, including its
  second-order effect — the pacing difference between a 2x2 and a 4x4 is
  discovered by making one, which costs seconds, rather than being explained in
  a control she would have to think about while choosing a grid.

  **The founding rule survives, and that is the part that makes this cheap.**
  Motion looks like it must break "preview and export are the same DOM", and the
  original section conceded that it would. It does not: the poster is captured
  **once** through the existing path, and the animation is that single still
  redrawn on a canvas with progressively more of it revealed. Slot rectangles
  come from `layoutGrid`, which already computes them. No second rendering of
  the poster exists.

  **Encoder researched and chosen: `gifenc`.** ~4KB gzipped, MIT, pure ESM, and
  critically **no worker file and no WASM** — the app deploys to a
  `/read-amour/` base path, and any encoder needing a runtime-loaded asset means
  plumbing `import.meta.env.BASE_URL` into a worker URL, which is the class of
  thing that works locally and breaks on deploy. Full comparison table in 2.3.
  The headlines: **gif.js was last published in December 2016** and its worker
  is mandatory; **gifski-wasm is AGPL-3.0**, which would put a copyleft
  obligation on this app; **modern-gif** is the honest runner-up but 3.5x the
  bundle with a worker asset. And **there is no native path** — WebCodecs
  specifies `AudioEncoder`/`VideoEncoder` only, `ImageEncoder` is not in the spec,
  and `ImageDecoder` reads GIF but cannot write it. Recorded so nobody re-checks.

  **The known risk, stated plainly:** gifenc has no dithering and its author says
  it suits flat vector art rather than photographs. Book covers are photographs.
  Mitigated by `rgb565` (never `rgb444` — the repo's own example uses 444 and was
  tuned for a different job) and by quantising the **final** frame and reusing
  that palette globally, since the assembled poster is the colour superset of
  every frame before it. That also prevents palette flicker, which would be the
  worst available artefact here.

  **Two taste calls recorded as assumptions rather than blocked on**, both
  cheaper to judge from a real GIF than to decide in advance: the ground does not
  move, and the title is present from frame one.

  **Estimate: two to three hours**, against Ruthnie's expectation of a couple and
  the document's original week. Said as a range rather than promised at ninety
  minutes. The encode turned out to be the small part; the frame composition and
  the capture-at-half-size path are where the time goes.

  **Why three items were dropped rather than parked.** Each failed a demand test,
  not a difficulty test, and each is worth reading in its own section — but the
  pattern across them is one thing: they were all answers to problems nobody in
  this app's four-person audience currently has. The sticker band reserves space
  whose correctness can only be checked by leaving the app; multi-page rescues a
  twenty-book month that has not occurred; other frames fits a feed post nobody
  makes. **Ruthnie's own reasoning killed 2.1 and it was sharper than the
  document's** — the plan warned that reserving too little implies a safety that
  is not there, and she pointed out the reserve cannot be verified from inside
  the app at all.

  **A structural consequence, noted in the ordering section.** `GRID_LAYOUTS` and
  its four readers were shared ground between 1.4 and 2.2 — a catalogue
  restructure the document noticed twice without connecting, which would have
  been decided twice with a migration in between. With 2.2 gone, **1.4 owns it
  alone.**

- **2026-08-16 — 2.3 built. Awaiting Ruthnie's first look.**

  Files: new `export/posterGif.ts` and `types/gifenc.d.ts`; `exportPoster.ts`
  gains `saveBlob()` and an extension parameter on `posterFileName()`;
  `ExportSheet` gains a third row and an `ExportIntent` type; `App.tsx` routes
  the new intent and tracks progress.

  **The plan survived the build.** No corrections to the scoping — the capture
  path, the encoder choice, the palette strategy and the UI shape all landed as
  written. What follows is what the build added to it.

  **Reveal geometry is derived from `layoutGrid`, not remeasured.**
  `revealRects()` calls the same function the poster lays out with and scales
  the result. So this module knows no poster geometry of its own and cannot
  drift from it — which matters because 1.4 is going to change that geometry for
  everyone.

  Verified against all eleven shapes, with and without a caption plate, in bleed
  mode, on sparse boards and on an empty one: **every rectangle in bounds.** Two
  numbers cross-check the doc's own arithmetic — 1x1 lands at 936 poster px
  width-bound and drops to 852 with a caption plate, exactly as recorded under
  1.35, and bleed tiles the frame exactly on all four square shapes.

  **Frames where nothing changes are skipped**, their time folded into the
  previous frame's delay. At 12fps a four-cover poster would otherwise write the
  same picture three times running. A 2x2 comes out 5 frames, a 4x4 17, a 5x4
  21 — rather than 25 apiece.

  **File size came in under estimate: 1.38MB worst case** (5x4), against the
  2–2.5MB predicted. Measured on synthetic frames carrying per-pixel random
  noise, which is the hardest case for LZW — real cover art compresses better,
  so treat it as a ceiling. Container validated by hand on every shape: correct
  `GIF89a` signature, 540x960 logical screen, NETSCAPE loop block present,
  proper trailer.

  **Encoding is ~800ms for a 4x4**, including synthetic frame generation far
  slower than the canvas path the real code uses. The no-worker decision holds
  comfortably.

  **One real bug, caught by the build and not by the typecheck.** `tsc --noEmit`
  passed; `tsc -b` failed on `Uint8Array<ArrayBufferLike>` not being assignable
  to `BlobPart`. TypeScript 5.7 made `Uint8Array` generic over its buffer and
  the default admits `SharedArrayBuffer`, which `Blob` will not take. Fixed in
  the declaration by pinning the buffer to `ArrayBuffer` — true of what gifenc
  allocates, not a convenient assertion. Verified by reverting the fix and
  confirming the error returns.

  **This is the same lesson as the 2026-08-16 entry above, in a new form.** That
  one was `tsc --noEmit` passing on a constant only `oxlint` could see; this is
  `tsc --noEmit` passing on a type error only project-build mode could see.
  **`npx tsc --noEmit -p tsconfig.app.json` reproduces build-mode strictness
  without running a build** — use it, since the full build costs a dev-server
  restart.

  **Untested until Ruthnie runs it:** the visual result. The known risk is
  unchanged — gifenc does no dithering and book covers are photographs, so
  banding on gradient grounds is the thing to look for. Bayer 4x4 is the answer
  if it shows, ~20 lines, deliberately not written on speculation.

- **2026-08-16 — Ruthnie's first look. Two bugs, one of them not about GIFs at
  all.**

  **The animation flickered.** Three books on a 4x4 produced a roughly
  one-second loop of covers snapping in. Her words: *"it's just looping on a
  flicker, it's not very elegant."* No banding — the dithering risk did not
  materialise — and 157.9KB, far under the 1.38MB ceiling, which was itself the
  clue.

  The cause was a frame loop pretending to be a timeline. It stepped 12fps,
  skipped frames where nothing had changed — correct — and then wrote each
  surviving frame with a **single frame's delay of 83ms**. So the playback
  collapsed along with the frame count: three covers landed in ~250ms rather
  than across two seconds. The comment above the loop claimed the skipped time
  was folded into the previous frame's delay. It never was; that was written as
  intent and not implemented, and it is exactly the kind of claim a comment
  should not be trusted for.

  **A GIF frame's delay IS its duration** — there is no timeline underneath to
  fall back on. So a frame rate is the wrong thing to build this from. It is now
  written as **beats: one frame per cover, each held for the time it actually
  occupies.** Three covers is 400ms each, sixteen is 83ms, and the poster takes
  about the same two seconds either way. `FPS` survives only as a floor for the
  busy end — below ~80ms consecutive frames stop reading as separate events,
  which is the flicker again — so a full 5x4 runs slightly long on purpose.

  Verified across every capacity from 1 to 20: beat length, frame count and
  total run time all sane, floor engaging at 15+.

  **The phone could not run the app at all, and that is the more serious find.**
  Opening the LAN address on her phone gave a shell with no canvas, no books and
  an empty design drawer. Not a GIF bug and not a testing inconvenience:
  **`crypto.randomUUID()` is only defined in a secure context.** `localhost`
  qualifies, `http://192.168.x.x` does not. `createBoard()` calls it on first
  load, so the app threw before it had a board — after the shell had painted,
  with nothing shown to the user.

  Three call sites had it bare (`domain/board.ts`, `domain/manualBook.ts`,
  `api/covers.ts`). All now go through **`newId()` in `domain/ids.ts`**, which
  prefers the native generator and falls back to `crypto.getRandomValues`, then
  to `Math.random`, building a well-formed v4 either way. Verified in all three
  contexts: 50,000 ids each, all well-formed, all unique.

  Production was never affected — GitHub Pages is HTTPS. But it meant **the one
  device this mobile-first app is built for was the one device it could not be
  checked on**, and that had been true for the whole project. Every
  `navigator.share` call was already `typeof`-guarded; `crypto.randomUUID` was
  the only unguarded secure-context API in the codebase.

  **The lesson, and it rhymes with the two already in this log.** The flicker
  was a comment describing behaviour the code did not have. The phone failure
  was an API assumed universal because it works on localhost. Both passed
  typecheck and lint, and both were found in the first thirty seconds of real
  use — which is the third time in this document that reasoning survived review
  and did not survive contact.

- **2026-08-16 — GIF abandoned for MP4. The format was wrong, and it was wrong
  for a reason stated confidently and never checked.**

  Ruthnie uploaded the GIF to a Story: it arrived as a flat photo. No motion, no
  duration badge, none of the markers her live photos and videos get. TikTok
  would not recognise the file as media at all.

  **Instagram flattens uploaded GIFs server-side.** Its ingest transcodes images
  to JPEG and video to MP4, and a `.gif` enters that pipeline as an *image*, so
  it is reduced to its first frame. Unconditional, not a client bug, and not
  fixable by re-encoding. The only animation in Stories is the built-in GIPHY
  sticker integration, which is not a file upload at all. Android's gallery also
  commonly hands `.gif` to a picker as a still — real, but secondary, since
  fixing it would buy nothing.

  **This contradicts what § 2.3 asserted when GIF was chosen**: "every platform
  takes a GIF, and Instagram converts it to video on upload." The second half
  was false. It came from research, was written into this doc as fact, and was
  repeated to Ruthnie as the reason GIF "deletes the compatibility problem" —
  which is the basis on which she chose it. The compatibility problem was not
  deleted; it was moved to the end of the pipeline, where she found it.

  Worse, the plan had named the correct test and skipped it: *"it gets tested on
  your phone early — before the polish — because if Instagram rejects the file
  on your device, the whole thing stops there."* The whole feature was built,
  geometry and encoder and file size all verified, and the one test that decided
  whether any of it mattered was never run.

  **MP4 via WebCodecs + mediabunny**, and in 2026 it is the *cheaper* option
  rather than the expensive one:

  - **WebCodecs `VideoEncoder` is at ~94% support** — Chrome desktop and
    Android, Edge, Firefox 130+, Samsung Internet, Safari/iOS 16.4+ (whose
    "partial" support is video-only, which is exactly and only what is needed).
  - **H.264 Baseline (`avc`) is hardware-accelerated** on essentially all
    Android hardware, and the most universally decodable profile there is.
  - **mediabunny is ~5–25KB gzipped tree-shaken, MPL-2.0, zero dependencies,
    zero WASM, first-class TypeScript.** The ffmpeg.wasm tax that made browser
    video feel prohibitive — tens of megabytes of side-loaded assets — is simply
    not the situation any more.
  - **`mp4-muxer` is deprecated by its own author** in favour of mediabunny.
    Worth knowing, since it is the library most guides still reach for.
  - **`MediaRecorder` was considered and rejected.** Chrome does now support
    `video/mp4` recording, but it captures at wall-clock speed and drops frames
    under load. WebCodecs writes timing into each sample, so a two-second loop
    is frame-exact regardless of how fast the machine encodes.

  **What survived the swap: almost everything.** The capture-once approach, the
  reveal geometry derived from `layoutGrid`, the beat timing, and the export
  sheet were all format-agnostic. The encoder is the last stage of the pipeline.
  `posterGif.ts` became `posterVideo.ts`; `gifenc.d.ts` is gone.

  **Two things got better.** Frames now go at the full 1080x1920 rather than
  540x960 — GIF needed halving because pixel count dominates its file size,
  while H.264 has interframe compression and this animation (static ground,
  covers appearing) is close to its best case. And the file should come out
  smaller than the half-size GIF did.

  **One thing got genuinely harder, and it is the one real departure from the
  founding rule.** The reveal composites covers over a ground, and that ground
  cannot be made by erasing the covers out of the finished capture: **a video
  frame has no alpha channel**, so anything cleared to transparent encodes as
  solid black. Nor can it be reconstructed by guessing a colour, since the
  background may be photography and the part behind a cover is precisely the
  part never otherwise seen.

  So the poster is captured **twice** — once whole, once with
  `data-ra-hide-covers` set, which hides `img[data-ra-cover]` via
  `visibility` (not `display`, so nothing reflows and the two captures stay
  pixel-aligned). Both go through the same `posterToBlob` at the same intrinsic
  size. The founding rule is that preview and export are one rendering; both of
  these are that rendering, so it holds.

  **`canExportVideo()` gates the rows**, probed once via mediabunny's
  `canEncodeVideo` and cached — same reasoning as `canSharePoster()`: a device
  that cannot do this should not be shown a button that fails.

  **The share sheet gained a fourth row, and this is the part that matters on a
  phone.** "Share the video" hands the MP4 to `navigator.share()` with a
  `video/mp4` MIME type, which is what tells the OS to offer motion targets.
  That path goes straight into Instagram's composer and skips the gallery
  entirely — and the gallery is exactly where the GIF died, since a picker
  decides for itself what a file is. Saving still works and is still offered;
  the app does not choose which was meant. That is the same lesson
  `downloadPoster()` taught, applied before it could be broken again.

  **Untested until Ruthnie runs it.** The whole point of this entry is that the
  previous format shipped verified-but-useless, so nothing here is polished,
  cleaned up or documented further until an MP4 has actually posted to a Story
  from her phone.

- **2026-08-16 — The video became an animation. Four findings, and the last one
  is the one that mattered.**

  **The length is the reader's, not the encoder's.** Six timing constants —
  per-cover beat, a floor under it, a reveal budget, a minimum total, two end
  holds — were all invented in `posterVideo.ts` and all wrong twice running:
  first a two-second total inherited from the GIF, then a three-second
  replacement chosen because two had felt short. None was derived from anything.
  Frames carry their own durations, so a long clip costs the same to produce as
  a short one; Instagram's ceiling is 60s per card and nothing here approaches
  it. **There was never a limit to protect.** All six are gone, replaced by a
  slider in the export sheet — 2 to 15 seconds — with the opening beat and
  closing rest as *proportions* so the shape holds at any length.

  Caught while verifying: a one-cover poster came out at 38% of the chosen
  length, because 62% of the clip was allotted to gaps that do not exist. The
  remainder goes to the closing rest now. Every duration × cover count is exact.

  **The export sheet groups by artefact.** Four actions are really a two-by-two —
  still or animation, kept or handed off — and flat they read as four unrelated
  buttons. Worse, the length control governs both video rows and neither image
  row, so anywhere in a flat column it looked like a setting on whatever sat
  above it. Ruthnie: *"I wouldn't know what the animation length thing is
  doing."* Now two groups with the control heading the animation one. A nested
  version (choose kind, then destination) was built first and discarded: it cost
  a tap to reach the commonest action. Row subtitles were removed entirely —
  they restated their own labels and assumed a phone.

  **One frame per cover was the root bug, and it caused two symptoms that looked
  unrelated.** The encoder wrote exactly one frame per cover and leaned on
  per-frame durations: four frames across ten seconds, some three seconds long.
  Legal MP4, badly behaved. Playback stalled ~3s before starting and differed on
  the second play once cached — a decoder has no cadence to schedule against.
  And it is why the result never read as animation: a cover was absent in one
  frame and present in the next, so its arrival had **no duration to watch**.
  Spreading them further apart added dead air rather than motion, which is
  exactly what ten seconds looked like — covers at 1s, 4s and 7s with nothing in
  between.

  Now a real timeline at **24fps**, with each cover fading up and settling from
  6% oversized on a cubic ease-out, clipped to its slot. Ruthnie's 10s / 3-cover
  case went from **4 frames to 240**, with something in motion 51% of the time.
  Verified across every duration and cover count: exact durations, all covers
  land, 35–51% of frames carry motion.

  **The lesson, and it is the fourth of its kind in this log.** Every one of
  these was a number or a structure chosen by reasoning in the abstract —
  a duration that sounded right, a layout that seemed tidy, a frame model that
  was technically valid. All four passed typecheck and lint. All four were found
  in the first minute of somebody actually watching the output.

## Transitions — what is cheap from here

Ruthnie asked what else the covers could do as they land, and what it would
cost. Recorded now because the architecture that makes these cheap is fresh, and
because the answer is unusually favourable: **the hard part is already built.**

The frame loop is a real timeline. `compose(progressOf)` is called once per
frame and asks each cover for a number from 0 to 1 — how far into arriving it
is. Every transition below is a different way of drawing that one number, inside
a single function, with no change to the timeline, the encoder, the pacing, or
the export sheet.

**Free — canvas transforms, a few lines each, no measurable file-size cost:**

- **Spin.** `context.rotate()` about the slot centre, easing from ~15° to 0
  alongside the existing fade. Ruthnie's own suggestion, and the natural
  companion to the settle already there. Needs `translate` to the centre first,
  since canvas rotates about the origin.
- **Slide.** Offset the destination rect and ease it to true position — from
  below reads as stacking, from the side as dealing cards. One added term.
- **Flip.** Scale x from 0 to 1 about the centre. Reads as a card turning face
  up. Genuinely two lines; a *convincing* flip wants perspective, which 2D
  canvas cannot do, so this is the honest cheap version.
- **Stagger by position** rather than by slot index — diagonal, or outward from
  the centre. Changes `start` in the progress function and nothing else.
- **Overshoot.** Swap the cubic ease for a back-ease that passes its target and
  returns. One function, and it is what would make a landing feel physical.

**Cheap but not free:**

- **Drop shadow on arrival**, fading as the cover settles. `shadowBlur` on a
  moving element is the one expensive canvas operation here — likely fine at
  720p and 24fps, but worth measuring rather than assuming.
- **A whole-poster move** — slow push-in or drift under the reveal. Cheap to
  draw, but it makes every frame differ from the last, which is precisely what
  H.264 was compressing away. Expect a real size increase.

**Not cheap, and worth knowing before it is proposed:**

- **Anything needing real 3D** (a true perspective flip, a page turn). 2D canvas
  has no perspective transform. WebGL would mean a second rendering path.
- **Per-cover motion blur.** Multiple draws per frame, and it would smear the
  cover art rather than reading as speed.
- **Text or title animation.** The title is baked into both captures. Animating
  it separately means capturing it apart from the poster, which breaks the
  two-capture model — that is a real change, not a transition.

**The likely best first addition is spin plus overshoot together**, since the
fade and settle already exist and those two make an arrival feel like an object
landing rather than an image appearing. Both are inside `compose()`.

**If more than one ever ships, it wants a control** — the same argument as the
length slider. Pacing turned out to be taste, and so is this.
