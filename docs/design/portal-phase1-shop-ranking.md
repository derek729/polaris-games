# 포털 Phase 1 — 코인 상점 · 주간 랭킹 기획서

- 작성: 기획팀 · 2026-09-18 (김실장 승인)
- 대상: 폴라리스 게임 센터 로비 `index.html` · 통합 런타임 `polaris-common.js` (window.Polaris) · 두마당 공통 런타임 `suiji-common.js` (window.Suiji)
- 근거: `/mnt/data/work/polaris/02-planning/포털통합-사업기획서-v1.md` §3 Phase 1 "코인 경제 활성화"
  - 게임 보상 ✓ 구현 (suiji-common.js:163 → `Polaris.settle` 자동 정산, 바둑·오목·알까기·기보)
  - 일일 출석 ✓ 구현 (`Polaris.daily`, 🌰100 + EXP 20)
  - **코인 상점 1종(보드 테마) ✗ → 본 문서 §1**
  - **주간 랭킹 ✗ → 본 문서 §2**
- 현재 런타임: `polaris-common.js` (376행) — `Polaris = { profile, coins, daily, level, missions, settle, toast, header, widgets{profileCard, missionsPanel} }`
- 스프린트 총 규모: **M + M** (2개 항목, 개발 1인 전담)

---

## 0. 하드 제약 (전 항목 공통)

1. **서버 없음** — 모든 상태는 localStorage만 사용. 클라우드 동기화는 Phase 2 (server.cjs 계정 서버) 이관 대상이므로, 키 설계는 그때 그대로 업로드 가능한 JSON 구조로 만든다.
2. **file:// 동작** — 상대경로만 사용, 빌드 없는 단일 JS, 외부 라이브러리/폰트/이미지 추가 금지. (테마 프리뷰도 CSS 그라디언트로만 그린다.)
3. **기존 폴백 패턴 유지** — `readJSON`/`writeJSON` try-catch, 그리고 `if (window.Polaris && Polaris.shop)` 식의 존재 가드(suiji-common.js:163 `Polaris.settle` 가드와 동일 패턴). polaris-common.js 로딩 실패 시 게임은 기존 외형 그대로 동작.
4. **파일 소유 3개** — `polaris-common.js` / `index.html` / `suiji-common.js` (개발자 1명이 전부 소유). `suiji-engine.js`, `suiji-theme.css` **수정 금지**. `sw.js`는 로직 수정 없이 `CACHE_VERSION` 문자열 bump만 허용(릴리즈 절차).
5. **기존 저장 키 스키마 불변** — `polaris.profile.v1` / `polaris.wallet.v1` / `polaris.daily.v1` / `polaris.level.v1` / `polaris.missions.v1` / `suiji.stats.v1` / `suiji.kifu.v1` 은 읽기만 하고 절대 변경하지 않는다. 신규 키는 `polaris.shop.v1`, `polaris.weekly.v1` 2개뿐.
6. **코스메틱 한정** — 상점 판매는 외형(보드 톤)만. 승률 판정·매치메이킹·보상 확률에 영향을 주는 상품은 취급하지 않는다 (사업기획서 §5 "코스메틱 한정 권장" 원칙).

### 참고 프로젝트에서 배운 점

| 프로젝트 | 수집본 | 배운 점 (기획 반영) |
|---|---|---|
| **lichess** (lichess-org/lila, AGPL-3.0, 수집본 meta.json 기준 18.7k★) | `/mnt/data/work/polaris/01-research/references/랭킹시스템/lila/README.md` | 수집본 README가 보여주는 핵심은 "120억 게임을 서버 DB(MongoDB)에 쌓고, 전부 공개 데이터(PGN)와 HTTP API로 다시 꺼내준다"는 점이다. 즉 lichess의 주간 리더보드는 **집계의 원본이 한 곳(서버)에 모여 있기 때문에** 가능한 기능 — 서버가 없는 우리 Phase 1에서는 그 구조 중 "기간(주) × 게임별 승/패/무 × 획득 지표" 뼈대만 로컬로 재현하되, 원본 기록을 `Polaris.settle()` **한 곳에서만** 수집하고 조회도 `Polaris.weekly.summary()` **하나로만** 노출해(lichess의 단일 API 철학) Phase 2에 server.cjs 집계로 스키마 그대로 승격할 수 있게 설계한다. |
| **wordle-clone** (WebDevSimplified, MIT, 178★) | `/mnt/data/work/polaris/01-research/references/게임경제UI/wordle-clone/README.md` | ⚠️ 수집본 README.md가 **0바이트로 비어 있다**(수집 스크립트 오류로 판단 — 리서치팀 재수집 요청, §6 후속 조치). 본문 인용은 보류하고, 수집 사유(게임경제UI — localStorage 진행/통계 저장 패턴)와 레포 정체성이 말해주는 사실을 따른다: **서버·계정 없는 게임도 "오늘의 상태 + 누적 통계"를 키-값 localStorage로만 영속화하면** 재방문 시 이어지는 진행감을 만들 수 있다 → 상점 소유권(`polaris.shop.v1`)과 주간 성적표(`polaris.weekly.v1`)의 키 설계와 자동 롤오버에 그대로 적용한다. |

---

## 1. 코인 상점 — 보드 테마 (규모: M)

### 1-1. 상품 구성

바둑·오목 판(canvans#board)에 공통 적용되는 **보드 테마 4종**. 적용 대상은 `suiji-go.html`, `suiji-omok.html` (v1 한정 — 알까기·기보는 렌더 구조 검증이 별도로 필요해 스코프에서 제외, Phase 2 백로그).

| id | 이름 | 가격 | 콘셉트 | 보드 톤(프리뷰 기준) |
|---|---|---|---|---|
| `basic` | 기본 | — (전원 소유, 판매 안 함) | 현재 출시 보드 | 단풍 우드 #dcb268 |
| `classic` | 클래식 | **300** | 밝은 전통 우드 | 연한 황톳색 |
| `cheolmok` | 철목 | **450** | 짙은 가을 철목 | 적갈색 |
| `hanji` | 한지 | **600** | 한지 재질의 따뜻한 미색 | 미색·은은한 결 |
| `neon` | 네온 | **800** | 다크 룸 네온 | 청록 틴트 + 글로우 |

- **가격 근거 (300~800 도토리)**: 현재 수급 — 일일 출석 100/판, 승리 판돈 +50, 미션 60~120, 레벨업 20×Lv. 최저가 300은 "2~3일 접속 + 몇 판", 최고가 800은 "약 1주"의 첫 저축 목표. 출석만으로도 살 수 있어 무임금 사용자가 좌절하지 않는 선.
- 테마 1종 구매 시 바둑·오목 **양쪽에 공통 적용** (v1 단순화 — 게임별 개별 선택은 Phase 2).

### 1-2. 데이터·API 설계 (polaris-common.js)

신규 키 `polaris.shop.v1`:

```js
{ owned: ['classic'], active: 'classic' }   // active는 테마 id 또는 'basic'
```

구현 힌트 — 기존 모듈 골격(readJSON/writeJSON/emit, 한국어 섹션 주석) 그대로:

```js
/* ---------------- 상점 (보드 테마 — 코스메틱 영구 소유) ---------------- */
const SHOP_KEY = 'polaris.shop.v1';
// 프리셋: 로비 스와치 프리뷰와 suiji 테마 훅이 같이 읽는 단일 출처
const THEME_DEFS = [
  { id: 'classic',  name: '클래식', price: 300, vars: { '--board': '#e6c17a', '--board-dark': '#cfa254' }, filter: 'none' },
  { id: 'cheolmok', name: '철목',   price: 450, vars: { '--board': '#b07a42', '--board-dark': '#8f5c2c' }, filter: 'saturate(1.15) brightness(.94)' },
  { id: 'hanji',    name: '한지',   price: 600, vars: { '--board': '#efe3c2', '--board-dark': '#d8c79b' }, filter: 'sepia(.18) brightness(1.06)' },
  { id: 'neon',     name: '네온',   price: 800, vars: { '--board': '#2ea88a', '--board-dark': '#1c7a63' }, filter: 'hue-rotate(140deg) saturate(1.4) brightness(.9)' }
];

P.shop = {
  catalog() { /* THEME_DEFS + 소유/활성 여부를 붙여 반환 */ },
  activeId() { /* 미설정·무효값이면 'basic' — 폴백 기본값 */ },
  buy(id)    { /* 이미 소유 → {ok:false,reason:'owned'} / 잔액 부족 → {ok:false,reason:'poor',need,lack} */
               /* P.coins.spend(price) 성공 시 owned 추가 + 자동 장착 + writeJSON + emit('shop', store) */ },
  equip(id)  { /* 소유 테마만 장착, emit('shop') */ },
  unequip()  { /* 'basic'으로 복귀 — 소유권은 유지 (환불 아님) */ }
};
```

### 1-3. 구매 플로우 · 예외 처리 · 정책

| 케이스 | 동작 |
|---|---|
| 구매 확인 | `confirm()` 1회 — "🪵 철목 테마를 🌰450에 구매할까요? 구매 후 환불은 되지 않아요." (기존 닉네임 변경 `window.prompt`와 같은 네이티브 다이얼로그 패턴) |
| **재구매 방지** | `buy()`가 `owned` 포함 여부를 먼저 검사해 차단. UI에서도 보유 테마는 버튼 자체가 '적용'으로 바뀌어 구매 경로가 노출되지 않음 (이중 방어) |
| **잔액 부족** | `P.coins.spend()`의 false 반환(기존 패턴)을 그대로 사용. 토스트: "도토리가 부족해요 — 필요 450 · 보유 320 (부족 130)". 카드 버튼에도 부족 금액 표시 |
| 구매 성공 | 즉시 자동 장착 + 토스트 "테마 구매! 보드에 바로 적용됐어요" + `emit('shop')`/`emit('coins')`로 상단바·프로필 카드 잔액 동기화 (기존 이벤트 재구독 패턴) |
| **환불** | 미제공 — 영구 소유 코스메틱 정책(§0-6). 대신 '적용 해제'로 기본 보드 복귀는 언제나 가능 (환불과 구분 명시) |

### 1-4. 상점 UI — 로비 위젯 (P.widgets 패턴 재사용)

`P.widgets.shopPanel(selector)` — `missionsPanel`과 동일 골격(BOX_STYLE 상수 + 내부 `render()` + `polaris:*` 이벤트 재구독):

- 섹션 타이틀: "🛒 보드 테마 상점" + 우측에 현재 잔액 (🌰 실시간)
- 테마 카드 그리드: **미니 보드 스와치**(CSS 그라디언트로 프리셋 vars를 입힌 미리보기 — 구매 전 색감 확인) + 이름 + 가격 + 상태 버튼
  - 미보유: `🌰450 구매` / 잔액 부족: `🌰130 부족`(비활성 톤) / 보유: `적용` / 적용 중: `적용 중 ✓`
- 소유 테마에는 '보유 ✓' 뱃지, 환불 안내는 위젯 하단 1줄 ("구매한 테마는 영구 소유 — 환불은 지원되지 않아요")
- 모바일: `repeat(auto-fit, minmax(150px, 1fr))` 2열 — 기존 `#portal-meta` 그리드와 같은 방식, 가로 스크롤 없음
- 마운트: `index.html`에 `Polaris.widgets.shopPanel('#portal-meta');` 1줄 추가

### 1-5. 테마 적용 훅 — suiji-common.js 단 1곳 (규모: S)

**코드 확인 결과(제약의 출처)**: 보드는 canvas 렌더(`suiji-engine.js` `BoardRenderer`)이고 목재 질감 색이 `makeWoodTexture()`에 하드코딩(`#e2b075/#d6a466/#c08a4a`)돼 있다. 엔진은 소유 파일이 아니므로 수정 불가. `suiji-theme.css`의 `--board`/`--board-dark` 변수는 정의만 있고 소비처가 없다.

따라서 훅은 **suiji-common.js 한 곳**에 두고, 엔진 무수정으로 이렇게 해결한다:

```js
/* ---------------- 포털 보드 테마 훅 (Phase 1 상점) — 적용은 여기 한 곳 ---------------- */
Suiji.theme = {
  apply() {
    if (!(window.Polaris && Polaris.shop)) return;   // 폴백: 런타임 부재 시 기존 외형 유지
    const t = Polaris.shop.catalog().find(x => x.active);  // 활성 프리셋 (basic이면 아무것도 안 함)
    const root = document.documentElement;
    for (const [k, v] of Object.entries(t ? t.vars : {})) root.style.setProperty(k, v); // CSS 변수 적용
    root.setAttribute('data-suiji-theme', t ? t.id : 'basic');
    // <style> 1개 주입: canvas#board에 프리셋 filter 틴트 → 엔진 수정 없이 목재 톤 변환
    // (예: neon = hue-rotate + saturate + 글로우 drop-shadow / hanji = sepia + brightness)
  }
};
Suiji.theme.apply();                                  // 로드 직후 1회
document.addEventListener('polaris:shop', () => Suiji.theme.apply()); // 동일 탭 실시간 반영용
```

- 구매 전 **미리보기**: 상점 위젯의 미니 보드 스와치가 같은 프리셋 vars를 CSS 그라디언트로 렌더 — 소유 전에도 색 확인 가능. 실보드 확인은 게임 페이지 방문으로 (별도 프리뷰 모드는 v1 제외).
- **Phase 2 백로그**: `suiji-engine.js` `makeWoodTexture`에 프리셋 파라미터 추가(엔진 소유권 확보 시) — 그때까지 filter 틴트 유지.

---

## 2. 주간 랭킹 — "내 주간 성적표" (규모: M)

### 2-0. 방향 결정

서버가 없으므로 lichess식 전체 유저 리더보드는 불가 → v1은 **"나 vs 지난주 나" 성적표**. 사업기획서의 "주간 랭킹 페이지"는 v1에서 **로비 주간 요약 패널**로 충족한다 (별도 페이지 없음 — 요약과 게임별 상세가 한 카드 안에, 모바일에서 자연 스택).

### 2-1. 데이터 수집 — settle() 한 곳에서만 (참고: lichess 배운 점 적용)

`suiji-common.js:163`이 판 종료마다 `Polaris.settle(game, outcome)`을 호출하므로(바둑·오목·알까기·기보 자동), 주간 집계도 settle 내부에서 기록한다 — `P.weekly.record(game, outcome, delta, expGain)` 1줄 추가. settle이 이미 갖는 값(game · outcome · 판돈 delta · expGain)만 수집하고, **settle을 호출하는 게임은 향후 자동 포함**된다. (아케이드 3종 미연동은 기존 격차로 본 항목에서 해결하지 않음.)

### 2-2. 주 시작 규칙 — "월요일 기준 주 시작"

ISO 주(주 번호 계산 복잡) 대신 단순 규칙: **현지 시간 월요일 00:00이 주 시작**, 주 번호를 만들지 않고 `weekStart` 날짜 문자열 하나로만 비교.

```js
// 월요일 기준 주 시작 (YYYY-MM-DD, 로컬 기준) — ISO 주 번호 계산 없이 날짜 비교만
function weekStartISO(now) {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // 월=0 … 일=6 만큼 되돌림
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); // 로컬 날짜 (toISOString의 UTC 시프트 회피)
}
```

### 2-3. 저장 키 설계 — `polaris.weekly.v1`

```js
{
  weekStart: '2026-09-07',              // 이번 주 월요일 (로컬)
  plays: 12,
  games: { go: { w: 3, l: 1, d: 0 }, omok: { w: 2, l: 2, d: 1 }, alkkagi: { w: 0, l: 3, d: 0 }, kifu: { w: 0, l: 0, d: 0 } },
  coinsEarned: 260, coinsSpent: 150,    // settle delta의 부호 기준 합산 (무승부 0)
  exp: 210,
  last: { weekStart: '2026-08-31', plays: 9, coinsEarned: 190, exp: 160 }  // 지난주 요약 스냅샷 — 1주만 보관(비교 지표용)
}
```

- **자동 롤오버**: 기록 시점에 저장된 `weekStart` ≠ 오늘의 주 시작 → 현재 값을 `last`로 스냅샷 후 새 주 0으로 초기화. 로비 재방문 시 `summary()`가 재판정하므로 탭 상시 오픈 케이스도 다음 이벤트에서 정리된다.
- **시계 되돌림 가드**: 저장된 `weekStart`가 오늘보다 미래면(시계 조작) 무시하고 리셋 — 음수 주 방지.
- **파손/부재**: `readJSON` fallback (기존 패턴). API: `P.weekly = { summary(), record(game, outcome, delta, exp) }` — `record`는 settle에서만 호출(외부 직접 호출 금지 주석 명시). `settle` 끝에 `emit('weekly', summary)` 추가.

### 2-4. UI — 로비 주간 패널

`P.widgets.weeklyPanel(selector)` — 같은 위젯 골격:

- **요약 4칸**: 이번 주 **N판** · **N승 M패** · 🌰 **+260 / −150** · EXP **+210**
- **지난주 비교 1줄**: "지난주보다 3판 더 했어요 ↑" (`last` 없으면 "이번 주가 첫 주예요")
- **게임별 상세 리스트**: `바둑 3W · 1L` `오목 2W · 2D` … (전적 없는 게임은 '—') — `Suiji.stats.text()`와 같은 W/L/D 표기 포맷 재사용
- 렌더 트리거: `polaris:weekly`(신규) + `polaris:coins` 재구독 — 판 종료 직후 로비 복귀 시 즉시 갱신
- 마운트: `index.html`에 `Polaris.widgets.weeklyPanel('#portal-meta');` 1줄 추가

---

## 3. 수용기준 (QA 브라우저 체크리스트 — 12개)

QA는 file:// 와 http(GitHub Pages 로컬 프리뷰) 양쪽에서, 데스크톱 Chrome + 모바일 뷰(375px)로 검증한다.

- [ ] **A1 상점 렌더**: 로비 `#portal-meta`에 '보드 테마 상점' 카드가 프로필/미션 카드와 동일 박스 스타일로 렌더된다 (file://·http 공통)
- [ ] **A2 구매 전 미리보기**: 미보유 테마 카드의 미니 보드 스와치가 각 프리셋 색(클래식/철목/한지/네온)으로 표시된다
- [ ] **A3 잔액 부족**: 도토리 300 미만 상태에서 첫 테마 구매 시도 → 구매 불가, "필요/보유/부족" 수치가 포함된 안내, 잔액 변화 없음
- [ ] **A4 구매 정산**: 잔액 충분 시 confirm → 잔액이 가격만큼 감소하고 상단바·프로필 카드 잔액이 즉시 동기화된다
- [ ] **A5 재구매 방지·영구 소유**: 구매한 테마는 '보유 ✓'가 되어 재구매 버튼이 노출되지 않고, 새로고침 후에도 소유가 유지된다 (localStorage `polaris.shop.v1`)
- [ ] **A6 테마 적용·폴백**: 테마 적용 후 `suiji-go.html`·`suiji-omok.html`의 보드 canvas와 프레임 톤이 프리셋으로 표시된다. devtools에서 polaris-common.js 로딩을 차단하면 기존 기본 외형 그대로 동작한다 (폴백)
- [ ] **A7 적용 해제**: '적용 해제' 시 기본 보드로 복귀하며 소유권은 유지된다 (환불 없음 문구는 구매 confirm에만 노출)
- [ ] **B1 주간 실시간 집계**: 바둑 1국 종료 → 로비 주간 패널의 판수/승패/도토리/EXP가 즉시 갱신된다
- [ ] **B2 게임별 분리**: 오목·알까기 1판씩 종료 → 게임별 상세 리스트에 각각 분리 집계된다
- [ ] **B3 주간 롤오버**: `polaris.weekly.v1`의 `weekStart`를 지난주 월요일로 조작 후 판 종료 → 지난주 값이 `last`로 보관되고 새 주 카운트가 0에서 시작한다
- [ ] **B4 정합성**: 주간 패널의 승+패+무 합 = 이번 주 판수이고, 도토리 순변동(+260/−150)이 판 종료 토스트 합계와 일치한다
- [ ] **C1 모바일**: 375px 폭에서 상점 그리드 2열·주간 패널 1열로 깨짐 없이 스택되고 가로 스크롤이 없다

---

## 4. 파일 소유 계획 (개발자 1명 — 3파일 전부 소유)

| 파일 | 변경 내용 | 예상 규모 |
|---|---|---|
| `polaris-common.js` | §1-2 `P.shop` 모듈 · §2-3 `P.weekly` 모듈 · `settle()`에 `weekly.record` 1줄 + `emit('weekly')` · `widgets.shopPanel`/`weeklyPanel` | +180~220행 (376 → 약 580행) |
| `index.html` | 위젯 마운트 2줄 + 버전 뱃지를 런타임 버전과 정렬 (v1.5.0 · GAME PORTAL) | 약 5행 |
| `suiji-common.js` | §1-5 `Suiji.theme` 훅(변수 적용 + style 주입) + `stats.record` 주석 갱신 | +50~70행 |
| (비소유) `suiji-engine.js`·`suiji-theme.css` | 수정 금지 — Phase 2에 `makeWoodTexture` 프리셋 파라미터 백로그 | 0행 |
| (릴리즈) `sw.js` | 로직 수정 금지, `CACHE_VERSION` 문자열 bump만 (동일 개발자가 배포 절차로 수행) | 1행 |

- 인터페이스 계약은 본 문서가 단일 출처: 키 `polaris.shop.v1` / `polaris.weekly.v1`, 이벤트 `polaris:shop` / `polaris:weekly`, API `Polaris.shop.{catalog,buy,equip,unequip}` / `Polaris.weekly.summary`.
- 1인 소유이므로 PR 리뷰는 셀프 + QA 시나리오(§3) 기반 통과로 대체한다.

---

## 5. 규모 산정 (항목별 S/M)

| 항목 | 규모 | 근거 |
|---|---|---|
| `P.shop` 데이터 모듈 (catalog·buy·equip) | **S** | `coins.spend/balance` 재사용, `missions` 모듈과 동일 골격(readJSON/emit/가드). 신규 로직은 소유 배열 관리뿐 |
| `shopPanel` 위젯 UI | **M** | 카드 그리드 + 스와치 프리뷰 + 버튼 3상태(구매/적용/적용 중) + 부족·보유 분기 — `missionsPanel`보다 상태 분기가 많고 모바일 2열 검증 필요 |
| `Suiji.theme` 적용 훅 | **S** | :root 변수 세팅 + `<style>` 주입 1곳, 기존 settle 가드 패턴 재사용. 캔버스를 엔진 수정 없이 filter 틴트로 처리하기로 결정해 엔진 검증 공 제거 |
| `P.weekly` 집계 모듈 | **S** | settle이 이미 갖는 4필드 합산 + 월요일 롤오버/시계 가드 분기뿐 — 데이터 생성은 기존 훅 1곳 재사용 |
| `weeklyPanel` 위젯 UI | **M** | 요약 4칸 + 게임별 리스트 + 지난주 비교의 신규 레이아웃, `polaris:weekly` 이벤트 신설·구독 |
| settle 연결 + emit | **S** | 1~2줄. suiji 4종 자동 적용은 브라우저 1회 확인으로 충분 |
| index.html 마운트 + 릴리즈(sw bump) | **S** | 2줄 마운트 + 버전 문자열 |
| **합계** | **M + M** | 신규 UI 위젯 2개(M) + 로직 모듈 4개(S). 1인 1~1.5스프린트, 외부 의존 0 |

---

## 6. 후속 조치 (본 스프린트 밖)

1. **리서치팀**: wordle-clone 수집본 README.md 재수집 (현재 0바이트 — §1 표의 인용 공백 해소)
2. **Phase 2 백로그 등록**: ① `makeWoodTexture` 테마 프리셋 파라미터화 ② 알까기·기보 테마 적용 확대 ③ 주간 성적표의 server.cjs 클라우드 집계 승격 (lichess식 리더보드로 확장) ④ 게임별 개별 테마 선택
