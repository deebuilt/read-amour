import { useEffect, useState } from 'react'
import { extractPalette, type PaletteSwatch } from '../design/palette'

/**
 * Grounds sampled from the covers currently on the poster.
 *
 * Extraction decodes every cover to a bitmap and walks its pixels, so this is
 * async and genuinely costs something — it cannot be a `useMemo`. It is keyed
 * on the set of cover URLs, so retitling the poster, moving a slider, or
 * dragging the wash does not re-sample twenty covers.
 *
 * The swatches are additive: while they are being computed the Background
 * section is exactly what it was before, and nothing waits on them.
 */

export function useCoverPalette(coverUrls: Map<string, string>): PaletteSwatch[] {
  const [swatches, setSwatches] = useState<PaletteSwatch[]>([])

  // A stable dependency: the same covers in any order produce the same key.
  const signature = [...coverUrls.values()].sort().join(',')

  useEffect(() => {
    if (signature === '') {
      setSwatches([])
      return
    }

    let cancelled = false

    void extractPalette(signature.split(',')).then((extracted) => {
      if (!cancelled) setSwatches(extracted)
    })

    return () => {
      cancelled = true
    }
  }, [signature])

  return swatches
}
