import { parseSongs, type Song } from './data/parse.ts'

export interface SongMeta { c?: string; p?: string; d?: string }
export interface ChartItem { title: string; artist: string; cover?: string; url?: string }

const sources = import.meta.glob('./data/songs/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ordered = Object.keys(sources).sort().map(k => sources[k])

let catalog: Song[] = parseSongs(ordered).songs
let meta: Record<string, SongMeta> = {}

/** 배포할 때 GitHub Actions가 만든 songs-meta.json(앨범아트·미리듣기·검증 결과)을 붙인다. 없으면 그냥 넘어간다. */
export async function loadMeta(): Promise<void> {
  try {
    const r = await fetch('./songs-meta.json', { cache: 'no-cache' })
    if (!r.ok) return
    const j = (await r.json()) as { songs?: Record<string, SongMeta>; missing?: string[] }
    meta = j.songs ?? {}
    const missing = new Set(j.missing ?? [])
    if (missing.size) catalog = catalog.filter(s => !missing.has(s.id))
  } catch {
    /* 메타가 없어도 동작한다 */
  }
}

export async function loadCharts(): Promise<ChartItem[]> {
  try {
    const r = await fetch('./charts.json', { cache: 'no-cache' })
    if (!r.ok) return []
    const j = (await r.json()) as Record<string, ChartItem[]>
    return [...(j.kr ?? []), ...(j.us ?? []), ...(j.jp ?? [])]
  } catch {
    return []
  }
}

export const getCatalog = () => catalog
export const getMeta = (id: string): SongMeta | undefined => meta[id]
