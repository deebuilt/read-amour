# Read Amour — a QR code that moves a library

Planning doc, written 2026-08-17. Nothing built yet.

Ruthnie's ask: make the backup feature smarter, with a QR code that can be
scanned to restore — and keep the merge behaviour exactly as it is.

The merge stays. The QR code is buildable. But it cannot carry what the backup
file carries, and the arithmetic below is the whole reason this doc exists
rather than a build session.

**Parked 2026-08-17, same day, before any code.** Read the next section first —
it reframes the whole document, and it came from Ruthnie describing what she was
actually trying to do rather than from anything below it.

---

## What she was actually trying to share, which is none of the above

> *"Really, I'm trying to share finished dates on books that are already on both
> devices."*

That sentence invalidates the framing of this entire doc, and it is worth
holding onto because it is the kind of thing that only surfaces in conversation.

**Both devices already have the books.** What has drifted between them is a
handful of `dateRead` and `rating` values. Under that description:

- A **poster QR** (feature 1 below) sends a whole poster — titles, authors,
  design, grid — to move two fields per book. Wrong shape.
- A **backup file** sends tens of megabytes of cover blobs both phones already
  hold. Also wrong shape, and by a much larger margin.

The framing that limited this was "it's either a backup file or a QR code."
There is a third payload, and it is by far the smallest thing in this document.

### A reading-progress code

Carry only what drifts: a match key, a finish date, and a rating. No titles, no
authors, no design, no covers — the receiving device already has all of that and
matches on ISBN.

Measured, same encoding as everything else here (deflate-raw + base64url):

| books | raw JSON | QR characters | fits |
|---|---|---|---|
| 20 | 641 | **182** | trivially |
| 50 | 1,601 | **332** | trivially |
| **101** (Ruthnie's library today) | 3,233 | **556** | easily |
| 250 | 8,001 | **1,143** | comfortably |
| 500 | 16,001 | **2,100** | yes |
| 1,000 | 32,001 | 4,079 | no |

**A 500-book library fits.** That is the case the poster payload could not reach
and the case that made feature 1 uncomfortable to ship — a wall the reader has
no way to see coming. Here the wall is at a thousand books, which for a hand-kept
reading log is a decade of reading rather than a plausible next import.

It also merges natively, and more precisely than anything else proposed here:
`saveBooks` already merges field by field and already refuses to let an
undefined incoming value clear a stored one. A progress payload is *exactly* the
write that guard was built for.

**Not built, and not scheduled.** Ruthnie's call, and the right one — the two
devices in question are hers and her sister's, and neither has yet hit the
problem hard enough to want a feature for it. But if this document is ever
picked back up, **start here, not at feature 1.** It is the smallest payload,
the largest headroom, the closest fit to the stated need, and the only one whose
merge semantics already exist in the codebase.

Two things to check before building it:

- **The match key.** ISBN is clean but not universal — manual entries may have
  none, and Goodreads rows sometimes carry only an ISBN10. Falling back to
  normalised title + author surname is the same `matchKey()` shape
  `api/bookSearch.ts` already uses for cross-catalogue dedupe. Reuse it.
- **Conflict direction.** If both devices rated the same book differently, one
  has to win. Newest `updatedAt` is the obvious rule, but `Book` has no such
  field today — it would need one, or the payload carries a stamp.

---

## The finding that shapes everything: a QR code cannot hold covers

A QR code's absolute ceiling is **2,953 bytes** — version 40, error correction
level L, byte mode. That is a 177×177 grid of modules, which is already at the
edge of what a phone camera reads reliably off another phone's screen.

The current backup file is tens of megabytes, because cover blobs travel inside
it as base64. A single cover is ~25KB before encoding. **One cover is eight
times a maximum QR code.**

So "the backup file, as a QR code" is not a thing that can be built. Not with
better compression, not with a denser code, not by splitting across a handful of
codes. The gap is four orders of magnitude.

### What *can* travel: identifiers

This is the same finding Tier 3 of `NEXT_LEVEL.md` already recorded for share
links, and it applies here unchanged. A book on a poster does not need to carry
its picture — it needs to carry enough to *re-fetch* its picture. An Open
Library cover id or an ISBN13 is thirteen characters, and
`resolveCoverForBook()` already does exactly this lookup on the receiving end.

Measured, not estimated (deflate-raw + base64url, the encoding proposed below):

| library | raw JSON | QR characters | fits |
|---|---|---|---|
| 20 books, 1 poster | 1,828 | **423** | comfortably, ~v20 |
| 40 books, 3 posters | 3,738 | **615** | comfortably |
| 100 books, 8 posters | 9,383 | **1,140** | yes, ~v25 |
| 250 books, 20 posters | 23,613 | **2,470** | only just, v40 |
| 500 books, 40 posters | 47,333 | **4,672** | **impossible** |

Two things fall out of that table, and they are the two decisions in this doc.

**A single poster is a great QR code.** 423 characters is a code a camera reads
instantly, at a size that fits on a phone screen next to the poster it describes.

**A whole library is a bad QR code and eventually an impossible one.** It works
today for a small library and silently stops working at a size the reader has no
way to anticipate. A feature that fails at 500 books, having worked at 250, is
worse than one that never offered.

---

## What to build: two features, not one

The ask contained two things wearing one name. Separating them is the plan.

### 1. Share a poster by QR — the new feature

**What.** A QR code that carries **one poster**: its design settings and its
book list as identifiers. Scanning it on another device opens Read Amour and
rebuilds that poster, re-fetching covers from the catalogues.

**Why this is the good half.** It is the thing a QR code is actually for —
handing something to a person standing in front of you. Ruthnie's sister makes
these posters; showing a code and having the poster appear on someone's phone is
a genuinely new capability, not a re-plumbing of an existing one.

It also merges, which is the requirement: a received poster goes through
`restoreBackup`'s exact path — images, then books, then boards, with
`putBoardVerbatim` and `saveBooks`' field-by-field merge underneath. A scanned
poster adds; it never replaces.

**What it cannot do, and must say so.** A reconstruction has holes. Manually
uploaded covers have no identifier and cannot travel. Open Library may no longer
serve a cover it served the sender. The receiving screen must show what arrived
and what did not, rather than presenting a poster with three blank slots as
though that were the poster that was sent.

### 2. Move a library by file — the existing feature, kept

**What.** Unchanged. `createBackup` / `restoreBackup` exactly as they are.

**Why it cannot be replaced by a QR code.** Because of the table above, and
because of one thing the identifier route loses permanently: **a backup file is
lossless and a QR code is not.** The file carries actual cover bytes, including
the ones that exist nowhere else — manual uploads, replaced covers, covers for
books that have since left both catalogues. It is the thing that survives a
cleared cache. A QR code is a message; the file is the archive.

Conflating them would be the domain-wrong move here: it would look like an
upgrade and would quietly turn a lossless archive into a lossy one.

---

## Where a QR code genuinely improves the *backup* flow

There is a real improvement available to the existing feature, and it is not the
payload. It is the **handoff**.

Today, moving a library between two devices means: export a file on device A,
get that file onto device B (email it to yourself, AirDrop, a cable), then find
it in the file picker. The file is the easy part; the transfer is the friction.

Three options, in order of what they cost:

**(a) A QR code carrying a URL, not data.** If the library is ever hosted
anywhere — even temporarily — the code carries a short link and the bytes travel
over the network. This needs a server, which the app deliberately does not have.
**Not recommended**; it trades the app's whole privacy posture for convenience.

**(b) Local transfer over WebRTC, with the QR code carrying the connection
offer.** Device A shows a code, device B scans it, the two connect directly and
the full backup — covers and all — streams across. No server holds the data.
This is genuinely how a lossless QR-initiated transfer would work.

Real, and a large build. WebRTC still needs a signalling exchange to connect;
doing that entirely inside a QR code means the offer SDP goes in the code (it
fits, around 1-2KB trimmed) but the *answer* has to get back to device A somehow
— which means a second code shown on device B and scanned by device A. Two-way
scanning, both cameras, both readers holding both phones. It works and it is
fiddly. **Defer.**

**(c) Nothing — the file is fine.** Both devices are usually the same person's,
and every phone has a share sheet. `downloadBackup` could hand the file to
`navigator.share()` the way `sharePoster` already does, which turns "find the
file" into "pick AirDrop". **This is the cheap real win**, and it is about four
lines against the existing `savePoster`/`sharePoster` split.

**Recommendation: build (c) alongside feature 1, and leave (b) written down.**

---

## Design of the poster QR code

### Encoding

`encodeBoard(board, books) → string`, and its inverse. Not JSON in the URL —
punctuation eats the budget. The measured 423 characters above already assumes:

- Positional arrays rather than keyed objects (`['Title','Author','978…',4,'2026-08-03']`).
- `CompressionStream('deflate-raw')`, available in every browser the app targets,
  no dependency.
- base64url, so the payload is URL- and QR-safe with no escaping.

### The payload goes in the URL fragment

`https://readamour.com/#p=<payload>`. The fragment, not the query string:

- A fragment is never sent to the server. On GitHub Pages that means it cannot
  hit a request-length limit and cannot land in an access log.
- It survives the SPA's routing without any server-side rewrite.

The same string is both the QR code and a link that can be pasted into a
message, which answers the "a 900-character URL is ugly" objection from
`NEXT_LEVEL.md` Tier 3 — 423 characters is long but not absurd, and most people
will scan rather than paste.

### Version the payload from day one

A single leading character. `1` today. The backup file has `BACKUP_VERSION` for
exactly this reason and a QR code is worse, because a printed or screenshotted
code outlives the app version that made it. A reader must be told "this code was
made by a newer Read Amour" rather than shown a mangled poster.

### Receiving

On load, if a fragment payload is present:

1. Decode and validate. A bad payload fails here, where failing is free.
2. **Show what is about to be added before adding it** — poster name, book count,
   and how many covers will need fetching. Same principle as `summarise()`
   gating the file restore.
3. On accept, write through the existing storage path. Books via `saveBooks`,
   board via `putBoardVerbatim`, covers resolved after through
   `resolveCoverForBook()`.
4. **Report what did not arrive.** Named, not counted — "3 covers could not be
   found: …" so the reader can add them by hand.

### Generating

Needs a QR encoder. `qrcode` is the obvious npm choice, but check the same
criteria that chose `gifenc` for 2.3: bundle weight, and **no worker file or
WASM asset**, because a runtime-loaded asset is the class of thing that works
locally and breaks on the deployed base path. Confirm before committing to a
library.

Scanning does **not** need a library — `BarcodeDetector` is native in Chrome and
Android, which is the app's primary target. iOS Safari does not have it, and the
fallback there is the phone's own camera app, which reads QR codes natively and
opens the URL. So on iOS the feature works *without any in-app scanner at all*.
That is worth designing for deliberately: the in-app scanner is an enhancement,
and the link is the actual mechanism.

---

## What will bite

- **`board.id` collides on re-scan.** Two devices generating posters
  independently produce different ids, so a scanned poster is normally new. But
  scanning the *same* code twice must be a no-op, exactly as re-restoring a file
  is. `restoreBackup` already skips a board whose id exists — keep the sender's
  id in the payload and that behaviour comes free. Do not generate a fresh id on
  arrival.

- **`Book.id` is a local id, and the payload must not carry it.** Books are
  matched across devices by ISBN or title+author, not by an id that means nothing
  on the receiving device. If the receiver already has the book, its existing
  record wins and its cover is reused — which is the merge working correctly.
  This is the one place the encoding is not a straight serialisation.

- **The cover fetch on arrival is the slow part**, and it is the same unbounded
  queue noted under "Known gaps" in `CLAUDE.md` — cover resolution cannot be
  cancelled. A scanned 20-book poster fires 20 lookups. Worth doing the bulk
  fetch with a cancel (planned item 2) as part of this rather than adding a
  second uncancellable queue.

- **`favouriteBookId` points at a local book id** and must be re-pointed after
  the books are merged, or it dangles — the exact failure `withValidFavourite()`
  exists to prevent. Encode it as a slot index instead.

- **Background uploads cannot travel.** `{ kind: 'upload'; blobKey }` refers to a
  blob on the sender's device. Either fall back to a builtin ground on arrival
  and say so, or encode a sampled colour from it. The second is nicer and the
  palette code from 1.1 already knows how.

- **Do not let the QR path bypass `migrateBoard()`.** A decoded board is an
  untrusted board from a possibly-older app, exactly like one read off disk.

---

## Suggested order

1. **Share the backup file to the share sheet** — (c) above. Small, immediate,
   improves the feature that exists today.
2. **Encode/decode a poster payload**, with tests over every grid shape. Pure
   functions, no UI, no QR yet — this is where the correctness lives.
3. **Render the QR code** and add a receive screen behind the URL fragment.
4. **In-app scanner via `BarcodeDetector`**, Android only, as an enhancement.

Items 2 and 3 are the feature. Item 1 is worth doing first because it is an hour
and it makes the existing thing better regardless of whether the rest ships.

---

## Progress log

*(Append dated entries as items ship.)*

- **2026-08-17** — Doc written. Nothing built. The load-bearing finding is the
  capacity table: a QR code tops out at 2,953 bytes, one cover is ~25KB, so the
  backup file can never become a QR code — but a single poster encoded as
  identifiers is ~423 characters and makes an easy one.
