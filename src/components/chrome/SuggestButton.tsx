import { Tooltip } from 'antd'
import styles from './SuggestButton.module.css'

/**
 * The app offering to make something, from the header's left corner.
 *
 * That corner was a 44px spacer whose only job was to balance the theme toggle
 * so the wordmark sat optically centred — a permanent, hand-sized, empty slot in
 * the app's most persistent chrome. The button is the same width, so the
 * wordmark stays centred by exactly the arithmetic that centred it before.
 *
 * **Not behind More.** More holds things with an end to them: Import is used
 * once, About is read once, What's new is read per release. Suggestions are the
 * opposite — they change whenever the library does, and they are the one surface
 * here with something new to say on a normal Tuesday. Burying a feature whose
 * whole job is to be noticed behind a tap labelled "More" would defeat it.
 *
 * **The sparkle is drawn, not typed.** The Unicode sparkle is
 * emoji-presentation on most platforms, so a glyph would be full-colour on one
 * device, monochrome on another, and tofu where no font carries it — the same
 * reasoning that made `CrownMark` an inline SVG. `ThunderboltOutlined` and
 * `BulbOutlined` are the nearest things antd ships and neither says this;
 * `StarOutlined` is out on the collision rule that killed the gold-star
 * favourite mark, since the poster already draws stars for ratings.
 *
 * The count is quiet and appears only when something is waiting. A permanently
 * lit button over an empty panel teaches a reader to stop pressing it.
 */

interface SuggestButtonProps {
  /** How many suggestions are waiting. Zero renders no mark at all. */
  count: number
  onClick: () => void
  /** Whether the suggestions panel is the open one. */
  isActive: boolean
}

export function SuggestButton({ count, onClick, isActive }: SuggestButtonProps) {
  const label =
    count > 0
      ? `Poster ideas: ${count} waiting`
      : 'Poster ideas from your library'

  return (
    <Tooltip title="Poster ideas" placement="bottomLeft">
      <button
        type="button"
        className={[styles.button, isActive ? styles.active : ''].filter(Boolean).join(' ')}
        onClick={onClick}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
      >
        {/*
          Three four-pointed stars at different sizes — the concave-sided kind,
          which reads as a sparkle where a five-pointed star reads as a rating.
          Filled rather than stroked, so it stays legible at 19px where the
          toggle's outlined glyphs have more room to work with.
        */}
        <svg viewBox="0 0 20 20" className={styles.icon} aria-hidden="true">
          <path d="M11.6 2.4 12.7 5.9 16.2 7 12.7 8.1 11.6 11.6 10.5 8.1 7 7 10.5 5.9z" />
          <path d="M5.6 10.6 6.3 12.7 8.4 13.4 6.3 14.1 5.6 16.2 4.9 14.1 2.8 13.4 4.9 12.7z" />
          <path d="M14.4 12.6 14.9 14.1 16.4 14.6 14.9 15.1 14.4 16.6 13.9 15.1 12.4 14.6 13.9 14.1z" />
        </svg>

        {count > 0 && (
          <span className={styles.count} aria-hidden>
            {count}
          </span>
        )}
      </button>
    </Tooltip>
  )
}
