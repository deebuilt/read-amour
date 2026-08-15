/**
 * Generates the favicon and PWA icons.
 *
 * The mark is the wordmark's idea reduced to one letter: a roman "R" and an
 * italic "A" sharing a baseline, the same roman-into-italic join that makes
 * "ReadAmour" read as one word. Drawn as type rather than as a book glyph
 * because every reading app on a home screen is a book glyph, and the point of
 * an icon is to be found at a glance among thirty others.
 *
 * Rendered from SVG so the source stays editable and every size is sharp.
 *
 * Run with: node scripts/generate-icons.mjs
 */

import { writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(here, '..', 'public')
const FONTS = path.join(here, '..', 'node_modules', '@fontsource', 'fraunces', 'files')

const PAPER = '#f7f3ec'
const INK = '#1c1a17'
const ACCENT = '#8c2f39'

/**
 * Fonts must be embedded as base64 in the SVG. librsvg (which sharp uses) does
 * not resolve @font-face against a network or a system font by name, so a
 * referenced face silently falls back and the mark renders in the wrong type.
 */
async function embeddedFonts() {
  const roman = await readFile(path.join(FONTS, 'fraunces-latin-700-normal.woff2'))
  const italic = await readFile(path.join(FONTS, 'fraunces-latin-400-italic.woff2'))

  return `
    @font-face {
      font-family: 'F';
      font-style: normal;
      font-weight: 700;
      src: url(data:font/woff2;base64,${roman.toString('base64')}) format('woff2');
    }
    @font-face {
      font-family: 'F';
      font-style: italic;
      font-weight: 400;
      src: url(data:font/woff2;base64,${italic.toString('base64')}) format('woff2');
    }
  `
}

/**
 * @param {object} options
 * @param {number} options.size
 * @param {boolean} options.maskable Maskable icons are cropped to a circle by
 *   the launcher, so the mark must sit inside the safe zone with a full bleed
 *   ground behind it.
 */
async function markSvg({ size, maskable = false }) {
  const fonts = await embeddedFonts()
  // Two letters set side by side are roughly 1.3em wide, so the em size has to
  // stay well under the frame or the pair runs off both edges. The safe zone
  // for a maskable icon is the middle 80%, which tightens it further.
  const scale = maskable ? 0.44 : 0.56
  const fontSize = size * scale
  const baseline = maskable ? size * 0.64 : size * 0.68
  const radius = maskable ? 0 : size * 0.22

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <style>${fonts}</style>
      <rect width="${size}" height="${size}" rx="${radius}" fill="${PAPER}"/>
      <text x="50%" y="${baseline}" text-anchor="middle" font-family="F" font-size="${fontSize}">
        <tspan font-weight="700" fill="${INK}" letter-spacing="${-fontSize * 0.04}">R</tspan><tspan
          font-style="italic" font-weight="400" fill="${ACCENT}">A</tspan>
      </text>
    </svg>
  `)
}

async function main() {
  const targets = [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'apple-touch-icon.png', size: 180 },
    { file: 'icon-512-maskable.png', size: 512, maskable: true },
  ]

  for (const { file, size, maskable } of targets) {
    const svg = await markSvg({ size, maskable: Boolean(maskable) })
    await sharp(svg).png().toFile(path.join(PUBLIC, file))
    console.log(`${file.padEnd(26)} ${size}x${size}${maskable ? ' (maskable)' : ''}`)
  }

  // The favicon keeps its own SVG so it stays crisp at 16px in a browser tab.
  const favicon = await markSvg({ size: 64 })
  await writeFile(path.join(PUBLIC, 'favicon.svg'), favicon)
  console.log('favicon.svg'.padEnd(26) + 'vector')
}

await main()
