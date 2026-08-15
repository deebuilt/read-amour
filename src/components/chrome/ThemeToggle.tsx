import { Tooltip } from 'antd'
import type { ThemePreference } from '../../hooks/useTheme'
import styles from './ThemeToggle.module.css'

/**
 * Single-button theme control cycling system → light → dark.
 *
 * A button rather than a switch because there are three states, and a switch
 * that silently drops "follow my system" is the usual mistake here. The glyphs
 * are drawn as SVG rather than emoji — emoji in UI chrome renders differently
 * on every platform and never matches the surrounding type.
 */

interface ThemeToggleProps {
  preference: ThemePreference
  onCycle: () => void
}

const LABELS: Record<ThemePreference, string> = {
  system: 'Following your system',
  light: 'Light',
  dark: 'Dark',
}

export function ThemeToggle({ preference, onCycle }: ThemeToggleProps) {
  return (
    <Tooltip title={LABELS[preference]} placement="bottomRight">
      <button
        type="button"
        className={styles.button}
        onClick={onCycle}
        aria-label={`Theme: ${LABELS[preference]}. Tap to change.`}
      >
        {preference === 'system' && (
          <svg viewBox="0 0 20 20" className={styles.icon} aria-hidden="true">
            <rect x="2.5" y="4" width="15" height="10" rx="1.5" />
            <path d="M7 16.5h6" />
          </svg>
        )}
        {preference === 'light' && (
          <svg viewBox="0 0 20 20" className={styles.icon} aria-hidden="true">
            <circle cx="10" cy="10" r="3.6" />
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4" />
          </svg>
        )}
        {preference === 'dark' && (
          <svg viewBox="0 0 20 20" className={styles.icon} aria-hidden="true">
            <path d="M16 11.4A6.6 6.6 0 0 1 8.6 4a6.6 6.6 0 1 0 7.4 7.4z" />
          </svg>
        )}
      </button>
    </Tooltip>
  )
}
