/**
 * Compresses the curated background images in place.
 *
 * Sources come off Unsplash at 4000px or more, but the poster is 1080 wide and
 * a tile is drawn at half that. Shipping the originals means a phone
 * downloading roughly fourteen times the pixels it can display, which is the
 * difference between a PWA that opens instantly and one that feels broken on
 * mobile data.
 *
 * Two targets, because the two kinds of image are used differently:
 *
 *   crop  — drawn edge to edge at 1080x1920. Resized to 1400px wide, leaving
 *           headroom for the crop without hoarding pixels.
 *   tile  — drawn at 540px square and repeated. Resized to 1080 square, which
 *           is 2x the drawn size so it stays crisp on a retina phone.
 *
 * Originals are copied to `scripts/.originals/` first, so a re-run never
 * compounds compression and a bad result can be undone.
 *
 * Run with: node scripts/compress-backgrounds.mjs
 */

import { readdir, mkdir, copyFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const BACKGROUNDS = path.join(here, '..', 'src', 'assets', 'backgrounds')
const ORIGINALS = path.join(here, '.originals')

const SQUARE_TOLERANCE = 0.15
const TILE_SIZE = 1080
const CROP_WIDTH = 1400
const QUALITY = 82

function isJpeg(name) {
  return /\.jpe?g$/i.test(name)
}

async function main() {
  await mkdir(ORIGINALS, { recursive: true })

  const names = (await readdir(BACKGROUNDS)).filter(isJpeg).sort()
  if (names.length === 0) {
    console.log('No background images found.')
    return
  }

  let before = 0
  let after = 0

  for (const name of names) {
    const file = path.join(BACKGROUNDS, name)
    const backup = path.join(ORIGINALS, name)

    // Always compress from the pristine original, never from a prior run.
    if (!existsSync(backup)) {
      await copyFile(file, backup)
    }

    const originalSize = (await stat(backup)).size
    const image = sharp(backup)
    const meta = await image.metadata()
    const ratio = (meta.width ?? 1) / (meta.height ?? 1)
    const isTile = Math.abs(ratio - 1) <= SQUARE_TOLERANCE

    const resized = isTile
      ? image.resize(TILE_SIZE, TILE_SIZE, { fit: 'cover' })
      : image.resize(CROP_WIDTH, null, { withoutEnlargement: true })

    // `mozjpeg` buys roughly 10% over the default encoder at the same quality.
    const buffer = await resized.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer()
    await sharp(buffer).toFile(file)

    const newSize = (await stat(file)).size
    before += originalSize
    after += newSize

    const saved = Math.round((1 - newSize / originalSize) * 100)
    console.log(
      `${name.padEnd(20)} ${(originalSize / 1024).toFixed(0).padStart(5)}KB -> ` +
        `${(newSize / 1024).toFixed(0).padStart(4)}KB  (-${saved}%)  ${isTile ? 'tile' : 'crop'}`,
    )
  }

  console.log('---')
  console.log(
    `${names.length} files: ${(before / 1024 / 1024).toFixed(1)}MB -> ` +
      `${(after / 1024 / 1024).toFixed(2)}MB (-${Math.round((1 - after / before) * 100)}%)`,
  )
}

await main()
