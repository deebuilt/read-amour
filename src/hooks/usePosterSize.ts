import { useEffect, useRef, useState } from 'react'
import { POSTER } from '../design/tokens'

/**
 * Largest poster width that fits the stage without cropping.
 *
 * Height-bound as often as width-bound: on a phone the 9:16 poster is limited
 * by available height, on a desktop by a max width that keeps it from becoming
 * a wall. Measured with ResizeObserver rather than window size so drawer
 * transitions and virtual keyboards do not desynchronise the scale.
 */

const MAX_POSTER_WIDTH = 460

interface UsePosterSizeResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  posterWidth: number
}

export function usePosterSize(): UsePosterSizeResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const [posterWidth, setPosterWidth] = useState(320)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const { width, height } = entry.contentRect
      const widthFromHeight = height * POSTER.aspectRatio
      setPosterWidth(Math.max(200, Math.min(width, widthFromHeight, MAX_POSTER_WIDTH)))
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return { containerRef, posterWidth }
}
