# 두마당 콘텐츠 폴리싱 기획서

- 작성: 기획팀 P4 · 2026-09-12
- 대상: 두마당 스위트 (바둑 `suiji-go.html` / 오목 `suiji-omok.html` / 알까기 `suiji-alkkagi.html` / 기보 `suiji-kifu.html` / 도장 `suiji-index.html`)
- 공통 런타임: `suiji-common.js` (window.Suiji), 엔진 `suiji-engine.js` (window.SuijiEngine)
- 근거: 리서치 브리프 `r4-boardgames-brief.md` (R4, 2026-09-13)
- 스프린트 총 규모: **M + M + L** (3개 항목)

## 하드 제약 (전 항목 공통)

1. **게임 룰 불변** — 착수/사석/코/집계/코미/핸디캡 로직 수정 금지.
2. **엔진 공개 API 불변** — `SuijiEngine = { GoGame, GoAI, BoardRenderer, SGF, packBoard, unpackBoard, makeWoodTexture }` 의 시그니처·동작 유지. 엔진 파일은 **수정하지 않는다**.
3. **신규 외부 의존성 금지** — Font Awesome / 기존 캔버스 렌더러만 사용.
4. **기존 패턴 준수** — 사운드는 `Suiji.sound` 토글(`suiji.sound` localStorage 키)과 `_p()` 가드를 따르고, 돌 표현은 기존 스톤 스프라이트/`stoneAt` 경로를 유지.
5. **저장소 신규 키만 추가** — 기존 `suiji.stats.v1`, `suiji.kifu.v1`, `suiji.sound` 키의 스키마는 절대 변경하지 않는다.
6. **온라인 대국(suiji-net.js) 프로토콜 불변** — 모든 신규 기능은 로컬 UI/저장소 레이어에 한정.

### 적용 파일 요약

| 항목 | suiji-common.js | suiji-go.html | suiji-kifu.html | suiji-index.html | 규모 |
|---|---|---|---|---|---|
| 2-1 수 품질 원라인 피드백 | ○ (판정 헬퍼) | ○ (UI/훅) | — | — | **M** |
| 2-2 복기 '승부처 3곳' 마킹 | — | — | ○ | — | **M** |
| 2-3 업적 뱃지 | ○ (모듈+훅) | — (잠금 해제는 자동) | — | ○ (표시 UI) | **L** |

---

## 1. 목표

리서치 브리프의 핵심 인사이트 — **"즉각적 수 피드백(등급 태그)", "AI 수치의 한국식 번역", "승부처 자동 마킹", "티어 뱃지로 인한 리텐션"** — 를 두마당에 낮은 리스크로 이식한다.

1. **수 피드백 체감**: 유저의 착수 직후 1초 내 수 등급 태그 + 한 줄 코칭 (브리프 아이디어 #1, 재미 요소 2·3번).
2. **복기의 번역**: 기보 화면에 이미 있는 승률 그래프를 "승부처 3곳" 자동 마킹으로 완성해, 진 판의 원인을 3초 안에 보여준다 (아이디어 #2, 참고사례 PlayGo.gg).
3. **스위트 공통 리텐션 루트**: 도장(인덱스)에 업적 뱃지를 두고, 잠금 해제 판정은 공통 `Suiji.stats.record()` 한 곳에 걸어 3개 게임이 자동으로 참여하게 한다 (아이디어 #8, 참고사례 Duolingo/chess.com).

설계 원칙: 이미 출시·폴리싱된 스위트이므로 **엔진/룰 수술 없이 UI 레이어 + localStorage 추가**로만 해결한다. 3개 항목 모두 기존에 검증된 코드 자산(기보의 수 품질 판정, 승률 그래프, 공통 stats)을 재사용한다.

---

## 2. 개선 항목

### 2-1. 바둑 — 유저 착수 직후 수 품질 원라인 피드백 (리서치 #1)

**규모: M**

#### 배경 (리서치 근거)

- 브리프 핵심 재미 2번: "즉각적 수 피드백 — 승률 %보다 집 차이/급수 표현이 직관적", 디자인 패턴: "수 직후 0.5~1초 내 시각 태그(좋은 수/실수), 문턱값 기반 등급만 표시".
- 아이디어 #1: "AI 분석을 문장 + 수 등급 태그(최선/선수/손해)로 변환".
- 코드 현실: 기보 화면(`suiji-kifu.html` `analysePly()`)에는 이미 5단계 등급 판정(excellent~blunder, 문턱값 Δ≤2.5/8/20/45)이 구현돼 있으나 **복기에서만** 동작한다. 대국 화면(`suiji-go.html`)에서는 유저의 수에 대해 `describePlayerMove()`가 "An opening move…" 같은 **품질과 무관한 장식 문구**만 보여준다. AI의 수만 `GoAI.evaluateMove()`의 intent로 해설되는 비대칭 상태다.

#### 명세

**데이터 구조 — 공통 판정 헬퍼 (suiji-common.js에 신규 추가, 엔진은 수정 없음)**

```js
// suiji-common.js 신규 섹션 "move grading"
// 판정 문턱값은 기보 화면 analysePly()와 동일 값을 단일 출처로 사용
Suiji.GRADE_THRESHOLDS = { best: 2.5, good: 8, lax: 20 }; // Δ 초과분 기준

Suiji.gradeLastMove = function (game) {
  // 1) game.history 마지막 항목이 type:'move'가 아니면 null
  // 2) kifu 화면 gameAt()과 동일 방식으로 '착수 이전' 국면 재구성:
  //    board = history[len-2].boardSnapshot (없으면 빈 판),
  //    history = history.slice(0, len-1)  (moveCount 정합)
  //    ※ koPoint는 복원하지 않는다 — 기보 gameAt()과 동일한 한계(알려진 근사)
  // 3) const ai = new SuijiEngine.GoAI(g, 2); cands = ai.topMoves(착수색, 3);
  //    (topMoves는 노이즈 없이 레벨2 가중으로 전 수 후보 평가 — 이미 힌트/기보에서 사용 중)
  // 4) played = cands에서 (x,y) 일치 탐색, delta = best.score - played.score,
  //    rank = played 순위
  // 반환: { grade: 'best'|'good'|'lax'|'bad',
  //          delta: number, rank: number,
  //          best: {x, y}, bestCoord: 'D4' (Suiji.coordName 재사용) }
  // 판정 대상이 없으면 null 반환. 전체 try/catch로 감싸 실패 시 null(기존 문구 유지)
};
```

- 등급 판정 규칙 (라이브용 4단계 — 브리프의 "문턱값 기반 등급만 표시" 준수):
  - `rank === 1` 또는 `delta ≤ 2.5` → **best (선수)**
  - `delta ≤ 8` → **good (좋은 수)**
  - `delta ≤ 20` → **lax (아쉬운 수)**
  - `delta > 20` → **bad (실수)**
- `delta` 단위는 엔진 territory-influence 점수이므로 문구에서는 **"약 N칸"으로 근사 표기**하고, meta에 `AI 근사` 명시해 승률로 오인하지 않게 한다(브리프: 승률 %보다 집 차이 표현).

**UI 문구 (한국어, 40자 이내, 신규 요소에만 적용 — 기존 영어 텍스트는 유지)**

| grade | 칩 라벨 | 의도 패널 문구 (intentText 교체) |
|---|---|---|
| best | `선수` | "선수! 정확한 한 수입니다." |
| good | `좋은 수` | "좋은 수 — 흐름이 좋습니다." |
| lax | `아쉬운 수` | "아쉬운 수 — {bestCoord}이 더 좋았습니다." |
| bad | `실수` | "실수! {bestCoord}을 놓쳐 약 {round(delta)}칸 손해입니다." |

- intentMeta 끝에 `· AI 근사 · #{rank}선` 추가.
- 동작 범위: **오프라인 AI 대국에서 유저(흑)의 착수에만**. `onlineActive === true`이거나 AI의 수에는 동작하지 않는다(AI intent 유지).
- 표시 타이밍: 착수 처리 직후 `setTimeout(350ms)`으로 비동기 계산 → 브리프의 0.5~1초 내 시각 태그 충족. 계산 중 `gameGeneration` 세대 가드로 무르기/새 대국 시 폐기.
- 소리 없음 (판독 집중 방해 — 브리프 주스 가이드의 "핵심 판독을 방해하지 않을 것" 준용).
- 색상: best/good = `var(--ok)` 계열, lax = `var(--gold)`, bad = `var(--accent)` — 기존 기보 `quality-badge` 팔레트와 동일 톤.

#### 구현 포인트 (실제 파일/함수)

1. **suiji-common.js** — 신규 섹션 추가: `Suiji.GRADE_THRESHOLDS`, `Suiji.gradeLastMove(game)`. `window.SuijiEngine`이 없으면(예: 도장 페이지) `null` 반환하는 방어 코드 필수. 기존 코드는 한 줄도 수정하지 않는다.
2. **suiji-go.html** —
   - `attemptPlace()`(1339행): `describePlayerMove()` 호출부(1372행)를 유지하되, 그 아래에 350ms 지연 판정 태스크 추가 — `Suiji.gradeLastMove(game)` 결과로 intentText/intentMeta를 덮어쓰고 칩 표시. `setIntent()`(2052행)는 수정 없이 재사용.
   - 의도 패널 HTML(384~396행 `#intentText` 상단): `<span id="intentGrade" class="grade-chip">` 요소 추가.
   - 페이지 `<style>`(23행)에 `.grade-chip` + `.move-grade` 스타일 약 20줄 추가.
   - `renderMoveList()`(1959행): 세션 캐시 `moveGrades`(Map: 수순→grade)에 값이 있으면 수 목록 행에 `<span class="move-grade">선</span>` 칩 표기.
   - `onUndo()`(1678행): pop된 수순 이후의 `moveGrades` 엔트리 삭제.
   - 신규 대국 시(`startNewGame`, 1123행) `moveGrades.clear()`.

#### 수용 기준

- [ ] 9/13/19판 모두에서 유저 착수 후 1초 안에 4단계 등급 칩 + 한국어 한 줄이 AI Intent 패널에 표시된다 (AI의 수에는 표시되지 않는다).
- [ ] 실수(lax 이하) 판정 시 문구에 최선 후보 좌표(Suiji.coordName 형식, 예: D4)가 포함되고 meta에 "AI 근사"가 보인다.
- [ ] 온라인 대국에서는 어떤 경우에도 판정 계산·표시가 발생하지 않는다 (네트워크 트래픽 0).
- [ ] 무르기 → 재착수 시 이전 판정이 잔존하지 않고, 새 판정으로 갱신된다.
- [ ] 판정 계산 실패/타임아웃 시에도 기존 `describePlayerMove()` 문구가 그대로 유지된다 (기능 추가가 기존 표시를 깨지 않음).

---

### 2-2. 기보 — 복기 '승부처 3곳' 자동 마킹 (리서치 #2)

**규모: M**

#### 배경 (리서치 근거)

- 브리프 디자인 패턴: "승패 리뷰: 점수차 그래프 + '승부처 1~3곳' 자동 마킹", 참고사례 PlayGo.gg의 "급수 판정 히트맵 복기 — AI 수치의 한국식 번역".
- 코드 현실: `suiji-kifu.html`에 이미 ① 수별 등급 판정(`analysePly`), ② 승률 그래프(`computeWinRates` → `drawGraph`), ③ blunder/mistake 점 마커가 있다. 그러나 (a) 점 마커는 유저가 해당 수순을 **스크럽해 봐야** `qualityCache`가 차면서 그려지는 구조라 로드 직후 그래프는 대부분 비어 있고, (b) "이 판의 승부가 여기서 뒤집혔다"를 알려주는 **요약 마킹은 없다**. 진 판의 원인을 한눈에 보여준다는 리서치 요구에 비해 마지막 한 조각이 빠져 있다.

#### 명세

**판정 로직 — 승률 기반, AI 추가 연산 불필요 (즉시 표시 가능)**

```js
// suiji-kifu.html 신규 순수 함수
function findTurningPoints() {
  // 입력: winRates[] (ply별 흑 승률 %, 이미 존재)
  // 후보: i ≥ 1 이고 |winRates[i] - winRates[i-1]| ≥ 8 (%p)
  //   - pass/setup/resign 항 제외 (해당 ply의 history 항목 type 확인)
  // 선택: |변화량| 내림차순 정렬 → 상위부터 채택, 단 이미 채택된 지점과
  //   플리 거리 5 미만인 후보는 건너뛴다(군집 방지). 최대 3개.
  // 반환: [{ ply, drop: number(%p, 부호: 흑 기준 +/−), side: 'B'|'W' }] 또는 []
  //   8%p 미만 스윙만 있는 판에서는 [] — 억지로 승부처를 만들지 않는다.
}
```

- 문턱값 **8%p**, 최대 **3곳**, 최소 간격 **5플리** — 리서치의 "승부처 1~3곳" 상한을 그대로 채택. 상수는 함수 상단에 한 곳에 모은다.

**UI**

1. 그래프 마킹 (`drawGraph()` 내, 기존 blunder 마커 블록 뒤): 승부처 ply 위치에 **금색 다이아몬드**(4px 사각 45° 회전, `var(--gold)`) + 세로 점선(1px). 현재 위치 점(current)보다 아래 레이어.
2. 승부처 칩 리스트: Win-rate Graph 패널 내 그래프 아래에 `<div class="turning-list">` 신설. 칩 문구(한국어):
   - `승부처 {n} · {ply}수 {흑|백} · {±D}%p` — 예: `승부처 1 · 87수 백 · +14%p` (+는 흑이 그 수에서 이득)
   - 해당 ply가 이미 `qualityCache`에 있으면 등급 라벨을 덧붙임: `· Blunder` (기존 QUALITY_LABEL 재사용).
   - 칩 클릭 → `scrub(ply)` (기존 함수 그대로).
   - 승부처가 0곳이면 리스트 영역에 `이른 승부 없음 — 한 수 차이 없이 흘러간 판` 한 줄 표시.
3. 백그라운드 등급 프리컴퓨트: 기보 로드 완료 시점(`computeWinRates` 직후)에 `analysePly`를 **8플리씩 120ms 간격 배치**로 전수 실행해 blunder 점 마커와 칩 등급 라벨이 점차 채워지게 한다. 로드 세대 가드 변수로 새 기보 로드 시 즉시 중단(기존 `qualityCache.clear()` 흐름 보존).

#### 구현 포인트 (실제 파일/함수)

**suiji-kifu.html 단일 파일.**

1. `findTurningPoints()` 신규 (analysePly 근처, 569행 부근).
2. `drawGraph()`(678행): 다이아몬드/점선 렌더링 추가 — `px()`, `py()` 헬퍼 재사용.
3. Win-rate Graph 패널 HTML(295~303행): `.turning-list` 컨테이너 추가 + 페이지 `<style>`에 칩 스타일.
4. `updateAnalysis()`(611행) 또는 그래프 갱신 시점에 칩 리스트 렌더 (`scrub()`에서 이미 `drawGraph()`가 호출되므로 칩은 로드 시 1회 렌더 후 클릭만 바인딩 — 매 스크럽 재렌더 금지).
5. 백그라운드 프리컴퓨트: `computeWinRates()`(540행) 마지막에 배치 루프 기동.

#### 수용 기준

- [ ] 기보 로드 직후 승률 그래프에 승부처(최대 3개) 다이아몬드가 즉시 표시된다 (등급 분석 완료 전이라도).
- [ ] 승부처 칩 클릭 시 해당 수순으로 이동하며 칩에 등급 라벨이 있으면 함께 보인다.
- [ ] 8%p 이상 스윙이 1곳도 없는 판에서는 마킹 대신 "이른 승부 없음" 문구가 나온다.
- [ ] 전수 프리컴퓨트 진행 중 새 기보를 로드하면 이전 배치 루프가 즉시 중단된다 (캐시 오염 없음).
- [ ] 100수 넘는 19×19 기보에서도 스크럽/재생 프레임드랍이 체감되지 않는다.

---

### 2-3. 업적 뱃지 — 스위트 공통 (리서치 #8)

**규모: L**

#### 배경 (리서치 근거)

- 아이디어 #8: "티어 뱃지/마일스톤: 도전과제 탭 (스토리지 기반)", 참고사례 Duolingo/chess.com의 "스트릭+티어 뱃지".
- "스위트 전체에 공통 적용되는 것을 우선" 요건에 유일하게 부합하는 항목. 코드 현실: `Suiji.stats`가 게임별 W/L/D를 `suiji.stats.v1`에 이미 관리하고, **3개 게임 모두 판종료를 `Suiji.stats.record()` 한 곳으로 보고한다**(go 1739행, omok 936/947/950행, alkkagi 775행). 즉 이 함수에 판정 훅만 걸면 **게임 페이지 수정 0으로 전 게임에서 업적이 잠금 해제**된다. 기보 저장 수(`Suiji.kifu`)도 데이터 소스로 사용 가능.

#### 명세

**저장소 (신규 키, 기존 키 불변)**

```
suiji.badges.v1 = { "version": 1, "unlocked": { "<badgeId>": <잠금해제 epochMs> } }
```
- 읽기는 기존 `readStats()`와 동일한 try/catch 가드 패턴. 총 용량 ~300B 수준.

**데이터 구조 — Suiji.badges (suiji-common.js 신규 섹션)**

```js
Suiji.badges = {
  DEFS: [
    // { id, name, desc, icon, tier(1|2|3), check(stats, kifuCount) => boolean }
    // tier: 1=입문(잉크), 2=중수(금 var(--gold)), 3=고수(홍 var(--accent))
  ],
  get(),            // 전체 정의 + 잠금 여부 + 잠금 시각
  unlockedCount(),  // "3 / 9" 표기용
  evaluate(opts),   // stats+kifu를 다시 읽어 미잠금 조건 충족분을 unlock.
                    // opts.silent=false일 때 신규 잠금마다 토스트+전용 효과음.
                    // 여러 개 동시 달성 시 이름을 나열해 토스트 1회로 묶음.
  render(el)        // 도장 페이지용 렌더 헬퍼 (페이지 JS 최소화 목적)
};
```

**업적 목록 (9개 — 전부 기존 데이터만 사용, 스키마 확장 없음)**

| id | name | desc | icon | tier | 조건 |
|---|---|---|---|---|---|
| first-win-any | 첫 승 | 두마당에서 처음으로 이겼다 | fa-flag-checkered | 1 | 전체 w ≥ 1 |
| first-go | 흑백의 시작 | 바둑 첫 승 | fa-yin-yang | 1 | go.w ≥ 1 |
| first-omok | 다섯 줄의 승부 | 오목 첫 승 | fa-hashtag | 1 | omok.w ≥ 1 |
| first-alkkagi | 톡 쳤더니 | 알까기 첫 승 | fa-baseball | 1 | alkkagi.w ≥ 1 |
| win10 | 유단자 | 누적 10승 | fa-medal | 2 | 전체 w ≥ 10 |
| win30 | 두마당 고수 | 누적 30승 | fa-trophy | 3 | 전체 w ≥ 30 |
| games50 | 단골손님 | 누적 50판 | fa-mug-hot | 2 | 전체 w+l+d ≥ 50 |
| alkkagi5 | 낙법 고수 | 알까기 누적 5승 | fa-baseball | 2 | alkkagi.w ≥ 5 |
| kifu3 | 기보 수집가 | 기보 3판 저장 | fa-book-open | 2 | Suiji.kifu.list().length ≥ 3 |

**잠금 해제 흐름**

1. 훅: `Suiji.stats.record()` 마지막 줄과 `Suiji.kifu.save()` 마지막 줄에서 `Suiji.badges.evaluate()` 호출 (모듈 정의 순서 무관 — 유저 트리거 시점엔 이미 로드됨).
2. 연출: 신규 잠금 시 `Suiji.toast('업적 달성 — {name}', 4000)` + 신규 `Suiji.sound.badge()` (짧은 2음 상승 jingle: 880→1320Hz, 각 0.15s, vol 0.12 — 기존 `tone()` 헬퍼 재사용, `_p()` 가드·토글 연동 유지).
3. **타이밍 규칙**: 판종료 사운드(win/lose)와 겹치지 않게 `setTimeout 900ms` 후 재생. `Suiji.toast`는 단일 인스턴스 교체형이므로 기존 알림과 충돌 시 나중 알림이 이기는 기존 동작을 그대로 둔다.

**도장(suiji-index.html) UI**

- 게임 카드 목록 위에 "업적" 섹션 신설: 타이틀 + `3 / 9` 카운터 + 칩 가로 스크롤 스트립.
- 칩: 원형 아이콘 + 이름. 잠금 시 회색조+`fa-lock`, `title=desc`, 클릭 시 `Suiji.toast(desc)`로 힌트. 해금 시 티어 색상 테두리, `title="{desc} · {잠금 날짜}"`.
- 렌더는 `Suiji.badges.render(el)` 한 줄 호출.

#### 구현 포인트 (실제 파일/함수)

1. **suiji-common.js** — ① `Suiji.badges` 섹션 신규(DEFS/get/evaluate/render, 저장소 read/write 헬퍼), ② `Suiji.sound.badge()` 1개 추가(기존 sound 객체 패턴 내), ③ `stats.record()`(151행 부근) 끝과 `kifu.save()`(177행 부근) 끝에 evaluate 훅 1줄씩. 그 외 기존 로직 불변.
2. **suiji-index.html** — 카드 섹션 위 업적 섹션 HTML + `Suiji.badges.render()` 호출 수 준 스크립트 + 스트립 CSS(페이지 `<style>` 또는 suiji-theme.css 대신 페이지 한정 — theme.css는 본 항목에서 수정하지 않음).
3. **게임 3개 페이지: 수정 0** (record 훅이 자동 처리). Node 환경(`tests/`)에서는 common이 early-return하므로 기존 테스트 영향 없음.

#### 수용 기준

- [ ] 바둑/오목/알까기 어느 게임에서 첫 승리해도 1초 내 "업적 달성 — 첫 승" 토스트와 전용 효과음이 나오고, 사운드 OFF 시 소리만 나지 않는다.
- [ ] 도장 페이지에 9개 업적 칩 스트립이 잠금/해금 상태를 정확히 반영해 표시되고, 잠금 칩 클릭 시 조건 설명 토스트가 나온다.
- [ ] `suiji.stats.v1`·`suiji.kifu.v1`·`suiji.sound` 값은 업적 기능 도입 전후로 바뀌지 않는다 (신규 키 `suiji.badges.v1`만 추가).
- [ ] localStorage 비활성/손상 환경에서도 업적 모듈이 예외를 던지지 않고 게임이 정상 동작한다.
- [ ] 판 종료 승리/패배 사운드와 업적 효과음이 겹치지 않는다 (900ms 지연).

---

## 3. 범위 외 (명시)

이번 스프린트에서 **하지 않는 것** — 다음 후보와의 스코프 경계:

1. **알까기 주스 패스** (리서치 #6: 포획 파티클 + 히트스톱 80ms + 화면 흔들림). 코드 검증 결과 `stepPhysics`의 `events.collisions/outs`에 훅 지점이 마련돼 있어 구현 자체는 가능하나, 물리 루프(`frame`)와 온라인 샷 동기화 경로를 건드리는 리스크 대비 스코프가 M+M+L을 초과한다. 다음 스프린트 1순위 후보로 명시적으로 남긴다.
2. **데일리 챌린지/스트릭** (#3) — "리셋 절대 금지·프리즈" 정책 설계가 필요한 독립 기획으로 분리.
3. **오목 힌트 3단계** (#4) — 현 힌트(추천점 1개, `onHint`)의 단계화. 오목 단독 페이지 개선이라 본 폴리싱(공통 우선)과 분리.
4. **바둑 소판 초보 모드/5분 배지** (#7), **AI 성격 부여** (#9), **패한 국소 복습 퍼즐** (#10).
5. **엔진/AI 알고리즘 개선** — `GoAI.evaluateMove` 가중치·탐색 깊이 변경, 승률 추정 정밀도 개선 등. 본 문서의 모든 등급/승부처는 기존 판정값의 "번역"이지 판정기 개선이 아니다.
6. **게임 룰 변경, SuijiEngine 공개 API 변경, suiji-net.js 프로토콜 변경, server.cjs 변경, 신규 외부 라이브러리 도입.**
7. **기존 영어 UI 카피의 한국어 일괄 전환** — 혼재 리스크가 커서 신규 요소만 한국어로 간다.

## 4. 리스크

| # | 리스크 | 영향 | 완화책 |
|---|---|---|---|
| 1 | **19×19 후반 전수 후보 평가 비용** (2-1): `topMoves`가 판 전체 후보를 레벨2 가중(영토 2회 스캔 포함)으로 평가. 기보 `analysePly`가 동일 연산을 스크럽마다 수행하는 선례가 있으나, 대국 화면은 매 착수마다 백그라운드 실행된다 | 클릭 후 미세 프리즈, 저사양 모바일 체감 | 착수 후 350ms 지연 + `gameGeneration` 세대 가드 + 수순 키 캐시. 그래도 무겁으면 19판 한정 "후반(history > size²) 생략" 폴백을 옵션화 |
| 2 | **등급 오판/기대치 관리** (2-1·2-2): delta는 휴리스틱 AI의 점수이지 승률이 아님. "실수" 과잉 표시 시 유즈 케이스 피로 | 피드백 신뢰 하락 | 문구를 "~칸 손해(근사)"로 한정하고 meta에 `AI 근사` 상시 표기. 문턱값(2.5/8/20/45·8%p)을 `GRADE_THRESHOLDS`/판정 함수 상단 한 곳에 모아 데이터 보며 튜닝 가능 |
| 3 | **koPoint 미복원 근사** (2-1): 착수 이전 국면 재구성 시 코 포인트가 비어 최선 후보에 실제로는 코 반칙인 점이 오를 수 있음 — 기보 `gameAt()`과 동일한 기존 한계 | 드물게 엉뚱한 "최선 좌표" 제시 | 피드백은 권고가 아닌 사후 평가 문구로 한정. 기보와 동일 동작으로 일관성 유지, 별도 수정하지 않음 |
| 4 | **localStorage 신규 키/손상** (2-3): 사설 모드·스토리지 차단 환경 | 예외로 게임 진행 방해 가능성 | 기존 `readStats()`와 동일 try/catch 패턴, 스토리지 실패 시 업적 기능 전체가 조용히 비활성(게임은 무영향) |
| 5 | **연출 충돌** (2-3): 판종료 카드/사운드와 업적 토스트 타이밍 겹침 | 연출가 가려짐 | 900ms 지연 재생 규칙 + toast 단일 인스턴스 교체 동작 유지 |
| 6 | **언어 혼재** (전체): 신규 카피는 한국어, 기존 패널(Excellent, Win-rate Graph 등)은 영어 유지 | 화면 내 이중언어 | 본 스프린트에서 의도된 범위(§3-7). 브랜드 카피 정리는 별도 태스크로 후속 제안 |
| 7 | **스크럼 회귀** (2-2): 그래프 렌더 경로 수정이 기존 blunder 점·현재 위치 점과 겹침 | 그래프 시각 회귀 | 승부처 마커를 기존 마커보다 아래 레이어에 그리고, `drawGraph` 내 신규 블록은 분리된 함수(`drawTurningPoints`)로 캡슐화해 롤백 단위를 한 함수로 |

---

### 부록: 검증에 사용한 코드 위치 (구현 시 참고)

- 공통: `suiji-common.js` — `Suiji.sound`(92~136), `Suiji.stats`(139~160, record 148행), `Suiji.kifu`(163~183, save 170행), `Suiji.coordName`(189행).
- 엔진(수정 없음): `suiji-engine.js` — `GoAI.evaluateMove`(420행), `GoAI.topMoves`(622행, 노이즈 없음·레벨2), 공개 export(1177행).
- 바둑: `suiji-go.html` — `attemptPlace`(1339행), `describePlayerMove`(1555행), `setIntent`(2052행), AI Intent 패널(384~396행), `renderMoveList`(1959행), `onUndo`(1678행), `startNewGame`(1123행).
- 기보: `suiji-kifu.html` — `analysePly`(569행, 등급 문턱 2.5/8/20/45), `QUALITY_LABEL`(603행), `computeWinRates`(540행), `drawGraph`(678행, blunder 마커 724행), `scrub`(752행), Win-rate Graph 패널(295~303행).
- 기타 확인: 오목·알까기 모든 판종료가 `Suiji.stats.record` 경유(omok 936/947/950행, alkkagi 775행) — 업적 훅의 전 커버리지 근거.
