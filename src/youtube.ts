import { pool } from './api/jsonp.ts'
import type { Track } from './recommend.ts'

// YouTube Data API 키(무료)를 넣으면 곡마다 영상을 찾아서
// youtube.com/watch_videos 링크 하나로 이어 듣기 플레이리스트를 만든다.
const KEY_STORE = 'mp-yt-key'
const ID_STORE = 'mp-yt-ids'

export function getKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? ''
  } catch {
    return ''
  }
}
export function setKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY_STORE, k)
    else localStorage.removeItem(KEY_STORE)
  } catch {
    /* 무시 */
  }
}

let ids: Record<string, string> = {}
try {
  ids = JSON.parse(localStorage.getItem(ID_STORE) ?? '{}')
} catch {
  ids = {}
}

async function findVideo(t: Track, key: string): Promise<string | null> {
  if (ids[t.key]) return ids[t.key]
  const q = encodeURIComponent(`${t.artist} ${t.title} audio`)
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=id&type=video&videoCategoryId=10&maxResults=1&q=${q}&key=${encodeURIComponent(key)}`,
  )
  if (!r.ok) throw new Error(r.status === 403 ? 'quota' : `http ${r.status}`)
  const j = (await r.json()) as { items?: { id: { videoId: string } }[] }
  const id = j.items?.[0]?.id.videoId ?? null
  if (id) {
    ids[t.key] = id
    try {
      localStorage.setItem(ID_STORE, JSON.stringify(ids))
    } catch {
      /* 무시 */
    }
  }
  return id
}

/** 이어 듣기 링크를 만든다. watch_videos는 한 번에 최대 50곡까지 받는다. */
export async function buildPlaylistUrl(tracks: Track[], key: string, onProgress?: (done: number) => void): Promise<string> {
  let done = 0
  const found = await pool(tracks.slice(0, 50), 4, async t => {
    const id = await findVideo(t, key)
    onProgress?.(++done)
    return id
  })
  const list = found.filter((x): x is string => !!x)
  if (!list.length) throw new Error('empty')
  return `https://www.youtube.com/watch_videos?video_ids=${list.join(',')}`
}
