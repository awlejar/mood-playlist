# 오늘 뭐 듣지

기분, 노래 한 곡, 가수 한 명, 분위기 중 하나만 넣으면 플레이리스트를 만들어 주는 웹이에요.
곡마다 **Apple Music · Spotify · YouTube Music** 버튼이 있어서 바로 들을 수 있어요.

- API 키나 로그인이 없어도 돼요 (정적 사이트, GitHub Pages)
- 직접 고른 곡 약 2,400개에 무드 25종 태그
- 노래나 가수를 넣으면 Deezer의 "비슷한 가수"로 더 넓게 찾아요
- 30초 미리듣기, 곡 목록 복사, 공유 링크(같은 플리가 다시 나와요)

## 추천은 이렇게 돼요

1. **곡 DB** (`src/data/songs/*.txt`): 장르별 파일에 `곡명 | 가수 | 무드 | 연도 | 에너지` 형식으로 들어 있어요.
   K-팝, 발라드, 인디, 밴드, 국힙, OST, 가요 명곡, 팝, R&B, 힙합, 록, 인디 팝, EDM, 재즈·클래식, 어쿠스틱, J-팝, 시티팝, 라틴
2. **실시간 확장** (키 없음, 브라우저에서 JSONP)
   - Deezer: 입력한 가수의 비슷한 가수 20명과 그 인기곡, 앨범아트, 미리듣기
   - iTunes Search: 곡별 Apple Music 링크
   - Apple Music 인기 차트 (한국·미국·일본): "요즘 인기곡 섞기"
3. **점수**: 무드 일치, 비슷한 가수 순위, 장르, 에너지 차이를 합쳐요. 같은 가수는 2곡까지만 넣어요.

## 플리를 통째로 옮기기

- **YouTube**: 오른쪽 위 "YouTube 설정"에 무료 YouTube Data API 키를 넣으면 "YouTube로 듣기"로 전곡을 이어 들을 수 있어요.
- **Spotify / Apple Music / YouTube Music 계정에 저장**: "곡 목록 복사" 후 [TuneMyMusic](https://www.tunemymusic.com/ko/transfer)이나 [Soundiiz](https://soundiiz.com/ko/)에 붙여 넣어요.

## 개발

```bash
npm install
npm run dev            # 로컬 실행
npm run stats          # 곡 수·무드별 분포 확인
npm run verify-songs   # Deezer로 곡 확인 + 차트 받기 (인터넷 필요)
npm run build
```

`main`에 push하면 GitHub Actions가 곡을 확인하고 차트를 받은 뒤 GitHub Pages로 배포해요.
매주 월요일에도 한 번 돌아서 차트를 새로 받아요. 처음 한 번은 레포 **Settings → Pages → Source**를 **GitHub Actions**로 바꿔 주세요.

## 곡 추가하기

`src/data/songs/` 아래 아무 파일에나 한 줄 추가하면 돼요. 이미 있는 곡을 다시 적으면 무드만 합쳐져요.

```
@kindie
곡명 | 가수 | rain,dawn,calm | 2024 | 2
```

무드 키: `hype happy flutter love breakup sad comfort nostalgia confident calm dawn rain drive workout focus cafe travel party dreamy commute sleep spring summer autumn winter`
