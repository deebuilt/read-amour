# What's new — release notes in the app

A PWA has no App Store listing, so there is no page anywhere that tells a reader
what changed. The app is the only place that story can live, and right now it
does not tell it: `UpdateBanner` says "A new version is ready" and nothing else.
The reader reloads and is left to spot the difference.

Planned 2026-08-17. Not built.

---

## Two separate things, and only one of them is release notes

Worth splitting before designing either, because they have different fixes.

**1. The update arrives late.** Ruthnie: "I have to open and reclose my app
about three times before I get the update."

This is not a config bug — `registerType: 'prompt'` and `UpdateBanner` are both
correct. It is that **a service worker update check runs on page load, and an
installed PWA reopened from the home screen often resumes the existing page
rather than loading it fresh.** No load, no check. So the reader is waiting for a
cold start to coincide with a reopen, which takes a few tries.

The fix is a check when the app returns to the foreground:

```ts
// in UpdateBanner, via useRegisterSW's onRegisteredSW callback
onRegisteredSW(_url, registration) {
  if (!registration) return
  const check = () => {
    if (document.visibilityState === 'visible') void registration.update()
  }
  document.addEventListener('visibilitychange', check)
  check()
}
```

`visibilitychange` rather than an interval. A timer fires while the app is
backgrounded and the reader is not there to see the result; this fires exactly
when they come back, which is the only moment the answer matters. One request
against a small manifest.

(A 30-minute poll was floated first and is worse on both counts — later than a
foreground check for someone returning, and pointless work for someone who is
not.)

**2. The reader does not know what changed.** That is this document.

Fix 1 first. It is small, it is the thing actually causing friction today, and
release notes on a build that arrives three reopens late are notes nobody reads.

---

## The blocker: nothing identifies a build

`package.json` is still `"version": "0.0.0"` from scaffolding, and there is no
changelog. **There is currently no way for the running app to say which version
it is**, which every part of this feature depends on.

So the first real change is a version the app can read:

- Bump `package.json` on each release. Plain semver, hand-bumped — this is one
  person deploying from one machine and tooling would be ceremony.
- Expose it via Vite `define` as `__APP_VERSION__`, so it is baked at build time
  rather than fetched.
- Notes live in a **typed array in the source**, not a fetched file. The service
  worker caches the app shell; a fetched `notes.json` would be subject to that
  cache and could serve stale notes for the very build it is describing. In the
  bundle it cannot disagree with the code it ships beside.

```ts
// src/design/releases.ts  (data, so it sits with the other content constants)
export interface Release {
  version: string
  date: string          // ISO
  /** One or two sentences, reader-facing. Not a commit log. */
  headline: string
  changes: string[]
}
```

---

## The surface

**Not a full-screen takeover.** The poster is the whole screen and the app's
one rule is that nothing covers the artwork without cause. A modal that
interrupts someone mid-poster to announce a bug fix is the app talking about
itself at the expense of the thing it is for.

**Two states of one component:**

1. **The banner, as today** — but with the headline in it. "A new version is
   ready" becomes something specific: *"Posters can now hold a single book."*
   One line, the actual change, in the space already occupied. For most updates
   this is the entire feature, and it costs no new surface.

2. **The notes**, reached by tapping the banner, and permanently available in
   About. A short list under a version and a date. Tapping the banner expands
   rather than navigates — the reader asked what changed, not to leave the
   poster.

Keeping both in one component matters: the banner is what a reader sees when
they did not ask, and the notes are what they see when they did. Two entry
points, one story.

**About is where it lives permanently**, next to the version number. That panel
is already flagged in `CLAUDE.md` as reading like a footnote while being the
app's front door, and this gives it a reason to be opened — which is a better
fix for its affordance problem than any label change.

Show a version's notes **once**, then let it stay reachable. A banner that
returns after dismissal is nagging.

---

## Writing the notes

**Read `VOICE.md` first.** These are the most human-facing strings in the app —
short, read by everyone who updates, and the exact place a generic tone shows.

- **One sentence per change, saying what the reader can now do.** Not what was
  refactored. "The bottom bar has labels" is chrome talk; "You can see what each
  button does" is the change.
- **Skip anything with no visible effect.** A build with only internal work gets
  no notes and no banner headline — the plain "A new version is ready" is the
  honest fallback, not a padded list.
- **No version-number theatre.** No "v0.4.0 — Q3 Release". A date and the
  changes.
- **Never a rule-of-three list**, per the global visual rules. Two changes, or
  five. Whatever actually shipped.

---

## Not in scope

- **A public changelog page.** Different audience, different writing, and the
  app has no marketing site yet.
- **Automating notes from commits.** Commit subjects are written for the repo;
  reader-facing notes are a different register. Hand-write them — there are a
  handful per release.
- **Migration/"what happened to my data" notices.** If a release ever needs one
  of those it is not release notes, it is a blocking dialog, and it should be
  designed then.

---

## Built 2026-08-17, and the design changed on contact

Shipped, but **not as planned above**. The plan's two problems were both real
and both fixed; the shape it proposed for the second one was wrong, and the
reason is worth keeping.

### What the plan got right

The late-arriving update was exactly as diagnosed — no page load, no check — and
the `visibilitychange` snippet above is in `WhatsNewNote.tsx` essentially
verbatim.

### What it got wrong: announcing an update before taking it

The plan kept `registerType: 'prompt'` and had the banner describe the *waiting*
build. That cannot work, and it is structural rather than a bug:

**Release notes ship inside the bundle.** A running build holds its own
`RELEASES` array and never the incoming one's. So a banner that speaks before
reloading is reading the notes of the version the reader already has — the
headline names the old version, every time. Ruthnie watched 0.4.0 deploy and the
banner announce 0.3.0's headline.

Two wrong answers were tried before the right one:

1. **Fetch the incoming notes over the network.** Rejected: a request in an
   offline-first app, and it would have to reach past the very cache the update
   is replacing.
2. **Delete the headline and notes**, leaving "A new version is ready." Actually
   done, and it was the worse mistake — it removed the entire feature this
   document exists to build, in order to avoid a cosmetic inaccuracy. Ruthnie:
   *"You basically restored something that... has never been ideal because it's
   not what I wanted."* Removing a feature is not a fix for it being slightly
   wrong.

### The design that works, which was Ruthnie's

> *"With most apps, the updates just there... the app just silently reloads, and
> then a banner pops up after the reload to say, hey, since you've been gone,
> this is what's there. So we would basically show the post reload banner, not
> the current version banner."*

Report **after** the update lands rather than announcing it beforehand. Then the
app *is* the new build when it speaks — it holds its own notes and describes them
exactly. No fetch, no manifest, no guessing. **The hard problem was created
entirely by the ordering**, and reversing it deleted the problem rather than
solving it.

### What shipped

- `registerType: 'autoUpdate'` in `vite.config.ts`. Paired with the component,
  the same way `prompt` was paired with the old banner — flip one without the
  other and you get either a silent update nobody hears about, or a note about
  something that has not happened.
- `UpdateBanner` → **`WhatsNewNote`**, renamed because it reports rather than
  asks. No Reload button; it cannot be stuck, because there is nothing to press.
- `storage/lastSeenVersion.ts` — one localStorage string, following
  `useTheme`'s precedent. `claimVersionAsSeen()` answers and records in one
  call, so the decision to show and the record of having shown cannot drift.
- **The trigger is `APP_VERSION` vs. last seen, not a service-worker event.** The
  running bundle knows its own version with certainty, so the note works however
  the build arrived — worker update, hard refresh, cleared cache. None of it
  depends on the SW machinery that failed repeatedly before.
- A first-time reader sees nothing. "Here's what changed" is meaningless with
  nothing to compare against.

### The one cost, and how it is paid

`autoUpdate` can reload the page under someone mid-edit. Posters save
continuously so nothing is lost, but it is still hostile. So the reload is
**deferred until the app is backgrounded** (`visibilitychange` → hidden). A
reader who never backgrounds it gets the update on their next cold start, which
is what would have happened anyway.

### A consequence for the release ritual

The note only appears when the running version has an entry in `RELEASES`. So an
entry is now **what makes an update visible to a reader at all** — a release that
ships a visible change and forgets its entry ships it silently. Noted in
`releases.ts` beside the rule.

### Still unverified at the time of writing

The full sequence has never been watched end to end, because it needs two
deploys: one to ship this mechanism, and a later one for it to report on. Every
attempt so far has been blocked by the previous design's broken Reload.

### Verified working 2026-08-17, after two more bugs

The mechanism above shipped and **did not appear.** Two faults, found by Ruthnie
testing on her phone.

**1. The note consumed its own news on mount.** `claimVersionAsSeen()` asked and
recorded in one call, run on mount — and the update arrives *by reloading the
page*, so the new build mounted, marked its version seen, and spent the news
before rendering it. Her words: *"I just saw my app kinda flicker, and that was
where the update landed with no note."* The notes were sitting in What's new,
already considered delivered.

Fixed by splitting the API: `isVersionNews()` asks without writing,
`markVersionSeen()` runs on dismissal, `seedVersionIfNew()` lays a baseline for a
first launch. Failing now means showing the note *again*, which is the right
direction.

**2. A bar at the bottom edge was the wrong surface anyway.** *"I didn't want a
note at the bottom. I wanted a modal, a pop up, something in the center where I
can just dismiss it."*

Both were built behind a `PRESENTATION` constant rather than swapping one
unevaluated design for another — the bar had never rendered, so nobody had seen
it to judge it. The modal was shipped, confirmed, and the bar deleted with its
styles.

**Confirmed end to end** on 0.4.4: app fully closed, reopened, modal appeared
with the headline and both changes, dismissed with Got it, and — checked
deliberately — **did not reappear** on the next launch.

**The 0.4.4 entry was temporary and is now deleted**, which is the point worth
keeping. It described a bug fix rather than a feature, and existed only because
the note could not be seen working without an entry to show. 0.4.5 removes it and
ships silently, which is what the rule in `releases.ts` asks for: a build with
nothing a reader can see gets no entry, and the note stays quiet.

That silent path is exercised by this very release — 0.4.5 has no entry, so it
lands with no modal while still recording itself, leaving the next real feature
free to announce itself correctly.
