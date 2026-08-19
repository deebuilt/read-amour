import { useEffect, useMemo, useState } from 'react'
import { getCoverObjectUrl } from '../api/covers'

/**
 * Object URLs for an arbitrary set of stored covers.
 *
 * `useCoverUrls` answers "what does this board need", which is the right
 * question for the poster and the wrong one everywhere else. The suggestions
 * panel showed covers only where a suggestion's books happened to overlap the
 * poster that was open — so a strip filled in after previewing an idea, and
 * emptied again when the reader switched posters. It looked like the covers were
 * being fetched per poster. They were not: the blobs were in IndexedDB the whole
 * time, and nothing had ever asked for URLs outside the open board.
 *
 * So this takes blob keys rather than a board. No network, no book records — it
 * reads blobs the app already stored, and `getCoverObjectUrl` caches by key, so
 * a cover shared across several posters costs one URL for the life of the
 * session however many surfaces show it.
 *
 * What it deliberately does NOT do is resolve a *missing* cover. A book whose
 * cover was never fetched has no blob to read, and this returns nothing for it —
 * the caller renders a placeholder. Fetching here would put dozens of network
 * requests behind opening a drawer, which is the cost the import flow is
 * carefully built to keep out of the way.
 */
export function useCoverUrlsFor(keys: readonly (string | undefined)[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map())

  /**
   * A stable dependency, so the effect re-runs when the *set* of covers
   * changes rather than on every render.
   *
   * Sorted and de-duplicated: callers build these lists by mapping over books,
   * and the same covers arriving in a different order — or one cover shared by
   * two suggestions — must not read as a different request.
   */
  const signature = useMemo(() => {
    const present = keys.filter((key): key is string => typeof key === 'string')
    return [...new Set(present)].sort().join(',')
  }, [keys])

  useEffect(() => {
    if (signature.length === 0) {
      setUrls(new Map())
      return
    }

    let cancelled = false

    async function load(): Promise<void> {
      const wanted = signature.split(',')
      const resolved = new Map<string, string>()

      await Promise.all(
        wanted.map(async (key) => {
          const url = await getCoverObjectUrl(key)
          if (url) resolved.set(key, url)
        }),
      )

      if (cancelled) return
      setUrls(resolved)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [signature])

  return urls
}
