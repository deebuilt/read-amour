import { toBlob } from 'html-to-image'
import { POSTER } from '../design/tokens'

/**
 * PNG export.
 *
 * The poster element is already exactly 1080x1920 in the DOM — it is only
 * *displayed* scaled — so export undoes the preview transform and captures the
 * element at its true size. No re-layout, no second rendering path, no drift
 * between what was previewed and what was downloaded.
 */

export interface ExportOptions {
  fileName: string
  /** Multiplier on the 1080x1920 base. 1 is already Story resolution. */
  scale?: number
}

/**
 * Fonts must be loaded before capture. html-to-image inlines computed styles,
 * and a face that has not finished loading captures as its fallback — the
 * poster silently exports in Times New Roman.
 */
async function waitForFonts(): Promise<void> {
  if ('fonts' in document) {
    await document.fonts.ready
  }
}

/**
 * Images inside the node must be decoded before capture. A cover that is still
 * decoding renders as an empty slot in the PNG even though the preview shows
 * it — the classic "export is missing an image" bug.
 */
async function waitForImages(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) return
      try {
        await img.decode()
      } catch {
        // A broken image should leave a gap, not abort the export.
      }
    }),
  )
}

export async function posterToBlob(node: HTMLElement, scale = 1): Promise<Blob> {
  await waitForFonts()
  await waitForImages(node)

  const blob = await toBlob(node, {
    width: POSTER.width,
    height: POSTER.height,
    pixelRatio: scale,
    cacheBust: false,
    // The node carries a display-scale transform for the preview; the capture
    // needs it at true size and origin.
    style: {
      transform: 'none',
      transformOrigin: 'top left',
      margin: '0',
    },
  })

  if (!blob) {
    throw new Error('Export produced no image.')
  }
  return blob
}

/**
 * Save the poster to the device.
 *
 * Saving and sharing are separate calls, and the difference matters: this one
 * writes a file and never opens the OS share sheet. An earlier version offered
 * the share sheet whenever the browser could handle files, on the reasoning
 * that a phone user is posting anyway — but that quietly took away the copy.
 * Posting is one thing you might do with a poster; keeping it is another, and
 * the app should not decide which was meant.
 *
 * iOS Safari has historically ignored `download` on blob URLs, which would
 * leave nothing at all happening. Sharing is the only route to a file there, so
 * it stays as a FALLBACK — reached when the download cannot be started, never
 * ahead of it.
 */
export async function savePoster(node: HTMLElement, options: ExportOptions): Promise<void> {
  const blob = await posterToBlob(node, options.scale ?? 1)

  if (supportsDownload()) {
    triggerDownload(blob, options.fileName)
    return
  }

  // No download attribute: the share sheet is the only way to reach the file.
  const file = new File([blob], options.fileName, { type: 'image/png' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      // A cancelled share is a user decision, not a failure to fall back from.
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }

  // Nothing else to try. Opening the image at least gives a long-press save.
  triggerDownload(blob, options.fileName)
}

/**
 * Hand the poster to the OS share sheet.
 *
 * Only meaningful where the Web Share API takes files — `canSharePoster()`
 * answers that, so the UI can leave the option out rather than offering a
 * button that does nothing.
 */
export async function sharePoster(node: HTMLElement, options: ExportOptions): Promise<void> {
  const blob = await posterToBlob(node, options.scale ?? 1)
  const file = new File([blob], options.fileName, { type: 'image/png' })

  if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) {
    // Should not be reachable from a UI that checked first, but a share the
    // device cannot do must still leave the user with the image.
    triggerDownload(blob, options.fileName)
    return
  }

  try {
    await navigator.share({ files: [file] })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    throw error
  }
}

/** Whether this device can share image files at all. */
export function canSharePoster(): boolean {
  if (typeof navigator.canShare !== 'function') return false
  // A probe file: `canShare` inspects the type, not the bytes.
  const probe = new File([new Blob([], { type: 'image/png' })], 'probe.png', {
    type: 'image/png',
  })
  return navigator.canShare({ files: [probe] })
}

/**
 * Whether `<a download>` will actually save a blob.
 *
 * The attribute is present on every modern browser's anchor element, so a
 * feature test alone says yes even on iOS Safari, where it does nothing for
 * blob URLs. That leaves the OS check as the honest test.
 */
function supportsDownload(): boolean {
  if (!('download' in document.createElement('a'))) return false

  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)

  // Every iOS browser is Safari's engine underneath, so this is not a
  // Safari-only quirk — it applies to Chrome and Firefox on iOS too.
  return !isIOS
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoking immediately can cancel the download in Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function posterFileName(month: string): string {
  return `read-amour-${month}.png`
}
