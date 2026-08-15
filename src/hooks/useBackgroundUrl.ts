import { useEffect, useState } from 'react'
import { getCoverObjectUrl } from '../api/covers'
import type { Background } from '../types/domain'

/** Object URL for an uploaded background. Built-ins and colours need none. */
export function useBackgroundUrl(background: Background | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>()

  const blobKey = background?.kind === 'upload' ? background.blobKey : undefined

  useEffect(() => {
    if (!blobKey) {
      setUrl(undefined)
      return
    }

    let cancelled = false
    void getCoverObjectUrl(blobKey).then((next) => {
      if (!cancelled) setUrl(next)
    })

    return () => {
      cancelled = true
    }
  }, [blobKey])

  return url
}
