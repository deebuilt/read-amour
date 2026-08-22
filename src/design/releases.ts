/**
 * What changed, in each version, written for the reader.
 *
 * Data, so it sits with the other content constants rather than in a component.
 *
 * ## Why this is a typed array and not a fetched file
 *
 * The service worker caches the app shell. A fetched `notes.json` would be
 * subject to that cache and could serve stale notes describing the very build
 * that just installed — the one thing these notes exist to describe correctly.
 * Sitting in the bundle they cannot disagree with the code they ship beside.
 *
 * A GitHub Release was considered and is the wrong surface for the same reason
 * doubled: it is fetched, it needs the network in an app built to work offline,
 * and it is read on github.com by developers. The reader here is on a phone at
 * readamour.com and will never see it.
 *
 * ## Writing an entry
 *
 * Read `VOICE.md` first. These are the most human-facing strings in the app —
 * short, read by everyone who updates, and the exact place a generic tone shows.
 *
 * - **One sentence per change, saying what the reader can now do.** Not what was
 *   refactored. "The bottom bar has labels" is chrome talk; "You can see what
 *   each button does" is the change.
 * - **Skip anything with no visible effect.** A build of internal work gets no
 *   entry at all, and `WhatsNewNote` then shows nothing when that build lands.
 *   Silence is the honest outcome, not a failure — a padded list of refactors
 *   teaches people to stop reading these.
 *
 *   Note this is now a real consequence rather than a stylistic one. The note
 *   only appears when the running version has an entry here, so **an entry is
 *   what makes an update visible to a reader at all.** A release that ships a
 *   change someone can see and forgets its entry ships it silently.
 * - **No version-number theatre.** No "v0.4.0 — Q3 Release". A date and the
 *   changes.
 * - **Never a rule-of-three list.** Two changes, or five. Whatever shipped.
 *
 * Newest first. The `version` must match `package.json` for that release, since
 * that is the string the running app compares against.
 */

export interface Release {
  /** Matches `package.json` at the time of the release. */
  version: string
  /** ISO date, `YYYY-MM-DD`. */
  date: string
  /**
   * One or two sentences, reader-facing. Shown in the update banner, so it is
   * the only thing most readers will ever see about a release.
   */
  headline: string
  changes: string[]
}

export const RELEASES: readonly Release[] = [
  {
    version: '0.8.0',
    date: '2026-08-22',
    headline: 'Covers are bigger, and the layout button moved to the poster.',
    changes: [
      'Covers sit closer to the edge now, so every layout draws them larger.',
      'Layout has its own button under the poster. Now you can watch the grids change without having to open and close the design drawer.',
      'Switch from tall to wide mode on each layout by tapping twice.',
      'Three new sliders control the margins and space on the poster. The panel fades so you can see the poster underneath.',
      'Edge to edge works on every layout.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-08-19',
    headline: 'Import now includes StoryGraph.',
    changes: [
      'Import a StoryGraph CSV export file.',
      'Books included in separate imports are stored once, to avoid duplication.',
      'Tap a list in Import to see the books it contains.',
      'Saved posters now show book covers.',
      'Poster search checks imported books before looking online.',
      "Delete any list you don't want.",
    ],
  },
  {
    version: '0.6.0',
    date: '2026-08-18',
    headline: 'Imported files are stored.',
    changes: [
      "Import a CSV and pick the books you want on a poster. Anything you don't pick is stored, so you can come back and add it later.",
      'Only books on a poster count toward your stats and poster ideas.',
      'Delete the ones you never used whenever you want.',
    ],
  },
  {
    version: '0.5.1',
    date: '2026-08-18',
    headline: 'Poster ideas reveal covers.',
    changes: [
      'Covers stay put when switching between posters.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-08-18',
    headline: 'Poster ideas.',
    changes: [
      'Tap the sparkle in the top left to see suggested posters: five-star reads, year in review, biggest month, everything by the most-read author.',
      'Tapping an idea shows you the poster before it is saved. Keep it or discard it.',
      'An idea you do not want can be dismissed.',
    ],
  },
  {
    version: '0.4.6',
    date: '2026-08-17',
    headline: 'Adding a book by hand no longer requires a cover.',
    changes: [
      'A book you add by hand needs a title and author. The cover is now optional.',
      'You can add the cover later from the book’s details.',
    ],
  },
  {
    version: '0.4.3',
    date: '2026-08-17',
    headline: 'The app updates itself now.',
    changes: [
      'New versions arrive on their own, while the app is closed or in the background. Nothing to tap, and it never reloads while you are working.',
      'When you come back, a note at the bottom tells you what arrived. Tap it to read the details.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-08-17',
    headline: 'Pick how your covers appear.',
    changes: [
      'Your video can use one of four transitions: covers can fade in, slide up from below, fall from above, or start large and shrink into place. Choose one under Export.',
      "What's new has its own place in the More menu, instead of being tucked inside About.",
    ],
  },
  {
    version: '0.3.0',
    date: '2026-08-17',
    headline: 'Reading stats are here.',
    changes: [
      'Reading stats, under More: how many books a month, how you rate them, and a few things your library says about you.',
      'A finish date is what puts a book on those charts, so there is now one place to add every date you are missing.',
      'The book list marks which books have no date yet.',
      'Import and About moved into More, alongside the stats.',
    ],
  },
] as const

/** The version this build is running, baked in from `package.json`. */
export const APP_VERSION: string = __APP_VERSION__

/**
 * Notes for a version, or `undefined` when that build shipped nothing worth
 * telling the reader about.
 *
 * The absence is meaningful and callers must handle it: an internal-only release
 * has no entry here, and the banner falls back to naming no change rather than
 * inventing one.
 */
export function releaseFor(version: string): Release | undefined {
  return RELEASES.find((release) => release.version === version)
}

/** The notes for the build currently running. */
export function currentRelease(): Release | undefined {
  return releaseFor(APP_VERSION)
}
