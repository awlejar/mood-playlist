import { jsonp } from './jsonp.ts'
import { norm } from '../data/parse.ts'

// iTunes Search API: 키 없이 Apple Music 곡 링크·앨범아트·미리듣기를 준다.
// 분당 약 20회 제한이 있어서 요청을 줄 세워 천천히 보낸다.
export interface ItTrack {
  trackName: string
  artistName: string
  trackViewUrl: string
  artworkUrl100?: string
  previewUrl?: string
  primaryGenreName?: string
}

const GAP_MS = 3200
let chain: Promise<unknown> = Promise.resolve()

function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.catch(() => undefined).then(() => new Promise(r => setTimeout(r, GAP_MS)))
  return run
}

export function searchSong(artist: string, title: string, country = 'KR'): Promise<ItTrack | null> {
  const term = encodeURIComponent(`${artist} ${title.replace(/\(.*?\)/g, '')}`.trim())
  const url = `https://itunes.apple.com/search?term=${term}&country=${country}&entity=song&limit=5`
  return queued(async () => {
    const r = await jsonp<{ results: ItTrack[] }>(url)
    const a = norm(artist)
    const t = norm(title)
    const results = r.results ?? []
    const near = (x: string, y: string) => !!x && !!y && (x.includes(y) || y.includes(x))
    return (
      results.find(x => near(norm(x.artistName), a) && near(norm(x.trackName), t)) ??
      results.find(x => norm(x.trackName) === t) ??
      null
    )
  })
}

export function bigArtwork(url?: string): string | undefined {
  return url?.replace(/\/\d+x\d+bb\./, '/300x300bb.')
}
