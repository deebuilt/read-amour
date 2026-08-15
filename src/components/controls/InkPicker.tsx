import { ColorPicker, Typography } from 'antd'
import { INK_COLORS, luminance } from '../../design/inkColors'
import styles from './InkPicker.module.css'

/**
 * Poster text colour.
 *
 * A row of curated inks plus a full picker for matching a specific hue in a
 * background image. Kept as its own component because the same control belongs
 * on any future per-element colour (a caption tint, a slot outline) rather than
 * being inlined once into the design panel.
 */

interface InkPickerProps {
  value: string
  onChange: (hex: string) => void
}

export function InkPicker({ value, onChange }: InkPickerProps) {
  const isCustom = !INK_COLORS.some((ink) => ink.value.toLowerCase() === value.toLowerCase())

  return (
    <div className={styles.root}>
      <div className={styles.swatches}>
        {INK_COLORS.map((ink) => {
          const isActive = ink.value.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={ink.id}
              type="button"
              className={isActive ? styles.swatchActive : styles.swatch}
              style={{
                background: ink.value,
                // Pale inks vanish against the panel without an outline.
                borderColor: luminance(ink.value) > 0.8 ? 'var(--ra-line-strong)' : 'transparent',
              }}
              onClick={() => onChange(ink.value)}
              aria-label={ink.name}
              aria-pressed={isActive}
            />
          )
        })}

        <ColorPicker
          value={value}
          onChangeComplete={(next) => onChange(next.toHexString())}
          disabledAlpha
          placement="topRight"
        >
          <button
            type="button"
            className={isCustom ? styles.customActive : styles.custom}
            aria-label="Custom colour"
            aria-pressed={isCustom}
          >
            <span className={styles.customInner} style={{ background: value }} />
          </button>
        </ColorPicker>
      </div>

      <Typography.Text className={styles.hint}>
        Pick a colour from the artwork for a poster that looks composed rather than captioned.
      </Typography.Text>
    </div>
  )
}
