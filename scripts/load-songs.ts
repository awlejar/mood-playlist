import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSongs } from '../src/data/parse.ts'

export const SONGS_DIR = join(import.meta.dirname, '../src/data/songs')

export function loadSongs() {
  const files = readdirSync(SONGS_DIR).filter(f => f.endsWith('.txt')).sort()
  return parseSongs(files.map(f => readFileSync(join(SONGS_DIR, f), 'utf8')))
}
