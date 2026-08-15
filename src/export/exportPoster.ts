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
 * Trigger a download.
 *
 * iOS Safari ignores the `download` attribute for blob URLs in some versions,
 * which would leave the user with no way to save. Where the Web Share API can
 * handle files, sharing is offered first — on a phone that is the better
 * outcome anyway, since it hands the image straight to Instagram.
 */
export async function downloadPoster(node: HTMLElement, options: ExportOptions): Promise<void> {
  const blob = await posterToBlob(node, options.scale ?? 1)
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

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = options.fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoking immediately can cancel the download in Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function posterFileName(month: string): string {
  return `read-amour-${month}.png`
}
