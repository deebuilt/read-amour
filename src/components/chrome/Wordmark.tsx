import styles from './Wordmark.module.css'

/**
 * The Read Amour wordmark.
 *
 * Set as a single word — "Read" in the high-contrast serif, "Amour" in its
 * italic, closed up with no space or rule between them. The join is the whole
 * idea: one word that changes voice halfway through reads as a designed mark,
 * where two spaced words read as a heading.
 */
export function Wordmark() {
  return (
    <span className={styles.lockup} aria-label="Read Amour">
      <span className={styles.read} aria-hidden="true">
        Read
      </span>
      <span className={styles.amour} aria-hidden="true">
        Amour
      </span>
    </span>
  )
}
