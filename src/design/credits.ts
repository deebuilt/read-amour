import creditsFile from '../assets/backgrounds/CREDITS.txt?raw'

/**
 * Background credits, parsed from the plain text file that sits beside the
 * images.
 *
 * A text file rather than a TypeScript module so that adding a background and
 * crediting it are the same kind of edit — drop the image in the folder, add a
 * line next to it. A registry in code would drift the first time someone was
 * in a hurry.
 *
 * Unsplash does not require attribution; this exists because shipping other
 * people's work uncredited is a choice, and this is the other one.
 */

export interface Credit {
  file: string
  author: string
  url?: string
}

function parseLine(line: string): Credit | undefined {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.startsWith('#')) return undefined

  const [file, author, url] = trimmed.split('|').map((part) => part.trim())
  // A row with no author yet is a placeholder, not a credit.
  if (!file || !author) return undefined

  return { file, author, url: url || undefined }
}

export const CREDITS: readonly Credit[] = creditsFile
  .split('\n')
  .map(parseLine)
  .filter((credit): credit is Credit => credit !== undefined)

export function creditFor(file: string): Credit | undefined {
  return CREDITS.find((credit) => credit.file === file)
}
