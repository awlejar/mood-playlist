import * as dz from './api/deezer.ts'
import { searchSong, bigArtwork } from './api/itunes.ts'
import { norm } from './data/parse.ts'
import type { Track } from './recommend.ts'

// 앨범아트·미리듣기·Apple Music 링크를 채운다. 한 번 찾은 결과는 브라우저에 저장해 둔다.
const STORE = 'mp-enrich-v1'
type Saved = { c?: string; p?: string; a?: string; d?: string; t: number }
let saved: Record<string, Saved> = {}
try {
  saved = JSON.parse(localStorage.getItem(STORE) ?? '{}')
} catch {
  saved = {}
}
function persist() {
  try {
    const entries = Object.entries(saved).sort((a, b) => b[1].t - a[1].t).slice(0, 3000)
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* 저장 공간이 없으면 넘어간다 */
  }
}

function apply(t: Track, s: Saved) {
  t.cover ??= s.c
  t.preview ??= s.p
  t.appleUrl ??= s.a
  t.deezerUrl ??= s.d
}

export async function enrichDeezer(t: Track): Promise<void> {
  const s = saved[t.key]
  if (s) apply(t, s)
  if (t.cover && t.preview) return
  try {
    const title = t.title.replace(/\s*\(.*?\)\s*/g, ' ').trim()
    let found = await dz.searchTracks(`artist:"${t.artist}" track:"${title}"`, 3)
    if (!found.length) found = await dz.searchTracks(`${t.artist} ${title}`, 5)
    const nt = norm(title)
    const best = found.find(x => norm(x.title).includes(nt) || nt.includes(norm(x.title))) ?? found[0]
    if (!best) return
    t.cover ??= best.album?.cover_medium
    t.preview ??= best.preview
    t.deezerUrl ??= best.link
    saved[t.key] = { ...saved[t.key], c: t.cover, p: t.preview, d: t.deezerUrl, t: Date.now() }
    persist()
  } catch {
    /* 못 찾으면 기본 이미지로 둔다 */
  }
}

export async function enrichApple(t: Track): Promise<void> {
  if (t.appleUrl) return
  const s = saved[t.key]
  if (s?.a) return apply(t, s)
  try {
    const r = await searchSong(t.artist, t.title)
    if (!r) return
    t.appleUrl = r.trackViewUrl
    t.cover ??= bigArtwork(r.artworkUrl100)
    t.preview ??= r.previewUrl
    saved[t.key] = { ...saved[t.key], a: t.appleUrl, c: t.cover, p: t.preview, t: Date.now() }
    persist()
  } catch {
    /* 검색 링크로 대신한다 */
  }
}
