// 배포 전에 GitHub Actions에서 실행한다.
// 1) 곡 DB의 모든 곡을 Deezer에서 찾아 실제로 있는지 확인하고, 앨범아트·미리듣기를 저장한다.
// 2) Apple Music 인기 차트(한국·미국·일본)를 받아 둔다.
// 결과: public/songs-meta.json, public/charts.json
// 이전 결과(.cache/songs-meta.json)가 있으면 이미 확인한 곡은 건너뛴다.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { norm, type Song } from '../src/data/parse.ts'
import { loadSongs } from './load-songs.ts'

const ROOT = join(import.meta.dirname, '..')
const CACHE = join(ROOT, '.cache/songs-meta.json')
const OUT_META = join(ROOT, 'public/songs-meta.json')
const OUT_CHARTS = join(ROOT, 'public/charts.json')
const MAX_AGE_DAYS = 60

interface Meta { c?: string; p?: string; d?: string; ok: boolean; at: number }
interface DzTrack { title: string; link: string; preview: string; artist: { name: string }; album: { cover_medium: string } }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let last = 0
async function dz(q: string): Promise<DzTrack[]> {
  // Deezer 제한: 5초에 50회. 여유 있게 초당 8회로 보낸다.
  const wait = last + 125 - Date.now()
  if (wait > 0) await sleep(wait)
  last = Date.now()
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=8`)
      const j = (await r.json()) as { data?: DzTrack[]; error?: { code: number } }
      if (j.error?.code === 4) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      return j.data ?? []
    } catch {
      await sleep(1000 * (attempt + 1))
    }
  }
  throw new Error('deezer unavailable')
}

const near = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a))
const clean = (t: string) => t.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*-\s*.*$/, '').trim() || t

async function verify(s: Song): Promise<Meta> {
  const title = clean(s.title)
  const artist = s.artist.split(/,|&/)[0].trim()
  const nt = norm(title)
  const na = norm(artist)
  const pick = (list: DzTrack[], needArtist: boolean) =>
    list.find(t => near(norm(t.title), nt) && near(norm(t.artist.name), na)) ??
    (needArtist ? undefined : list.find(t => near(norm(t.title), nt)))

  const strict = await dz(`artist:"${artist}" track:"${title}"`)
  let hit: DzTrack | undefined = pick(strict, false) ?? strict[0]
  if (!hit) hit = pick(await dz(`${artist} ${title}`), false)
  if (!hit) hit = pick(await dz(title), true)
  if (!hit) return { ok: false, at: Date.now() }
  return { ok: true, c: hit.album?.cover_medium, p: hit.preview || undefined, d: hit.link, at: Date.now() }
}

async function charts() {
  const out: Record<string, { title: string; artist: string; cover?: string; url?: string }[]> = {}
  for (const cc of ['kr', 'us', 'jp']) {
    for (const host of ['rss.marketingtools.apple.com', 'rss.applemarketingtools.com']) {
      try {
        const r = await fetch(`https://${host}/api/v2/${cc}/music/most-played/50/songs.json`)
        if (!r.ok) continue
        const j = (await r.json()) as { feed: { results: { name: string; artistName: string; artworkUrl100: string; url: string }[] } }
        out[cc] = j.feed.results.map(x => ({
          title: x.name,
          artist: x.artistName,
          cover: x.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/300x300bb.'),
          url: x.url,
        }))
        break
      } catch {
        /* 다음 주소로 */
      }
    }
  }
  return out
}

async function main() {
  const { songs, warnings } = loadSongs()
  if (warnings.length) console.log(`파싱 경고 ${warnings.length}건\n` + warnings.join('\n'))

  const cache: Record<string, Meta> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
  const fresh = (m?: Meta) => m && Date.now() - m.at < MAX_AGE_DAYS * 864e5
  const todo = songs.filter(s => !fresh(cache[s.id]))
  console.log(`곡 ${songs.length}개 중 ${todo.length}개를 확인합니다`)

  let done = 0
  let failedNetwork = false
  for (const s of todo) {
    try {
      cache[s.id] = await verify(s)
    } catch {
      failedNetwork = true
      break
    }
    if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`)
  }
  if (failedNetwork) console.log('Deezer에 연결하지 못해서 확인을 멈췄어요. 지금까지 결과만 저장합니다.')

  const metaOut: Record<string, { c?: string; p?: string; d?: string }> = {}
  const missing: Song[] = []
  for (const s of songs) {
    const m = cache[s.id]
    if (!m) continue
    if (!m.ok) missing.push(s)
    else metaOut[s.id] = { c: m.c, p: m.p, d: m.d }
  }

  mkdirSync(join(ROOT, '.cache'), { recursive: true })
  mkdirSync(join(ROOT, 'public'), { recursive: true })
  writeFileSync(CACHE, JSON.stringify(cache))
  writeFileSync(OUT_META, JSON.stringify({ updated: new Date().toISOString(), songs: metaOut, missing: missing.map(s => s.id) }))

  const ch = await charts()
  writeFileSync(OUT_CHARTS, JSON.stringify({ updated: new Date().toISOString(), ...ch }))

  const lines = [
    `## 곡 확인 결과`,
    `- 전체 ${songs.length}곡, 확인됨 ${Object.keys(metaOut).length}곡, 못 찾음 ${missing.length}곡`,
    `- 인기 차트: ${Object.entries(ch).map(([k, v]) => `${k} ${v.length}곡`).join(', ') || '없음'}`,
    '',
    missing.length ? '### 못 찾은 곡 (앱에서 빠짐)' : '',
    ...missing.map(s => `- ${s.artist} - ${s.title}`),
  ]
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
}

main()
