/**
 * Downscale an uploaded image before it is stored.
 *
 * The curated backgrounds are compressed at build time by
 * `scripts/compress-backgrounds.mjs`, which exists because an Unsplash source
 * is 4000px or more and the poster is 1080 wide — shipping the original means
 * a phone decoding roughly fourteen times the pixels it can display.
 *
 * Uploads had no equivalent. `storeUploadedImage` wrote the `File` into
 * IndexedDB byte for byte, so a photo saved straight off Unsplash sat in the
 * board at full camera resolution and the browser rescaled all 24 megapixels of
 * it on every repaint. That is felt exactly where repaints are continuous: the
 * design drawer stutters as it slides, and the wash slider lags behind the
 * thumb.
 *
 * So this is the build script's job done in the browser, at the same targets
 * and for the same reasons. Anything at or under the target is left completely
 * alone — re-encoding a small image costs quality and buys nothing.
 */

/**
 * Longest edge, in px, for a stored upload.
 *
 * Matches `CROP_WIDTH` in the compression script. The poster is 1080 wide and a
 * background may be cropped, so the headroom is deliberate — but a background
 * is never drawn larger than the frame, and beyond this the extra pixels are
 * only ever thrown away at paint time.
 */
const MAX_EDGE = 1400

/**
 * JPEG quality, matching the build script's `QUALITY`.
 *
 * Backgrounds sit behind cover art and type rather than being examined, and the
 * difference between 82 and 92 is invisible at poster scale while the file is
 * roughly half the size.
 */
const QUALITY = 0.82

/**
 * Files below this are stored untouched whatever their dimensions.
 *
 * A small file is not the problem this solves, and a PNG cover with crisp type
 * would only be degraded by a round trip through JPEG.
 */
const SIZE_FLOOR_BYTES = 400 * 1024

/**
 * Takes a `Blob`, not a `File`.
 *
 * Fresh uploads arrive as `File`, which is a `Blob` — but the retroactive pass
 * in `shrinkStoredUploads` reads blobs back out of IndexedDB, and those are not
 * `File`s and carry no name. Nothing here needs one, so the wider type is the
 * honest signature and both callers fit it.
 */
export async function shrinkForStorage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  // An SVG has no meaningful pixel size and rasterising it would be a downgrade.
  if (file.type === 'image/svg+xml') return file
  if (file.size <= SIZE_FLOOR_BYTES) return file

  try {
    const bitmap = await createImageBitmap(file)

    try {
      const { width, height } = bitmap
      const longest = Math.max(width, height)
      if (longest <= MAX_EDGE) return file

      const scale = MAX_EDGE / longest
      const targetWidth = Math.round(width * scale)
      const targetHeight = Math.round(height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight

      const context = canvas.getContext('2d')
      if (!context) return file

      // Browsers vary in how they downscale; asking for the good filter costs
      // nothing here and avoids the aliasing a naive nearest-neighbour gives on
      // a large reduction.
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

      const blob = await canvasToBlob(canvas, QUALITY)
      // A resize that somehow grew the file is not worth keeping — and a
      // transparent PNG flattened to JPEG can do exactly that.
      if (!blob || blob.size >= file.size) return file
      return blob
    } finally {
      // Frees the decoded pixels immediately rather than waiting for GC, which
      // matters when the source was 24 megapixels.
      bitmap.close()
    }
  } catch {
    // A format the browser cannot decode is still a legitimate file to keep.
    // Storing the original is always safe; the cost is only performance.
    return file
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}
