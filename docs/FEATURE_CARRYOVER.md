# Features carried over — audited 2026-08-22

The running list of what is planned and not yet built, and why. Written because
the older docs had drifted: `SUGGESTED_POSTERS.md` still lists the import bleed
as unfixed and StoryGraph import as unbuilt, and both shipped.

Read `NEXT_LEVEL.md` and `SUGGESTED_POSTERS.md` for the reasoning behind
anything here. This is the index, not a replacement.

---

## Corrections to the older docs

Three things were listed as outstanding and are done. Anyone reading the old
sections should stop and check the code first.

- **The import bleed is fixed.** `Book.imported` exists, `saveBooks` merges it
  with the "false always wins" rule, `clearImportedFlag()` fires when a book is
  placed on a poster, and `decideImportedFlags()` migrates the pre-flag library.
  The section headed "found 2026-08-18, not yet fixed" describes a problem that
  no longer exists — it was written before the fix and never annotated.
- **The posters drawer already shows covers.** `CoverStrip` at
  `PostersPanel.tsx:148`.
- **The local-only promise is already the first line of About**, not the second
  paragraph.

**The lesson, since it cost a wrong recommendation:** a planning doc records
what was true when it was written. Check the code before believing a section
that says "not yet built" — especially one that reads as a finished design,
because a finished design is exactly what gets built next and then not written
back.

---

## Layouts — the surface-area audit

Ruthnie's read was that the eight-book poster wastes space and should be 2x4
rather than 4x2. **She is right, and the rule currently written into
`CLAUDE.md` argues the wrong way.**

Every offered shape was measured by replicating `layoutGrid` exactly — no text,
so the nominal title band and the `gridBottomMin` floor, which is the geometry
a plain poster gets.

| capacity | shape | slot | area per book | frame coverage | offered |
|---|---|---|---|---|---|
| 2 | 1x2 | 476×714 | 340k | 32.8% | |
| 2 | **2x1** | 458×687 | 315k | 30.3% | yes |
| 4 | **2x2** | 458×687 | 315k | 60.7% | yes |
| 6 | 2x3 | 313×469 | 147k | 42.5% | |
| 6 | **3x2** | 299×448 | 134k | 38.7% | yes |
| 8 | 2x4 | 231×347 | **80k** | **31.0%** | |
| 8 | **4x2** | 219×329 | 72k | 27.8% | yes |
| 9 | **3x3** | 299×448 | 134k | 58.1% | yes |
| 12 | 3x4 | 231×347 | 80k | 46.5% | |
| 12 | **4x3** | 219×329 | 72k | 41.6% | yes |
| 16 | **4x4** | 219×329 | 72k | 55.5% | yes |
| 20 | 4x5 | 182×274 | 50k | 48.1% | |
| 20 | **5x4** | 171×257 | 44k | 42.4% | yes |

**The tall shape wins every pair.** 2x4 gives each book 11% more area than 4x2
and covers more of the frame. The same holds for 2x3 over 3x2, 3x4 over 4x3,
4x5 over 5x4.

### Why the existing rule got it backwards

`CLAUDE.md` says rows may never exceed columns, because a taller-than-wide grid
strands margin. Both halves are true and the conclusion does not follow.

2x4 does strand 299px per side and uses 45% of the frame width. But a tall grid
trades width for height: it is height-bound, so it claims the full vertical run
and each slot comes out **larger**. The margin is stranded and the covers are
bigger. Those are not in conflict — they are two different things to optimise,
and the doc treated stranded margin as self-evidently the one that matters.

- **Fill the frame edge to edge** → wide shapes. All eleven offered layouts are
  width-bound at 87%.
- **Give each book the most surface area** → tall shapes, by 11% on the
  eight-book pair.

Ruthnie asked for the second: *"anything that'll give us the most surface
area."*

### What is not available

**A tall shape cannot do cover bleed.** `supportsCoverBleed()` requires
`columns === rows`, and that is genuinely derived from the 9:16 frame — 2x4
slots would crop 58% off every cover. No loss in this case, since 4x2 does not
support bleed either.

**Adding a shape is not free at the picker.** `GridPicker` offers capacity
first, which is right. Two entries at the same capacity means the shape becomes
a visible choice, which it currently is not.

### Shipped 2026-08-22 — the frame, not the layout

The whole first pass was wrong and the correction is worth keeping, because the
mistake is one a future session will make again.

**The finding.** Slots are locked to 2:3 so covers never crop, which means a
slot cannot widen without growing 1.5× taller, and the frame has no spare
height. So **rearranging rows and columns cannot make a cover bigger** — every
shape is already pressed against a wall, and a swap just changes which wall.
The first version of this section swapped the whole catalogue from wide shapes
to tall ones and shipped posters with identical covers and worse margins.
Ruthnie: *"you gave me new layout, same grid."*

**What actually reaches the covers is the frame.** The side margin, the gap
between covers, and the blank air above the title were fixed tokens, and they
are the entire distance between the artwork and the edge. Tightening them from
72/20 to 40/12 gained 4.5–11.2%, most on the crowded shapes that needed it.

**The real ceiling is the canvas**: 1080px across three columns is 360px a slot,
and no arrangement or margin beats it. A 3×2 now sits at 325 and reaches 360 at
margin zero.

### The general lesson, which is the reason this is written at length

Three separate rules in this codebase turned out to be **a defensible number
optimising the wrong quantity**, and all three were mine:

- *rows ≤ columns* minimised stranded margin when the reader wanted cover size.
- *bleed needs a square grid* tested for squareness while claiming to protect
  against cropping. It refused 2×3 at 21% and allowed a square at 16% — and
  blocked 4×5, which crops **5%**, the least of any shape in the catalogue.
- *ratings off in bleed* was a taste call made on the reader's behalf, which
  surfaced as the stars vanishing with no explanation.

Each was argued from real geometry. None of them asked what the poster was for.
**Before enforcing a rule, state which quantity it maximises and check that it
is the one the reader asked for.**

### What shipped

- **`PosterDensity` on the board** — `gridMarginX`, `gridGap`, `titleTop`, all
  adjustable per poster, defaulting to the tokens. `densityOf()` is the single
  fallback so a board with no density and one with the defaults lay out
  identically.
- **The drawer fades to 0.12 opacity while a slider is held**, mask off. The
  values move the artwork a few pixels at a time, which is invisible behind an
  82vh sheet. `onPeek` runs from `Slider.onChange` and clears on
  `onChangeComplete`, so the keyboard path works too.
- **`LayoutBar` in the chrome between the poster and the bottom bar.** Not in
  the drawer, which covers the thing being judged, and not on the poster, which
  the export captures. Book counts scrolled sideways; tapping the selected one
  flips its orientation.
- **Cover bleed on every shape**, with the crop percentage reported beside the
  switch instead of a refusal. `supportsCoverBleed` now returns true always and
  exists only to carry the reasoning; `coverBleedCrop` is the real number.
- **The favourite crown stays in the top-right in every mode.** It used to move
  to the bottom-left under bleed to dodge the title scrim, which meant a reader
  watched their mark jump corners when they flipped a switch. Its radial glow
  already solves the legibility problem the move was for.
- **Ratings honour the switch in bleed too.** They carry their own scrim.

**Migration costs no board a book** — verified across both the slider era and
the wide catalogue; every shape maps to identical capacity. Only 4×6, 5×5 and
5×6 lose anything, and all three were already over the 20-book ceiling.

Shipped as 0.8.0.

### Still open

- **Bleed overlays the title on the first row of covers.** By design, with a
  560px scrim behind it — but on dark cover art it reads as a collision rather
  than as type on artwork. Worth a look before bleed is called finished.
- **Whether the tall orientations earn their place at all.** After tightening,
  wide gives the bigger cover at every capacity, so tall is purely a shape
  preference now.

---

## Suggestions — a regenerate control and more to draw on

Today `useSuggestions` recomputes on mount and on `reload()`, and
`suggestPosters` is pure over the books, the clock, and the dismissed set. A
suggestion is derived, not scheduled, so a reader who neither uses nor dismisses
one sees the same rows forever.

Ruthnie wants **a manual regenerate**, and a deeper well to draw from.

### Wanted

- **A regenerate control the reader can press.** Explicit, not a timer.
- **A time-anchored generator**, so the answer changes as the calendar turns
  without any rotation machinery. "A year ago this month" is the shape: it
  depends on today's date, so it produces a genuinely new row on an ordinary
  Tuesday. This is the honest version of "how often does it refresh".
- **More generators.** Named by Ruthnie: a yearly recap; the most-read author;
  the highest-rated books; the lowest-rated books; and once `Book.status`
  exists, the to-read poster. Monthly recap is roughly what best-month already
  does.

### What the data supports

`Book` carries a date, a rating, and an author, and nothing else. No page
count, no genre, no start date. Every generator has to stand on those three
columns — see the "Not buildable" section of `STATS.md`, which works through
what that rules out.

**The honesty rule ports from `STATS.md` and is not optional:** a generator
returns `null` unless the evidence is there. A thin library gets silence, never
a fabricated pattern.

**Lowest-rated books needs a decision before it is built.** A poster of books
you disliked is a real idea and a strange thing to hand someone. It may want
different framing than the five-star poster gets, or it may not be wanted at
all. Ask before building.

### Dismissal ids should carry their evidence

`five-stars-2026` already re-offers itself in 2027, because the year is in the
id. `best-month` and `top-author` do not — dismiss once and that idea is gone
permanently, even when the answer changes. An id carrying the author's name or
the month would let a **different** answer re-ask.

---

## The to-read poster — the case for it, which is narrower than the plan's

`SUGGESTED_POSTERS.md` step 5 plans `Book.status` and the TBR poster. Ruthnie's
objection is the thing worth recording, because it is sharper than the plan:

> "That's kind of stepping into Goodreads territory... which we're not really
> trying to be. Unless we want users to be able to create an optimistic book
> poster, which you can't really do in Goodreads or StoryGraph."

**That is the whole justification, and it is a good one.** Goodreads and
StoryGraph both let you flag a book as want-to-read. Neither makes a poster of
it. The gap is not the flag — it is the artwork, which is the object Ruthnie's
sister already makes by hand.

So build it for the poster, not for shelf management. If it starts growing
toward tracking what someone is currently reading, that is the line where this
becomes a reading app instead of a poster app.

Unchanged from the plan: the schema change carries four exclusion consequences
(unread books must not count in Stats, must not feed the other generators, and
so on). Work through that section before writing the field.

---

## Kebab menus, and Ruthnie's fix for the nesting problem

Two rows carry side-by-side buttons: the posters drawer (rename, delete) and
the import list (Use, delete — the worse pair, since one is ordinary and one is
destructive, a thumb's width apart on a phone).

> "I hate two buttons sitting side by side."

The obstacle was always that the posters card is **itself** a button that opens
that poster, so a menu inside it is a tap target inside a tap target.

**Ruthnie's answer removes the problem rather than managing it:** make only the
poster name and its covers the tap target, leaving the rest of the row free for
the kebab. Nothing is nested, so nothing has to be exact.

Swipe-to-delete stays rejected — invisible, fights the vertical scroll of the
drawer, and gives desktop nothing.

---

## Non-uniform layouts — still the big one

`NEXT_LEVEL.md` 1.4, unchanged and unstarted. `layoutGrid()` returns one slot
size for the whole board; a hero layout means returning `slots: SlotBox[]` and
absolutely positioning each one. `bleedLayout()` is already a second generator
sitting beside the uniform one, so the shape is half-started.

Ruthnie raised circular and heart-shaped arrangements. Those are further than a
hero layout — they break the grid entirely rather than varying cell size — but
they are the same architectural change, and it is worth knowing they are the
destination before designing the intermediate step.

This one destabilises what works. Own session.

---

## Parked by decision, not oversight

- **The QR reading-progress code** (`QR_HANDOFF.md`). Smallest payload, closest
  fit to the actual need. Ruthnie's call to park it.
- **The share link** (`NEXT_LEVEL.md` Tier 3). Revisit when someone outside the
  four people asks.
- **The About panel's creator credit.** Waiting on Ruthnie's own site.

---

## Suggested order

1. **Layouts.** Arithmetic is done, the change is contained, and it answers a
   thing Ruthnie noticed in real use.
2. **Kebab menus.** Small, and the nesting problem is solved.
3. **Suggestion generators plus regenerate.** Additive, no schema change.
4. **`Book.status` and the to-read poster**, if the optimistic-poster case
   still holds after 3.
5. **Non-uniform layouts.** Its own session.
