import { getCatalog, getMeta, loadCharts, type ChartItem } from './catalog.ts'
import { MOOD_BY_KEY, moodsFromText } from './data/moods.ts'
import { norm, songKey, type Song } from './data/parse.ts'
import * as dz from './api/deezer.ts'
import { pool } from './api/jsonp.ts'

export type Region = 'all' | 'ko' | 'global'
export type Era = 'all' | 'new' | '10s' | 'old'

export interface Query {
  text: string
  moods: string[]
  song: string
  artist: string
  count: number
  region: Region
  era: Era
  trending: boolean
  seed: number
}

export interface Track {
  key: string
  title: string
  artist: string
  reason: string
  cover?: string
  preview?: string
  appleUrl?: string
  deezerUrl?: string
  song?: Song
}

export interface Result {
  tracks: Track[]
  moods: string[]
  seedLabel?: string
  notes: string[]
}

type Cand = Track & { score: number; pool: 'seed' | 'db' | 'dz' | 'chart'; lang?: string }

function rngFrom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HANGUL = /[가-힣]/
const KANA = /[぀-ヿ]/

function guessLang(title: string, artist: string, known: Map<string, string>): string | undefined {
  const k = known.get(norm(artist))
  if (k) return k
  if (HANGUL.test(artist + title)) return 'ko'
  if (KANA.test(artist + title)) return 'ja'
  return undefined
}

function regionOk(lang: string | undefined, region: Region): boolean {
  if (region === 'all' || !lang) return true
  return region === 'ko' ? lang === 'ko' : lang !== 'ko'
}

function eraOk(year: number, era: Era): boolean {
  if (era === 'all' || !year) return true
  if (era === 'new') return year >= 2020
  if (era === '10s') return year >= 2010 && year < 2020
  return year < 2010
}

/** 받침에 따라 조사를 고른다: josa('아이유', '와', '과') → '아이유와' */
export function josa(word: string, noFinal: string, withFinal: string): string {
  const ch = word.replace(/["'”’)\]\s]+$/, '').slice(-1)
  const code = ch.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return word + noFinal
  return word + (code % 28 ? withFinal : noFinal)
}

function moodLabel(keys: string[]): string {
  return keys.slice(0, 2).map(k => MOOD_BY_KEY.get(k)?.label ?? k).join(' · ')
}

/** "가수 - 곡명" 또는 "곡명"으로 들어온 입력을 나눈다 */
function splitSongInput(s: string): { title: string; artist?: string } {
  const m = s.split(/\s+[-–—]\s+/)
  if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() }
  return { title: s.trim() }
}

export async function recommend(q: Query): Promise<Result> {
  const rng = rngFrom(q.seed)
  const catalog = getCatalog()
  const notes: string[] = []
  const moods = [...new Set([...q.moods, ...moodsFromText(q.text)])]

  const byId = new Map(catalog.map(s => [s.id, s]))
  const langByArtist = new Map<string, string>()
  const songsByArtist = new Map<string, Song[]>()
  for (const s of catalog) {
    const a = norm(s.artist)
    langByArtist.set(a, s.lang)
    if (!songsByArtist.has(a)) songsByArtist.set(a, [])
    songsByArtist.get(a)!.push(s)
  }

  // ── 1. 입력한 노래·가수를 기준점으로 잡는다 ──
  const seedNames = new Set<string>() // 정규화한 기준 가수 이름
  const seedDz: dz.DzArtist[] = []
  let seedSong: Song | undefined
  let seedTrack: Cand | undefined
  const seedLabels: string[] = []

  try {
    if (q.song.trim()) {
      const { title, artist } = splitSongInput(q.song)
      const nt = norm(title)
      seedSong = catalog.find(s => norm(s.title) === nt && (!artist || norm(s.artist) === norm(artist)))
        ?? catalog.find(s => norm(s.title) === nt)
      const found = await dz.searchTracks(artist ? `artist:"${artist}" track:"${title}"` : title, 5)
        .then(r => (r.length || !artist ? r : dz.searchTracks(`${artist} ${title}`, 5)))
      const best = found.find(t => seedSong && norm(t.artist.name) === norm(seedSong.artist)) ?? found[0]
      if (best) {
        seedDz.push(best.artist)
        seedNames.add(norm(best.artist.name))
        seedTrack = {
          key: songKey(best.title, best.artist.name),
          title: best.title,
          artist: best.artist.name,
          cover: best.album?.cover_medium,
          preview: best.preview,
          deezerUrl: best.link,
          reason: '입력한 곡',
          score: 999,
          pool: 'seed',
          song: seedSong,
        }
        seedLabels.push(`${best.artist.name} - ${best.title}`)
      } else if (seedSong) {
        seedNames.add(norm(seedSong.artist))
        seedLabels.push(`${seedSong.artist} - ${seedSong.title}`)
      } else {
        notes.push(`${josa(`"${q.song}"`, '를', '을')} 찾지 못해서 다른 조건으로 만들었어요.`)
      }
      if (seedSong) seedNames.add(norm(seedSong.artist))
    }
    if (q.artist.trim()) {
      const a = await dz.searchArtist(q.artist.trim())
      if (a) {
        if (!seedDz.some(x => x.id === a.id)) seedDz.push(a)
        seedNames.add(norm(a.name))
        seedLabels.push(a.name)
      } else if (songsByArtist.has(norm(q.artist))) {
        seedNames.add(norm(q.artist))
        seedLabels.push(q.artist)
      } else {
        notes.push(`${josa(`"${q.artist}"`, '를', '을')} 찾지 못해서 다른 조건으로 만들었어요.`)
      }
    }
  } catch {
    notes.push('비슷한 가수를 불러오지 못해서 무드 위주로 골랐어요.')
  }
  const hasSeed = seedNames.size > 0

  // ── 2. 비슷한 가수와 그 인기곡 (Deezer) ──
  const relatedRank = new Map<string, number>()
  const relatedOf = new Map<string, string>()
  const dzCands: Cand[] = []
  if (seedDz.length) {
    try {
      const relatedLists = await Promise.all(seedDz.slice(0, 2).map(a => dz.relatedArtists(a.id, 20).catch(() => [])))
      const related: dz.DzArtist[] = []
      relatedLists.forEach((list, si) => {
        list.forEach((r, i) => {
          const n = norm(r.name)
          if (seedNames.has(n)) return
          if (!relatedRank.has(n) || relatedRank.get(n)! > i) {
            relatedRank.set(n, i)
            relatedOf.set(n, seedDz[si].name)
          }
          if (!related.some(x => x.id === r.id)) related.push(r)
        })
      })
      // 지역 필터에 걸리는 가수는 미리 뺀다
      const relatedOk = related.filter(r => regionOk(guessLang('', r.name, langByArtist), q.region))
      const artistsToFetch: { a: dz.DzArtist; isSeed: boolean }[] = [
        ...seedDz.map(a => ({ a, isSeed: true })),
        ...relatedOk.slice(0, 14).map(a => ({ a, isSeed: false })),
      ]
      const tops = await pool(artistsToFetch, 4, ({ a, isSeed }) =>
        dz.topTracks(a.id, isSeed ? 8 : 5).catch(() => [] as dz.DzTrack[]),
      )
      tops.forEach((list, ai) => {
        const { a, isSeed } = artistsToFetch[ai]
        const n = norm(a.name)
        list.forEach((t, ti) => {
          const key = songKey(t.title, t.artist.name)
          const dbSong = byId.get(key)
          const lang = dbSong?.lang ?? guessLang(t.title, t.artist.name, langByArtist)
          if (!regionOk(lang, q.region)) return
          if (dbSong && !eraOk(dbSong.year, q.era)) return
          let score = 5 + rng() * 3 - ti * 0.35
          if (isSeed) score += 1
          else score -= (relatedRank.get(n) ?? 10) * 0.1
          if (moods.length) {
            const artistSongs = dbSong ? [dbSong] : songsByArtist.get(norm(t.artist.name)) ?? []
            const hits = artistSongs.reduce((m, s) => Math.max(m, s.moods.filter(x => moods.includes(x)).length), 0)
            score += hits * 1.5
          }
          dzCands.push({
            key,
            title: t.title_short || t.title,
            artist: t.artist.name,
            cover: t.album?.cover_medium,
            preview: t.preview,
            deezerUrl: t.link,
            reason: isSeed ? `${a.name} 인기곡` : `${josa(relatedOf.get(n) ?? '', '와', '과')} 비슷한 가수`,
            score,
            pool: 'dz',
            lang,
            song: dbSong,
          })
        })
      })
    } catch {
      notes.push('비슷한 가수를 불러오지 못해서 무드 위주로 골랐어요.')
    }
  }

  // ── 3. 곡 DB 점수 매기기 ──
  const implicitMoods = !moods.length && seedSong ? seedSong.moods : []
  const linked = catalog.filter(s => seedNames.has(norm(s.artist)) || relatedRank.has(norm(s.artist)))
  const seedGenres = new Set(linked.map(s => s.genre))
  if (seedSong) seedGenres.add(seedSong.genre)
  const energies = moods.length
    ? moods.map(m => MOOD_BY_KEY.get(m)!.energy)
    : seedSong
      ? [seedSong.energy]
      : linked.map(s => s.energy)
  const targetEnergy = energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : null

  const dbCands: Cand[] = []
  for (const s of catalog) {
    if (!regionOk(s.lang, q.region) || !eraOk(s.year, q.era)) continue
    const a = norm(s.artist)
    let score = rng() * 2.5
    const hits = s.moods.filter(m => moods.includes(m))
    if (moods.length) {
      if (!hits.length) continue
      score += hits.length * 3
    } else if (implicitMoods.length) {
      score += s.moods.filter(m => implicitMoods.includes(m)).length * 1.5
    }
    let reason = hits.length ? moodLabel(hits) : ''
    if (seedNames.has(a)) {
      score += 5
      reason = `${s.artist} 노래`
    } else if (relatedRank.has(a)) {
      score += 4 - relatedRank.get(a)! * 0.12
      reason = `${josa(relatedOf.get(a) ?? '', '와', '과')} 비슷한 가수`
    } else if (hasSeed && seedGenres.has(s.genre)) {
      score += 2
      if (!reason) reason = '비슷한 장르'
    } else if (hasSeed && !moods.length) {
      score -= 3
    }
    if (targetEnergy != null) score -= Math.abs(s.energy - targetEnergy) * 0.9
    const m = getMeta(s.id)
    dbCands.push({
      key: s.id,
      title: s.title,
      artist: s.artist,
      cover: m?.c,
      preview: m?.p,
      deezerUrl: m?.d,
      reason: reason || '추천곡',
      score,
      pool: 'db',
      lang: s.lang,
      song: s,
    })
  }

  // ── 4. 요즘 인기곡 (Apple Music 차트) ──
  const chartCands: Cand[] = []
  if (q.trending) {
    const charts: ChartItem[] = await loadCharts()
    for (const c of charts) {
      const lang = guessLang(c.title, c.artist, langByArtist)
      if (!regionOk(lang, q.region)) continue
      const key = songKey(c.title, c.artist)
      const dbSong = byId.get(key)
      let score = rng() * 3
      if (dbSong && moods.length) score += dbSong.moods.filter(m => moods.includes(m)).length * 2
      if (seedNames.has(norm(c.artist)) || relatedRank.has(norm(c.artist))) score += 3
      chartCands.push({ key, title: c.title, artist: c.artist, cover: c.cover, appleUrl: c.url, reason: '요즘 인기곡', score, pool: 'chart', lang, song: dbSong })
    }
    if (!charts.length) notes.push('인기 차트를 불러오지 못했어요.')
  }

  // ── 5. 고르기: 풀마다 몫을 정하고, 중복·같은 가수 몰림을 막는다 ──
  const want = q.count
  const picked: Cand[] = []
  const keys = new Set<string>()
  const perArtist = new Map<string, number>()
  const cap = (a: string) => (seedNames.has(a) ? 3 : 2)
  const tryPick = (c: Cand) => {
    const a = norm(c.artist)
    if (keys.has(c.key) || (perArtist.get(a) ?? 0) >= cap(a)) return false
    keys.add(c.key)
    perArtist.set(a, (perArtist.get(a) ?? 0) + 1)
    picked.push(c)
    return true
  }
  if (seedTrack) tryPick(seedTrack)

  const byScore = (x: Cand[]) => [...x].sort((a, b) => b.score - a.score)
  const quotas: [Cand[], number][] = [
    [byScore(dzCands), dzCands.length ? Math.round(want * (moods.length ? 0.45 : 0.6)) : 0],
    [byScore(chartCands), chartCands.length ? Math.round(want * 0.2) : 0],
  ]
  for (const [list, quota] of quotas) {
    let n = 0
    for (const c of list) {
      if (n >= quota || picked.length >= want) break
      if (tryPick(c)) n++
    }
  }
  for (const c of byScore(dbCands)) {
    if (picked.length >= want) break
    tryPick(c)
  }
  // 그래도 모자라면 남은 후보에서 채운다
  if (picked.length < want) {
    for (const c of byScore([...dzCands, ...chartCands])) {
      if (picked.length >= want) break
      tryPick(c)
    }
  }
  if (!picked.length) notes.push('조건에 맞는 곡이 없어요. 필터를 줄여 보세요.')

  // ── 6. 순서: 풀끼리 고르게 섞는다 ──
  const counts = new Map<string, number>()
  const totals = new Map<string, number>()
  for (const c of picked) totals.set(c.pool, (totals.get(c.pool) ?? 0) + 1)
  const ordered = picked
    .map(c => {
      const i = counts.get(c.pool) ?? 0
      counts.set(c.pool, i + 1)
      const pos = c.pool === 'seed' ? -1 : (i + 0.5) / totals.get(c.pool)! + rng() * 0.05
      return { c, pos }
    })
    .sort((a, b) => a.pos - b.pos)
    .map(({ c }) => {
      const { score: _s, pool: _p, lang: _l, ...track } = c
      return track as Track
    })

  return { tracks: ordered, moods, seedLabel: seedLabels.join(', ') || undefined, notes: [...new Set(notes)] }
}
