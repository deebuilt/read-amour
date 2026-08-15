import { useCallback, useEffect, useState } from 'react'

/**
 * Chrome theme.
 *
 * Three states rather than two: `system` follows the OS and is the default,
 * while `light` and `dark` are explicit overrides. A two-state toggle silently
 * breaks the (common) case of someone whose phone switches at sunset.
 *
 * Stored in localStorage rather than IndexedDB — it is one short string, and
 * it must be readable synchronously before first paint to avoid a flash of the
 * wrong theme.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'read-amour:theme'

function readStored(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface UseThemeResult {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (next: ThemePreference) => void
  /** Cycles system → light → dark → system, for a single-button control. */
  cycle: () => void
}

export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Track OS changes so `system` stays live rather than sampled once at boot.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  // `system` removes the attribute entirely so the media query governs, rather
  // than pinning a value that would then ignore an OS change.
  useEffect(() => {
    const root = document.documentElement
    if (preference === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', preference)
    }
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const cycle = useCallback(() => {
    setPreferenceState((current) => {
      const next: ThemePreference =
        current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  return { preference, resolved, setPreference, cycle }
}
