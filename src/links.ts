import type { Track } from './recommend.ts'

const q = (t: Track) => encodeURIComponent(`${t.artist} ${t.title.replace(/\s*\((feat|with|prod)[^)]*\)/gi, '')}`)

export const appleUrl = (t: Track) => t.appleUrl ?? `https://music.apple.com/kr/search?term=${q(t)}`
export const spotifyUrl = (t: Track) => `https://open.spotify.com/search/${q(t)}`
export const ytMusicUrl = (t: Track) => `https://music.youtube.com/search?q=${q(t)}`
export const youtubeUrl = (t: Track) => `https://www.youtube.com/results?search_query=${q(t)}`

export function trackListText(tracks: Track[]): string {
  return tracks.map(t => `${t.artist} - ${t.title}`).join('\n')
}
