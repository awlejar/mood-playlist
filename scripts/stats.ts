// 곡 DB 통계: 전체 곡 수, 무드·장르·언어별 곡 수, 파싱 경고
import { MOODS, GENRES } from '../src/data/moods.ts'
import { loadSongs } from './load-songs.ts'

const { songs, warnings } = loadSongs()
console.log(`전체 ${songs.length}곡`)

console.log('\n[무드별]')
for (const m of MOODS) {
  const n = songs.filter(s => s.moods.includes(m.key)).length
  console.log(`${n < 40 ? '⚠️ ' : '   '}${m.label.padEnd(8)} ${n}`)
}

console.log('\n[장르별]')
for (const g of Object.keys(GENRES)) console.log(`   ${GENRES[g].label.padEnd(10)} ${songs.filter(s => s.genre === g).length}`)

console.log('\n[언어별]')
for (const l of ['ko', 'en', 'ja', 'etc']) console.log(`   ${l} ${songs.filter(s => s.lang === l).length}`)

if (warnings.length) {
  console.log(`\n경고 ${warnings.length}건`)
  for (const w of warnings) console.log('  ' + w)
}
