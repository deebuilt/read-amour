import { Typography } from 'antd'
import { CREDITS } from '../../design/credits'
import { APP_VERSION } from '../../design/releases'
import { BackupControls } from '../controls/BackupControls'
import styles from './AboutPanel.module.css'

/**
 * What this is, where the covers come from, and who made the artwork.
 *
 * Also the honest disclosure that everything lives on the device: people are
 * right to wonder where their reading history went, and "nowhere, it is on
 * your phone" is a better answer when it is stated up front.
 */
interface AboutPanelProps {
  /**
   * Reload the poster list after a restore. Without it the posters land in
   * storage and the open app carries on showing the list it read at startup,
   * which looks exactly like the restore having done nothing.
   */
  onRestored: () => void
}

export function AboutPanel({ onRestored }: AboutPanelProps) {
  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <Typography.Paragraph className={styles.lead}>
          Read Amour turns the books you finished into a poster you can post. Search a title,
          drop the cover into a slot, save the image.
        </Typography.Paragraph>
        <Typography.Paragraph className={styles.body}>
          Everything stays on this device. There is no account and no server — your books, your
          covers, and your posters live in your browser's own storage, which is also why the app
          keeps working with no signal.
        </Typography.Paragraph>
      </section>

      <section className={styles.section}>
        <Typography.Text className={styles.label}>Your library</Typography.Text>
        <BackupControls onRestored={onRestored} />
      </section>

      {/* What's new used to sit here, between the backup controls and the
          credits. It is its own destination in More now: it was the part of this
          panel worth returning to, and burying the app's only changelog inside a
          panel that reads as small print meant nobody returned to it. */}

      <section className={styles.section}>
        <Typography.Text className={styles.label}>Book covers</Typography.Text>
        <Typography.Paragraph className={styles.body}>
          Cover art and book data come from{' '}
          <a href="https://openlibrary.org" target="_blank" rel="noreferrer">
            Open Library
          </a>
          , a project of the Internet Archive.
        </Typography.Paragraph>
      </section>

      {CREDITS.length > 0 && (
        <section className={styles.section}>
          <Typography.Text className={styles.label}>Background artwork</Typography.Text>
          <ul className={styles.credits}>
            {CREDITS.map((credit) => (
              <li key={credit.file} className={styles.credit}>
                {credit.url ? (
                  <a href={credit.url} target="_blank" rel="noreferrer">
                    {credit.author}
                  </a>
                ) : (
                  <span>{credit.author}</span>
                )}
                <span className={styles.creditFile}>{credit.file}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The one place the running build names itself. Useful precisely when
          something looks wrong — "which version am I on" is unanswerable from
          the outside on an installed PWA, where there is no address bar. */}
      <Typography.Text className={styles.version}>Version {APP_VERSION}</Typography.Text>
    </div>
  )
}
