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
