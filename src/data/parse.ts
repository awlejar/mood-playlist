import { GENRES, MOOD_BY_KEY } from './moods.ts'

export interface Song {
  id: string
  title: string
  artist: string
  moods: string[]
  genre: string
  year: number
  energy: number
  lang: 'ko' | 'en' | 'ja' | 'etc'
}

/** 비교용으로 곡명·가수명을 정규화한다. 괄호 속 feat./부제는 버린다. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(feat|ft|with)\b\.?.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function songKey(title: string, artist: string): string {
  return `${norm(title)}::${norm(artist.split(/,|&| x | and /i)[0])}`
}

/**
 * 곡 목록 텍스트를 파싱한다.
 *   @장르
 *   곡명 | 가수 | 무드1,무드2 | 연도 | 에너지
 * 같은 곡이 여러 번 나오면 무드를 합친다.
 */
export function parseSongs(sources: string[]): { songs: Song[]; warnings: string[] } {
  const byKey = new Map<string, Song>()
  const warnings: string[] = []
  for (const src of sources) {
    let genre = 'pop'
    for (const raw of src.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      if (line.startsWith('@')) {
        genre = line.slice(1).trim()
        if (!GENRES[genre]) warnings.push(`알 수 없는 장르: ${genre}`)
        continue
      }
      const parts = line.split('|').map(p => p.trim())
      if (parts.length < 5) {
        warnings.push(`형식 오류: ${line}`)
        continue
      }
      const [title, artist, moodStr, yearStr, energyStr] = parts
      const moods = moodStr.split(',').map(m => m.trim()).filter(Boolean)
      for (const m of moods) if (!MOOD_BY_KEY.has(m)) warnings.push(`알 수 없는 무드 "${m}": ${line}`)
      const key = songKey(title, artist)
      const prev = byKey.get(key)
      if (prev) {
        for (const m of moods) if (!prev.moods.includes(m)) prev.moods.push(m)
        continue
      }
      byKey.set(key, {
        id: key,
        title,
        artist,
        moods: moods.filter(m => MOOD_BY_KEY.has(m)),
        genre,
        year: Number(yearStr) || 0,
        energy: Math.min(5, Math.max(1, Number(energyStr) || 3)),
        lang: GENRES[genre]?.lang ?? 'en',
      })
    }
  }
  return { songs: [...byKey.values()], warnings }
}
