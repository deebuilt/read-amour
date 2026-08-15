import { useEffect, useState } from 'react'
import { inferFit, type BackgroundFit } from '../design/backgroundFit'

/**
 * Whether a background image should be cropped or tiled.
 *
 * Dimensions are measured once per URL and cached for the session — the same
 * background is re-rendered constantly as the board is edited, and decoding it
 * again on every render to read two numbers would be wasteful.
 *
 * An explicit override from the filename skips measurement entirely.
 */

const fitCache = new Map<string, BackgroundFit>()

export function useImageFit(url: string | undefined, override?: BackgroundFit): BackgroundFit {
  const [fit, setFit] = useState<BackgroundFit>(
    () => override ?? (url ? (fitCache.get(url) ?? 'cover') : 'cover'),
  )

  useEffect(() => {
    if (override) {
      setFit(override)
      return
    }
    if (!url) return

    const cached = fitCache.get(url)
    if (cached) {
      setFit(cached)
      return
    }

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      const measured = inferFit(image.naturalWidth, image.naturalHeight)
      fitCache.set(url, measured)
      if (!cancelled) setFit(measured)
    }
    image.src = url

    return () => {
      cancelled = true
    }
  }, [url, override])

  return fit
}
