import { Typography } from 'antd'
import { APP_VERSION, RELEASES } from '../../design/releases'
import styles from './ReleaseNotes.module.css'

/**
 * What changed, kept where it can be found later.
 *
 * The banner is what a reader sees when they did not ask; this is what they see
 * when they did. Two entry points, one story — which is why both read from the
 * same `RELEASES` array rather than each holding their own copy of the text.
 *
 * It lives in About because that panel is the app's front door while reading
 * like a footnote, and giving it something worth opening is a better fix for
 * that than relabelling it.
 *
 * Every release is listed rather than only the newest. The list is short, it is
 * the only record of the app's history a reader can see, and truncating it would
 * save nothing on a panel that already scrolls.
 */

/** "2026-08-17" → "17 August 2026". */
function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function ReleaseNotes() {
  if (RELEASES.length === 0) return null

  return (
    <ol className={styles.releases}>
      {RELEASES.map((release) => (
        <li key={release.version} className={styles.release}>
          <div className={styles.head}>
            <Typography.Text className={styles.headline}>{release.headline}</Typography.Text>
            <Typography.Text className={styles.date}>
              {formatDate(release.date)}
              {/* The version is marked only on the build actually running, which
                  is the one question a version number here can answer. Printing
                  it against every entry would be the version-number theatre the
                  notes are meant to avoid. */}
              {release.version === APP_VERSION && (
                <span className={styles.current}> · you have this</span>
              )}
            </Typography.Text>
          </div>

          <ul className={styles.changes}>
            {release.changes.map((change) => (
              <li key={change} className={styles.change}>
                {change}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}
