import { jsonp } from './jsonp.ts'

// Deezer 공개 API: 키 없이 검색·비슷한 가수·인기곡을 준다. output=jsonp로 CORS를 피한다.
const BASE = 'https://api.deezer.com'

export interface DzArtist { id: number; name: string; picture_medium?: string }
export interface DzTrack {
  id: number
  title: string
  title_short?: string
  preview?: string
  link?: string
  rank?: number
  artist: DzArtist
  album?: { cover_medium?: string; cover_big?: string; title?: string }
}
interface List<T> { data?: T[]; error?: unknown }

const cache = new Map<string, Promise<unknown>>()
function call<T>(path: string): Promise<T> {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}output=jsonp`
  if (!cache.has(url)) {
    const p = jsonp<T>(url).catch(err => {
      cache.delete(url)
      throw err
    })
    cache.set(url, p)
  }
  return cache.get(url) as Promise<T>
}

export async function searchArtist(q: string): Promise<DzArtist | null> {
  const r = await call<List<DzArtist>>(`/search/artist?q=${encodeURIComponent(q)}&limit=5`)
  return r.data?.[0] ?? null
}

export async function searchTracks(q: string, limit = 5): Promise<DzTrack[]> {
  const r = await call<List<DzTrack>>(`/search/track?q=${encodeURIComponent(q)}&limit=${limit}`)
  return r.data ?? []
}

export async function relatedArtists(id: number, limit = 20): Promise<DzArtist[]> {
  const r = await call<List<DzArtist>>(`/artist/${id}/related?limit=${limit}`)
  return r.data ?? []
}

export async function topTracks(id: number, limit = 10): Promise<DzTrack[]> {
  const r = await call<List<DzTrack>>(`/artist/${id}/top?limit=${limit}`)
  return r.data ?? []
}
