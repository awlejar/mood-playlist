export type MoodGroup = 'feel' | 'scene'

export interface Mood {
  key: string
  label: string
  emoji: string
  group: MoodGroup
  /** 이 무드에 어울리는 에너지(1 잔잔 ~ 5 폭발) */
  energy: number
  /** 자유 입력 문장에서 이 무드를 알아차릴 단어들 */
  words: string[]
}

export const MOODS: Mood[] = [
  // 기분
  { key: 'hype', label: '신남', emoji: '🔥', group: 'feel', energy: 5, words: ['신나', '신남', '흥', '텐션', '들뜬', '기분좋', '기분 좋', 'hype'] },
  { key: 'happy', label: '행복', emoji: '😊', group: 'feel', energy: 4, words: ['행복', '좋아', '기뻐', '기쁨', '설레는 하루', '상쾌', '산뜻', '맑음', '웃'] },
  { key: 'flutter', label: '설렘', emoji: '💗', group: 'feel', energy: 3, words: ['설레', '설렘', '두근', '썸', '첫눈에', '짝사랑'] },
  { key: 'love', label: '사랑', emoji: '❤️', group: 'feel', energy: 2, words: ['사랑', '연애', '애인', '고백', '커플', '로맨틱', '데이트'] },
  { key: 'breakup', label: '이별', emoji: '💔', group: 'feel', energy: 2, words: ['이별', '헤어', '차였', '전남친', '전여친', '전애인', '끝났'] },
  { key: 'sad', label: '우울', emoji: '🌧️', group: 'feel', energy: 1, words: ['우울', '슬퍼', '슬픔', '눈물', '울고', '힘들', '지쳐', '외로', '공허', '쓸쓸', '블루'] },
  { key: 'comfort', label: '위로', emoji: '🫂', group: 'feel', energy: 2, words: ['위로', '힘내', '괜찮', '응원', '토닥', '버티'] },
  { key: 'nostalgia', label: '그리움', emoji: '📼', group: 'feel', energy: 2, words: ['그리', '추억', '옛날', '보고싶', '보고 싶', '레트로', '향수', '학창'] },
  { key: 'confident', label: '자신감', emoji: '😎', group: 'feel', energy: 4, words: ['자신감', '당당', '멋', '걸크', '자존감', '쎈', '센 노래', '스웩'] },
  { key: 'calm', label: '잔잔', emoji: '🍃', group: 'feel', energy: 1, words: ['잔잔', '차분', '편안', '평온', '조용', '힐링', '여유', '멍'] },
  // 분위기·상황
  { key: 'dawn', label: '새벽', emoji: '🌙', group: 'scene', energy: 2, words: ['새벽', '밤', '심야', '불면', '야경'] },
  { key: 'rain', label: '비 오는 날', emoji: '☔', group: 'scene', energy: 1, words: ['비 오', '비오', '비가', '비 내', '빗소리', '빗속', '장마', '흐린', '흐림', '우중충'] },
  { key: 'drive', label: '드라이브', emoji: '🚗', group: 'scene', energy: 4, words: ['드라이브', '운전', '차에서', '한강', '고속도로'] },
  { key: 'workout', label: '운동', emoji: '🏃', group: 'scene', energy: 5, words: ['운동', '헬스', '러닝', '달리', '조깅', '뛰', '필라테스', '등산'] },
  { key: 'focus', label: '집중', emoji: '📚', group: 'scene', energy: 2, words: ['공부', '집중', '작업', '일할', '코딩', '독서', '시험'] },
  { key: 'cafe', label: '카페', emoji: '☕', group: 'scene', energy: 2, words: ['카페', '커피', '브런치', '오후'] },
  { key: 'travel', label: '여행', emoji: '✈️', group: 'scene', energy: 4, words: ['여행', '휴가', '바다', '비행기', '기차', '캠핑', '제주'] },
  { key: 'party', label: '파티', emoji: '🪩', group: 'scene', energy: 5, words: ['파티', '클럽', '술자리', '한잔', '홈파티', '생일', '노래방', '회식'] },
  { key: 'dreamy', label: '몽환', emoji: '🫧', group: 'scene', energy: 2, words: ['몽환', '꿈', '우주', '신비', '아련', '감성'] },
  { key: 'commute', label: '출근길', emoji: '🚇', group: 'scene', energy: 3, words: ['출근', '등교', '지하철', '버스', '아침', '월요일'] },
  { key: 'sleep', label: '잠들기 전', emoji: '🛌', group: 'scene', energy: 1, words: ['잠들', '잠이', '자기 전', '잘 때', '자려', '수면', '졸려', '꿀잠'] },
  { key: 'spring', label: '봄', emoji: '🌸', group: 'scene', energy: 3, words: ['봄', '벚꽃', '꽃'] },
  { key: 'summer', label: '여름', emoji: '🌊', group: 'scene', energy: 4, words: ['여름', '더워', '덥', '수영', '휴양'] },
  { key: 'autumn', label: '가을', emoji: '🍂', group: 'scene', energy: 2, words: ['가을', '낙엽', '선선', '쌀쌀'] },
  { key: 'winter', label: '겨울', emoji: '❄️', group: 'scene', energy: 2, words: ['겨울', '첫눈', '눈 오', '눈오', '눈이 와', '눈 내', '크리스마스', '연말', '추워', '춥'] },
]

export const MOOD_BY_KEY = new Map(MOODS.map(m => [m.key, m]))

/** 자유 입력 문장에서 무드 키를 뽑는다. 예: "비 오는 새벽에 우울해" → rain, dawn, sad */
export function moodsFromText(text: string): string[] {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  if (!t.trim()) return []
  const found: string[] = []
  for (const m of MOODS) {
    if (t.includes(m.label.toLowerCase()) || m.words.some(w => t.includes(w))) found.push(m.key)
  }
  return found
}

export const GENRES: Record<string, { label: string; lang: 'ko' | 'en' | 'ja' | 'etc' }> = {
  kpop: { label: 'K-팝', lang: 'ko' },
  kballad: { label: '발라드', lang: 'ko' },
  kindie: { label: '인디', lang: 'ko' },
  kband: { label: '밴드', lang: 'ko' },
  krnb: { label: 'K-R&B', lang: 'ko' },
  khiphop: { label: '국힙', lang: 'ko' },
  kost: { label: 'OST', lang: 'ko' },
  kretro: { label: '가요 명곡', lang: 'ko' },
  pop: { label: '팝', lang: 'en' },
  rnb: { label: 'R&B', lang: 'en' },
  hiphop: { label: '힙합', lang: 'en' },
  rock: { label: '록·얼터너티브', lang: 'en' },
  indie: { label: '인디 팝', lang: 'en' },
  edm: { label: 'EDM', lang: 'en' },
  jazz: { label: '재즈·소울', lang: 'en' },
  acoustic: { label: '어쿠스틱', lang: 'en' },
  jpop: { label: 'J-팝', lang: 'ja' },
  citypop: { label: '시티팝', lang: 'ja' },
  latin: { label: '라틴', lang: 'etc' },
}
