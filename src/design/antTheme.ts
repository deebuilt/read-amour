import { theme as antdTheme, type ThemeConfig } from 'antd'
import { fontSize, radius } from './tokens'
import type { ResolvedTheme } from '../hooks/useTheme'

/**
 * Ant Design theme, built from the same palette as the chrome.
 *
 * Ant's tokens are resolved in JS and fed to its style engine, so they cannot
 * be CSS custom properties — a `var()` here reaches Ant's colour maths as an
 * unparseable string and derived states (hover, disabled, focus ring) collapse.
 * The two palettes are therefore declared here as literals and must stay in
 * step with `theme.css`, which is why both live in this directory.
 */

const LIGHT = {
  ink: '#1c1a17',
  inkSoft: '#4a4540',
  inkFaint: '#8a8179',
  paper: '#f7f3ec',
  paperRaised: '#fffdf9',
  line: '#e2dbd0',
  accent: '#8c2f39',
} as const

const DARK = {
  ink: '#f2ede4',
  inkSoft: '#bdb5a9',
  inkFaint: '#8b837a',
  paper: '#171614',
  paperRaised: '#201e1b',
  line: '#322f2b',
  accent: '#c9636c',
} as const

export function buildAntTheme(mode: ResolvedTheme): ThemeConfig {
  const palette = mode === 'dark' ? DARK : LIGHT

  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.accent,
      colorText: palette.ink,
      colorTextSecondary: palette.inkSoft,
      colorTextTertiary: palette.inkFaint,
      colorBgBase: palette.paper,
      colorBgContainer: palette.paperRaised,
      colorBgElevated: palette.paperRaised,
      colorBorder: palette.line,
      colorBorderSecondary: palette.line,
      borderRadius: radius.md,
      fontSize: fontSize.base,
      fontFamily:
        '"Archivo", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    components: COMPONENTS,
  }
}

const COMPONENTS: ThemeConfig['components'] = {
  Button: {
    // Squared off; pill buttons read as template-generated.
    borderRadius: radius.md,
    controlHeight: 40,
    fontWeight: 500,
  },
  Drawer: {
    paddingLG: 20,
  },
  Input: {
    controlHeight: 40,
  },
  Slider: {
    handleSize: 12,
    handleSizeHover: 14,
  },
}
