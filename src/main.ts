import './style.css'
import { MOODS, MOOD_BY_KEY, moodsFromText } from './data/moods.ts'
import { loadMeta } from './catalog.ts'
import { recommend, josa, type Era, type Query, type Region, type Result, type Track } from './recommend.ts'
import { appleUrl, spotifyUrl, trackListText, ytMusicUrl } from './links.ts'
import { enrichApple, enrichDeezer } from './enrich.ts'
import { pool } from './api/jsonp.ts'
import * as yt from './youtube.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const el = {
  form: $<HTMLFormElement>('form'),
  text: $<HTMLInputElement>('text'),
  song: $<HTMLInputElement>('song'),
  artist: $<HTMLInputElement>('artist'),
  count: $<HTMLSelectElement>('count'),
  region: $<HTMLSelectElement>('region'),
  era: $<HTMLSelectElement>('era'),
  trending: $<HTMLInputElement>('trending'),
  go: $<HTMLButtonElement>('go'),
  hint: $('form-hint'),
  result: $('result'),
  title: $('result-title'),
  meta: $('result-meta'),
  notes: $('notes'),
  tracks: $('tracks'),
  shuffle: $<HTMLButtonElement>('shuffle'),
  ytPlay: $<HTMLButtonElement>('yt-play'),
  copyList: $<HTMLButtonElement>('copy-list'),
  share: $<HTMLButtonElement>('share'),
  ytKeyBtn: $<HTMLButtonElement>('yt-key-btn'),
  ytDialog: $<HTMLDialogElement>('yt-dialog'),
  ytKey: $<HTMLInputElement>('yt-key'),
  toast: $('toast'),
}

const selected = new Set<string>()
let current: { query: Query; result: Result } | null = null
let generation = 0

// ── 무드 칩 ──
function renderChips() {
  for (const group of ['feel', 'scene'] as const) {
    const box = $(`chips-${group}`)
    box.innerHTML = ''
    for (const m of MOODS.filter(x => x.group === group)) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip'
      b.textContent = m.label
      b.dataset.key = m.key
      b.setAttribute('aria-pressed', String(selected.has(m.key)))
      b.addEventListener('click', () => {
        if (selected.has(m.key)) selected.delete(m.key)
        else selected.add(m.key)
        b.setAttribute('aria-pressed', String(selected.has(m.key)))
      })
      box.appendChild(b)
    }
  }
}

// ── 입력값 ↔ URL ──
function readQuery(seed = Math.floor(Math.random() * 1e9)): Query {
  return {
    text: el.text.value.trim(),
    moods: [...selected],
    song: el.song.value.trim(),
    artist: el.artist.value.trim(),
    count: Number(el.count.value) || 20,
    region: el.region.value as Region,
    era: el.era.value as Era,
    trending: el.trending.checked,
    seed,
  }
}

function toParams(q: Query): string {
  const p = new URLSearchParams()
  if (q.text) p.set('t', q.text)
  if (q.moods.length) p.set('m', q.moods.join(','))
  if (q.song) p.set('s', q.song)
  if (q.artist) p.set('a', q.artist)
  if (q.count !== 20) p.set('n', String(q.count))
  if (q.region !== 'all') p.set('r', q.region)
  if (q.era !== 'all') p.set('e', q.era)
  if (q.trending) p.set('h', '1')
  p.set('x', q.seed.toString(36))
  return p.toString()
}

function fromParams(): Query | null {
  const p = new URLSearchParams(location.search)
  if (![...p.keys()].some(k => 'tmsa'.includes(k))) return null
  el.text.value = p.get('t') ?? ''
  el.song.value = p.get('s') ?? ''
  el.artist.value = p.get('a') ?? ''
  el.count.value = p.get('n') ?? '20'
  el.region.value = p.get('r') ?? 'all'
  el.era.value = p.get('e') ?? 'all'
  el.trending.checked = p.get('h') === '1'
  selected.clear()
  for (const k of (p.get('m') ?? '').split(',')) if (MOOD_BY_KEY.has(k)) selected.add(k)
  renderChips()
  const seed = parseInt(p.get('x') ?? '', 36)
  return readQuery(Number.isFinite(seed) ? seed : undefined)
}

// ── 플리 제목 ──
function playlistTitle(q: Query, r: Result): string {
  const moodNames = r.moods.slice(0, 3).map(k => MOOD_BY_KEY.get(k)!.label)
  if (r.seedLabel && moodNames.length) return `${moodNames.join(' · ')}, ${r.seedLabel.split(',')[0]} 느낌`
  if (r.seedLabel) return `${r.seedLabel.split(',')[0]} 좋아하면 들을 노래`
  if (moodNames.length) return `${moodNames.join(' · ')} 플리`
  if (q.text) return `"${q.text}" 플리`
  return '오늘의 랜덤 플리'
}

// ── 그리기 ──
function skeleton(n: number) {
  el.tracks.innerHTML = ''
  for (let i = 0; i < Math.min(n, 8); i++) {
    const li = document.createElement('li')
    li.className = 'skeleton'
    el.tracks.appendChild(li)
  }
}

const PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
const PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'

function trackRow(t: Track, i: number): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'track'
  li.style.animationDelay = `${Math.min(i, 15) * 25}ms`
  li.innerHTML = `
    <span class="num">${i + 1}</span>
    <button class="art" type="button" aria-label="미리듣기" disabled>
      <span class="play">${PLAY}</span>
    </button>
    <div class="info">
      <div class="title"></div>
      <div class="artist"></div>
      <span class="reason"></span>
    </div>
    <div class="svc">
      <a class="apple" target="_blank" rel="noopener"><span class="dot"></span>Apple</a>
      <a class="spotify" target="_blank" rel="noopener"><span class="dot"></span>Spotify</a>
      <a class="yt" target="_blank" rel="noopener"><span class="dot"></span>YT Music</a>
    </div>`
  li.querySelector('.title')!.textContent = t.title
  li.querySelector('.artist')!.textContent = t.artist
  li.querySelector('.reason')!.textContent = t.reason
  ;(li.querySelector('.spotify') as HTMLAnchorElement).href = spotifyUrl(t)
  ;(li.querySelector('.yt') as HTMLAnchorElement).href = ytMusicUrl(t)
  updateRow(li, t)
  li.querySelector('.art')!.addEventListener('click', () => togglePreview(t, li))
  return li
}

function updateRow(li: HTMLElement, t: Track) {
  ;(li.querySelector('.apple') as HTMLAnchorElement).href = appleUrl(t)
  const art = li.querySelector('.art') as HTMLButtonElement
  if (t.cover && !art.querySelector('img')) {
    const img = document.createElement('img')
    img.loading = 'lazy'
    img.alt = ''
    img.src = t.cover
    img.onerror = () => img.remove()
    art.prepend(img)
  }
  art.disabled = !t.preview
  art.setAttribute('aria-label', t.preview ? `${t.title} 미리듣기` : '미리듣기 없음')
}

// ── 미리듣기 ──
const audio = new Audio()
audio.volume = 0.8
let playingLi: HTMLElement | null = null
function setPlaying(li: HTMLElement | null) {
  if (playingLi) {
    playingLi.querySelector('.art')!.classList.remove('playing')
    playingLi.querySelector('.play')!.innerHTML = PLAY
  }
  playingLi = li
  if (li) {
    li.querySelector('.art')!.classList.add('playing')
    li.querySelector('.play')!.innerHTML = PAUSE
  }
}
function togglePreview(t: Track, li: HTMLElement) {
  if (!t.preview) return
  if (playingLi === li && !audio.paused) {
    audio.pause()
    setPlaying(null)
    return
  }
  audio.src = t.preview
  audio.play().then(() => setPlaying(li)).catch(() => toast('미리듣기를 재생하지 못했어요.'))
}
audio.addEventListener('ended', () => setPlaying(null))

function render(q: Query, r: Result) {
  el.title.textContent = playlistTitle(q, r)
  el.meta.textContent = `${r.tracks.length}곡`
  el.notes.innerHTML = ''
  for (const n of r.notes) {
    const li = document.createElement('li')
    li.textContent = n
    el.notes.appendChild(li)
  }
  el.tracks.innerHTML = ''
  const rows = r.tracks.map((t, i) => {
    const row = trackRow(t, i)
    el.tracks.appendChild(row)
    return row
  })
  enrichAll(r.tracks, rows)
}

async function enrichAll(tracks: Track[], rows: HTMLElement[]) {
  const gen = generation
  await pool(tracks, 4, async (t, i) => {
    if (gen !== generation) return
    await enrichDeezer(t)
    if (gen === generation) updateRow(rows[i], t)
  })
  // Apple Music 곡 링크는 요청 제한 때문에 천천히 채운다. 그 전에는 검색 링크로 간다.
  for (let i = 0; i < tracks.length; i++) {
    if (gen !== generation) return
    if (tracks[i].appleUrl) continue
    await enrichApple(tracks[i])
    if (gen === generation) updateRow(rows[i], tracks[i])
  }
}

// ── 실행 ──
async function run(q: Query) {
  if (!q.text && !q.moods.length && !q.song && !q.artist) {
    el.hint.textContent = '기분을 적거나, 칩을 고르거나, 노래·가수 중 하나를 넣어 주세요.'
    return
  }
  el.hint.textContent = ''
  const gen = ++generation
  audio.pause()
  setPlaying(null)
  el.go.disabled = true
  el.shuffle.disabled = true
  el.go.textContent = '고르는 중…'
  el.result.hidden = false
  el.title.textContent = '어울리는 곡을 고르는 중이에요'
  el.meta.textContent = ''
  el.notes.innerHTML = ''
  skeleton(q.count)
  el.result.scrollIntoView({ behavior: 'smooth', block: 'start' })
  try {
    const result = await recommend(q)
    if (gen !== generation) return
    current = { query: q, result }
    history.replaceState(null, '', `?${toParams(q)}`)
    render(q, result)
  } catch (err) {
    console.error(err)
    el.title.textContent = '플리를 만들지 못했어요'
    el.tracks.innerHTML = ''
    el.notes.innerHTML = '<li>잠시 후 다시 시도해 주세요.</li>'
  } finally {
    if (gen === generation) {
      el.go.disabled = false
      el.shuffle.disabled = false
      el.go.textContent = '플리 만들기'
    }
  }
}

el.form.addEventListener('submit', e => {
  e.preventDefault()
  run(readQuery())
})
el.shuffle.addEventListener('click', () => {
  if (current) run({ ...current.query, seed: Math.floor(Math.random() * 1e9) })
})

// ── 복사·공유 ──
let toastTimer = 0
function toast(msg: string) {
  el.toast.textContent = msg
  el.toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), 2200)
}
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}
el.copyList.addEventListener('click', async () => {
  if (!current) return
  toast((await copy(trackListText(current.result.tracks))) ? '곡 목록을 복사했어요' : '복사하지 못했어요')
})
el.share.addEventListener('click', async () => {
  if (!current) return
  const url = `${location.origin}${location.pathname}?${toParams(current.query)}`
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    navigator.share({ title: el.title.textContent ?? '오늘 뭐 듣지', url }).catch(() => undefined)
    return
  }
  toast((await copy(url)) ? '링크를 복사했어요. 열면 같은 플리가 나와요' : '복사하지 못했어요')
})

// ── YouTube 이어 듣기 ──
el.ytKeyBtn.addEventListener('click', () => {
  el.ytKey.value = yt.getKey()
  el.ytDialog.showModal()
})
el.ytDialog.addEventListener('close', () => {
  if (el.ytDialog.returnValue === 'save') {
    yt.setKey(el.ytKey.value.trim())
    toast(el.ytKey.value.trim() ? 'API 키를 저장했어요' : 'API 키를 지웠어요')
  }
})
el.ytPlay.addEventListener('click', async () => {
  if (!current) return
  const key = yt.getKey()
  if (!key) {
    el.ytKey.value = ''
    el.ytDialog.showModal()
    return
  }
  // 팝업 차단을 피하려고 창을 먼저 연 뒤 주소를 넣는다
  const win = window.open('about:blank', '_blank')
  const tracks = current.result.tracks
  el.ytPlay.disabled = true
  try {
    const url = await yt.buildPlaylistUrl(tracks, key, done => {
      el.ytPlay.textContent = `영상 찾는 중 ${done}/${Math.min(tracks.length, 50)}`
    })
    if (win) win.location.href = url
    else location.href = url
  } catch (err) {
    win?.close()
    toast((err as Error).message === 'quota' ? '오늘 YouTube 한도를 다 썼거나 키가 올바르지 않아요' : '영상을 찾지 못했어요')
  } finally {
    el.ytPlay.disabled = false
    el.ytPlay.textContent = 'YouTube로 듣기'
  }
})

// ── 시작 ──
renderChips()
const metaReady = loadMeta()
const fromUrl = fromParams()
if (fromUrl) metaReady.then(() => run(fromUrl))

// 기분 문장에서 어떤 무드를 알아들었는지 보여 준다
el.text.addEventListener('change', () => {
  if (!el.text.value.trim()) return
  const keys = moodsFromText(el.text.value).map(k => MOOD_BY_KEY.get(k)!.label)
  el.hint.textContent = keys.length ? `${josa(keys.slice(0, 3).join(', '), '를', '을')} 알아들었어요.` : ''
})
