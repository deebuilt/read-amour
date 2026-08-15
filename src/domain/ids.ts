/**
 * Unique ids, from wherever the browser will give them.
 *
 * `crypto.randomUUID()` is only defined in a **secure context** — HTTPS, or
 * `localhost`. It is absent over plain HTTP on a LAN address, which is exactly
 * how this app is opened on a phone: `http://192.168.x.x:8204`.
 *
 * That is not a testing inconvenience, it is a crash. `createBoard()` calls
 * this on first load to mint a poster id, so on a phone the app threw before it
 * had a board at all — the shell painted and nothing else ever did. An empty
 * canvas, no books, and an empty design drawer, with no error visible to the
 * user. For a mobile-first app it meant the phone was the one device the work
 * could not be checked on.
 *
 * Deployment is HTTPS on GitHub Pages, so production always had the native
 * call. The fallback exists for the LAN dev case and for any future context
 * that is not secure — and being a fallback, it must never be *preferred*:
 * `crypto.randomUUID()` is a cryptographically strong generator and this is
 * not, so the native one is used wherever it exists.
 */

/**
 * A v4 UUID, using the platform generator when it is available.
 *
 * The fallback builds the same shape from `crypto.getRandomValues`, which has
 * no secure-context requirement, and only falls back again to `Math.random`
 * where even that is missing. Collision risk at this app's scale — a few
 * hundred books and posters on one device — is negligible on any of the three,
 * but the ordering keeps the strongest available source in use.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  // Version 4, variant 1 — the bits that make this a well-formed random UUID
  // rather than an arbitrary hex string, so ids from either path are
  // indistinguishable in storage.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex: string[] = []
  for (let i = 0; i < bytes.length; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, '0'))
  }

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}
