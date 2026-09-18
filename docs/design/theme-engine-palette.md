# 보드 테마 엔진 팔레트화 — 품질 손실 없는 목재 텍스처 테마 (BACKLOG #27)

- 작성: 기획팀 · 2026-09-18 (김실장 승인 — 안1 채택)
- 대상: 두마당 보드게임 스위트 — `suiji-engine.js`(SuijiEngine) · `polaris-common.js`(window.Polaris) · `suiji-common.js`(window.Suiji) · 게임 페이지 4종
- 근거: BACKLOG #27 — 보드 테마 상점(Phase 1, 4종)이 CSS filter 틴트 우회로 인해 돌·라인까지 함께 물드는 품질 손실 해소. 엔진의 목재 텍스처 생성기(`makeWoodTexture`)를 직접 파라미터화하고, 알까기·기보 페이지로 적용을 확대한다.
- 선행 문서: `docs/design/portal-phase1-shop-ranking.md` §1-5 "Phase 2 백로그: makeWoodTexture 프리셋 파라미터화" — 본 문서가 그 이행 계획이다.
- 현재 런타임: 웹 게임 포털 v1.6.0 · `polaris-common.js`(648행) · `suiji-common.js`(427행) · `suiji-engine.js`(1178행)
- 스프린트 총 규모: **M** (M 1개 + S 5개, 개발 1인 전담)

---

## 0. 하드 제약 (전 항목 공통)

1. **서버 없음 · file:// 동작** — 기존 Phase 1 제약과 동일. 상태는 localStorage(`polaris.shop.v1`)만 사용, 빌드 없는 단일 JS.
2. **완전 하위호환** — `makeWoodTexture`의 기존 시그니처 `(w, h, scale = 2)`와 기본 출력(하드코딩 색)은 그대로. 팔레트 미지정 시 기존 출시색과 픽셀 단위로 동일해야 한다 (tests/의 기존 테스트·기존 페이지 무영향).
3. **저장 키 불변** — `polaris.shop.v1`의 `{ owned: [], active: '' }` 스키마 변경 없음. `owned`/`active` 소유 데이터는 기존 그대로 읽힌다 (THEME_DEFS에 필드만 추가).
4. **파일 소유 3개** — `suiji-engine.js` / `polaris-common.js` / `suiji-common.js` (개발자 1명이 전부 소유 — Phase 1과 달리 엔진 수정이 본 과제의 본체). 페이지 4종은 캐시 버전 문자열(`?v=`) bump만, `sw.js`는 `CACHE_VERSION`·PRECACHE URL 동기화만 허용(릴리즈 절차).
5. **코스메틱 한정** — 테마는 외형(보드 목재 톤)만. 판정·물리·보상 로직 무영향.
6. **색 변환 filter 폐기 원칙** — hue-rotate/sepia/saturate/brightness 등 색을 바꾸는 filter는 전부 폐기하고 팔레트로 대체. 비색 효과(neon의 글로우 drop-shadow)만 예외적으로 유지.

### 참고 프로젝트에서 배운 점

| 프로젝트 | 수집본 | 배운 점 (기획 반영) |
|---|---|---|
| **Sabaki** (sabaki-dev/sabaki, AGPL-3.0 — 코드 복사 금지, 개념 참고만) | `/mnt/data/work/polaris/01-research/references/보드게임렌더링/sabaki/README.md` | ⚠️ 수집본 README.md가 **0바이트로 비어 있다**(meta.json도 GitHub API 404 응답 JSON — 수집 오류 판단, 리서치팀 재수집 요청은 §8). 본문 인용은 보류하고, Sabaki의 공개 아키텍처에서 확인되는 개념만 따른다: **바둑 GUI의 보드 테마는 "배경(목재) 레이어"와 "돌·라인·좌표 레이어"를 분리해, 테마 교체가 배경에만 닿게 한다** → 우리 엔진도 drawImage 순서가 이미 배경→라인→돌로 분리돼 있으므로(§1-1), filter 틴트를 걷어내고 배경 생성기만 팔레트화하면 동일 효과를 낸다. |

---

## 1. 기술 검증 (선행 코드 조사 — 2026-09-18 기준, 전부 실측)

### 1-1. 엔진 렌더 파이프라인 — makeWoodTexture 해부 (suiji-engine.js)

`makeWoodTexture(w, h, scale = 2)` (646행) — 오프스크린 canvas에 목재를 그려 반환. 색이 5군데 하드코딩돼 있다:

| 요소 | 현재 코드 (행) | 하드코딩 값 |
|---|---|---|
| 목재 그라디언트 3정지 | 653–656 | `#e2b075` → `#d6a466` → `#c08a4a` |
| 결선(세로 무늬) rgba 기준 | 662–664 | `r=100+rand*50, g=55+rand*30, b=18+rand*18` |
| 결눈(올림무늬) rgba | 685–692 | `rgba(80,45,15,…)` / `rgba(110,70,28,…)` / `rgba(120,75,30,…)` 계열 |
| 테두리 비네트 | 713–715 | `rgba(50,28,10,0.32)` |
| 상단 광택 | 719–721 | `rgba(255,240,200,…)` — **색 중립(백색광), 파라미터화 제외** |

소비 경로:
- `BoardRenderer` 생성자 **747행**: `this.woodTexture = makeWoodTexture(this.displayWidth, this.displayHeight)` — **클로저 내부의 로컬 함수를 직접 참조**한다. `SuijiEngine.makeWoodTexture` 경유가 아니다 (→ §2 방안 비교의 결정적 근거).
- `drawWoodBackground()` 840–841행: `ctx.drawImage(this.woodTexture, …)` — 폴백 fill `#d8aa6e`.
- 1177행 export: `SuijiEngine = { …, makeWoodTexture }` 포함.

**돌·라인은 별개 레이어다** (filter 틴트의 피해자일 뿐):
- 돌: `SUIJI_STONE_SPRITES` PNG 스킨(802행 부근, 폴백은 캔버스 스프라이트 769–817행) + 그림자 `rgba(40,22,6,…)` (820행 부근 stoneAt)
- 라인: `rgba(35,22,8,0.78)` (846행 부근 drawGrid)
→ 즉 **filter를 제거하면 돌·라인은 자동으로 원색 회복**되고, 배경만 팔레트를 따른다.

**리사이즈 재생성 4곳** (전부 `makeWoodTexture(w, h)` 2인자 호출 — 시그니처 확장과 무관하게 동작):
`suiji-go.html:1395–1396` · `suiji-omok.html:721–722` · `suiji-alkkagi.html:659–660` · `suiji-kifu.html:1148–1149`

### 1-2. 알까기·기보 렌더 경로 추적 (Phase 1에서 스코프 제외했던 2종)

**알까기 (`suiji-alkkagi.html`) — 스코프 포함 확정.**
- 로드 순서: `suiji-engine.js?v=15`(265) → `polaris-common.js`(266) → `suiji-common.js?v=16`(267) → `suiji-net.js`(268) → 인라인 스크립트(269+).
- `AlkkagiRenderer extends BoardRenderer`(354행)이고 `render()`가 엔진의 `this.drawWoodBackground()`(361행)·`this.drawGrid()`(362행)를 **그대로 호출** — 물리 엔진이라도 보드 배경은 바둑·오목과 **완전히 동일한 엔진 텍스처 경로**다. 페이지 고유 추가분은 `drawEdgeShade()`(상하 갈색 음영 `rgba(50,28,10,…)` 알파 0.12–0.16)와 파티클·조준선뿐으로, 모두 돌 연출 계열이라 테마 무관 유지.
- 결론: Phase 1 기획서가 가정한 "렌더 구조 검증 필요"는 **해소 — 조건 없이 스코프 포함**.

**기보 (`suiji-kifu.html`) — 2D 확정 + 3D 조건부.**
- 로드 순서: engine(337) → three.js(338) → `suiji-3d.js`(339) → polaris-common(340) → suiji-common(341) → 인라인.
- 2D: `KifuRenderer extends BoardRenderer`(405행) — `super.render()`를 호출하는 오버레이 확장이므로 엔진 경로 동일. **확정 포함.**
- 3D: `KifuBoard3D extends Suiji3D.BoardRenderer3D`(434행). 3D 보드 **윗면 텍스처**는 `suiji-3d.js:191–192` `_makeTopTexture()`가 **런타임에 `SuijiEngine.makeWoodTexture(S, S, 1)`을 직접 호출**해 생성한다 → 전역 팔레트 방식(§2 안1)이면 수정 0행으로 자동 적용.
- 조건부 제외: 3D 보드 **옆면·받침·조명 톤**은 three.js 재질 색으로 별도 관리되어 v1에서 미확인 — 2D·3D 윗면만 테마 적용을 보증하고, 옆면 톤은 QA에서 어색함 확인 시 별도 백로그로 분리한다 (§8).

### 1-3. 현재 filter 틴트 방식의 문제 (suiji-common.js 177–214행)

- `Suiji.theme.apply()`는 `THEME_PAGES = ['suiji-go.html','suiji-omok.html']` 화이트리스트 2종에 한해 ① CSS 변수 주입 ② `data-suiji-theme` 속성 ③ `<style id="suiji-theme-tint">`로 **`canvas#board { filter: hue-rotate/sepia/… }` 전체 틴트**를 주입한다.
- filter는 캔버스 출력 전체에 걸린다 → **목재뿐 아니라 돌 스킨·라인·그림자·파티클까지 함께 변색** (예: cheolmok의 `saturate(1.15) brightness(.94)`는 흑돌 하이라이트까지 어둡게 만듦). hue-rotate(140deg)가 든 neon은 돌까지 청록으로 물린다.
- 보조 사실 (재확인 완료):
  - `suiji-theme.css`의 `--board`/`--board-dark`(14–15행)는 **정의만 있고 `var(--board…)` 소비처가 0곳** — 스와치는 `polaris-common.js`의 `swatch()`(520행 부근)가 def 객체를 JS에서 직접 읽는다. CSS 수정 불필요. `data-suiji-theme` 속성의 CSS 소비처도 없음(정보성).
  - `suiji-index.html`(로비)은 `suiji-engine.js`를 로드하지 않는다(479–480행) → 테마 훅에서 `window.SuijiEngine` 존재 가드 필수.
  - 로드 순서가 engine → polaris-common → suiji-common → 페이지 인라인이므로, `Suiji.theme.apply()`(suiji-common 로드 즉시 실행)가 **페이지 렌더러 생성보다 먼저** 끝난다 → 팔레트를 생성 이전에 선설정 가능.

---

## 2. 구현 방안 비교·선택

| | **안1 (채택): 엔진 팔레트 파라미터화** | 안2 (기각): suiji-common.js에서 래퍼 교체 (엔진 무수정) |
|---|---|---|
| 방법 | `makeWoodTexture(w, h, scale = 2, palette = null)` — palette null이면 전역 기본 팔레트(`setWoodPalette`로 설정), 그것도 null이면 기존 하드코딩. `SuijiEngine.setWoodPalette(p)` export 추가 | `SuijiEngine.makeWoodTexture`를 팔레트 지원 구현으로 교체 |
| **결정적 결함** | 없음 | **불가능한 조합 1개 발견** — BoardRenderer 747행은 클로저 로컬 `makeWoodTexture`를 직접 참조하므로 export 교체만으로는 **생성 시점 텍스처가 미적용**. 커버하려면 `SuijiEngine.BoardRenderer`마저 서브클래스로 교체(생성 후 `woodTexture` 재생성 덮어쓰기)해야 해 우회가 2중으로 늘어남 |
| 알고리즘 출처 | 엔진 1곳 (단일 출처 유지) | 텍스처 알고리즘 ~80행을 suiji-common.js에 **복제**해야 함(원본은 색 하드코딩이라 재활용 불가) → 엔진 진화 시 분기 유지보수 리스크 |
| 성능 | 생성 1회/렌더러 | 기본 텍스처 1회 + 테마 재생성 1회 = **2배** (생성·리사이즈마다) |
| 3D(suiji-3d.js) 커버 | 전역 팔레트를 내부에서 참조하므로 **수정 0행으로 자동 적용** (191–192행) | export 교체분은 적용되나(런타임 직접 호출이라) BoardRenderer 래핑과 얽혀 검증 복잡 |
| 하위호환 | 기본 인자 = 기존 출력. 기존 호출부(페이지 리사이즈 4곳 2인자 호출) 무수정 | suiji-common 단일 파일이지만 래퍼의 로드 순서 의존(페이지 destructure 이전)이 암묵적 계약이 됨 |

**권고: 안1.** 근거 — ① 안2는 생성 시점 호출이 클로저 참조라 래퍼만으로 커버되지 않는 실측 결함 보유 ② Phase 1과 달리 `suiji-engine.js`는 이제 소유 파일이므로(§0-4) 우회할 이유가 없음 ③ 전역 기본 팔레트 방식으로 페이지 4종·suiji-3d.js 수정이 0행 — 리사이즈 재생성 4곳(§1-1)도 `palette` 인자 없이 호출하므로 전역 팔레트를 따라 자동 커버.

### 구현 힌트 — suiji-engine.js (한국어 주석, 기존 스타일)

```js
/* ============================================
   WOOD TEXTURE
   ============================================ */
// 테마 팔레트 — suiji-common.js 테마 훅이 setWoodPalette()로 설정한다.
// null이면 내장 기본 팔레트(기존 출시색)를 쓴다 — 완전 하위호환 (§0-2)
let woodPalette = null;

// wood: { stops: ['#..','#..','#..'], grain: [r,g,b], knot: [r,g,b], vignette: [r,g,b] }
function makeWoodTexture(w, h, scale = 2, palette = null) {
  const p = palette || woodPalette; // 명시 인자 > 전역 테마 > 내장 기본 순
  const stops    = p ? p.stops    : ['#e2b075', '#d6a466', '#c08a4a']; // 그라디언트 3정지
  const grain    = p ? p.grain    : [100, 55, 18];   // 결선 기준 RGB (기존 난수 폭 50/30/18은 기준색 비율로 스케일)
  const knot     = p ? p.knot     : [80, 45, 15];    // 결눈 기준 RGB (기존 결눈 3색을 기준색 대비 비율로 환산)
  const vignette = p ? p.vignette : [50, 28, 10];    // 테두리 음영 RGB
  // …이하 기존 알고리즘 그대로, 위 4군데 상수만 위 값 참조로 교체 (광택 719–721행은 색 중립이라 무수정)
}

// export 행(1177)에 1개 추가 — setter만 노출해 외부에서 내부 상태 직접 변조 방지
(typeof window !== 'undefined' ? window : globalThis).SuijiEngine =
  { GoGame, GoAI, BoardRenderer, SGF, packBoard, unpackBoard, makeWoodTexture,
    setWoodPalette(p) { woodPalette = p || null; } };
```

- `BoardRenderer` 747행·페이지 리사이즈 4곳·`suiji-3d.js` 191행은 **수정 0행** — 전부 무인자(또는 2인자) 호출이라 전역 팔레트를 따라간다.
- 난수 폭(결선 `50/30/18` 등)은 기준색 절대 폭 대신 **기준색 비율 스케일**로 바꿔 밝은 테마(한지)에서도 결이 자연스럽게 — QA A2에서 테마별 결 표시 확인.

---

## 3. THEME_DEFS palette 스키마 (polaris-common.js 207–213행)

기존 `id/name/price/vars`와 소유 데이터(`owned`/`active`)는 그대로, **`wood` 필드만 추가**하고 `filter`는 색변환을 제거한다:

```js
// 프리셋: 로비 스와치(vars)와 엔진 목재 팔레트(wood)가 같이 읽는 단일 출처
// wood가 없으면(null) 엔진 내장 기본 팔레트 = 기존 출시색 — 'basic' 복귀와 동일 외형
// filter는 색 변환 금지(§0-6) — neon 글로우 같은 비색 효과만 잔류
const THEME_DEFS = [
  { id: 'classic',  name: '클래식', price: 300,
    vars: { '--board': '#e6c17a', '--board-dark': '#cfa254' },          // 스와치 프리뷰 전용 (기존 유지)
    wood: { stops: ['#f0c98a', '#e4bc7c', '#cfa45e'],                   // 목재 그라디언트 3정지
            grain: [122, 78, 34], knot: [96, 58, 22], vignette: [56, 32, 12] },
    filter: 'none' },
  { id: 'cheolmok', name: '철목', price: 450,
    vars: { '--board': '#b07a42', '--board-dark': '#8f5c2c' },
    wood: { stops: ['#c89058', '#a8743e', '#82552a'],
            grain: [80, 44, 18], knot: [62, 34, 14], vignette: [38, 20, 8] },
    filter: 'none' },                                                   // ← 색변환 saturate/brightness 폐기
  { id: 'hanji',    name: '한지', price: 600,
    vars: { '--board': '#efe3c2', '--board-dark': '#d8c79b' },
    wood: { stops: ['#f6ecd4', '#efe3c2', '#dcc79b'],
            grain: [168, 138, 84], knot: [140, 112, 66], vignette: [120, 96, 56] },
    filter: 'none' },                                                   // ← sepia/brightness 폐기
  { id: 'neon',     name: '네온', price: 800,
    vars: { '--board': '#2ea88a', '--board-dark': '#1c7a63' },
    wood: { stops: ['#35b896', '#2ea88a', '#17715c'],
            grain: [10, 64, 52], knot: [8, 52, 42], vignette: [4, 32, 26] },
    filter: 'drop-shadow(0 0 14px rgba(46,168,138,.45))' }              // ← hue-rotate 폐기, 글로우만 유지
];
```

- 위 수치는 **초기 안** — 개발 단계에서 스와치/실보드 대조로 튜닝한다 (계약은 스키마 4키: `stops`(3정지)/`grain`/`knot`/`vignette`(각 RGB 배열)).
- `wood` 미보유 def는 안전하게 null 취급 → 기본 팔레트 (미래 테마 추가 시 선택 필드).
- `catalog()`는 `wood`를 그대로 반환에 포함만 하면 됨 (스와치는 vars만 읽으므로 기존 UI 무영향).

### 적용 훅 — suiji-common.js (기존 apply 골격 유지, 3군데 교체)

```js
/* ---------------- 포털 보드 테마 훅 (Phase 1 상점) — 적용은 여기 한 곳 ---------------- */
// v2: 색 변환은 엔진 목재 팔레트(SuijiEngine.setWoodPalette)로 — filter 틴트 폐기 (품질 손실 해소, BACKLOG #27)
const THEME_PAGES = ['suiji-go.html', 'suiji-omok.html', 'suiji-alkkagi.html', 'suiji-kifu.html']; // 4종 확대 (기술검증 §1-2)
Suiji.theme = {
  apply() {
    if (!(window.Polaris && Polaris.shop)) return; // 폴백: 런타임 부재 시 기존 외형 유지
    const root = document.documentElement;
    const inScope = THEME_PAGES.some(p => location.pathname.endsWith(p));
    if (!inScope) {
      // 비대상 페이지 — 변수·틴트·팔레트를 전부 해제해 기존 외형 유지 (로비 등)
      for (const k of themeVarKeys) root.style.removeProperty(k);
      themeVarKeys = [];
      root.removeAttribute('data-suiji-theme');
      if (themeStyle) themeStyle.textContent = '';
      if (window.SuijiEngine && SuijiEngine.setWoodPalette) SuijiEngine.setWoodPalette(null); // 팔레트 해제
      return;
    }
    const t = Polaris.shop.catalog().find(x => x.active); // 활성 프리셋 (basic이면 null)
    for (const k of themeVarKeys) root.style.removeProperty(k);
    themeVarKeys = Object.keys(t ? t.vars : {});
    for (const [k, v] of Object.entries(t ? t.vars : {})) root.style.setProperty(k, v);
    root.setAttribute('data-suiji-theme', t ? t.id : 'basic');
    // 색은 팔레트로 — filter는 비색 효과(glow)만 (로비는 엔진 미로드라 가드 필수, §1-3)
    if (window.SuijiEngine && SuijiEngine.setWoodPalette) SuijiEngine.setWoodPalette(t ? (t.wood || null) : null);
    if (!themeStyle) { themeStyle = document.createElement('style'); themeStyle.id = 'suiji-theme-tint'; document.head.appendChild(themeStyle); }
    themeStyle.textContent = 'canvas#board{filter:' + (t && t.filter ? t.filter : 'none') + '}';
  }
};
// 이하 기존과 동일: 로드 즉시 1회 + polaris:shop 리스너 (동일 탭 실시간 반영)
```

- 팔레트 설정 시점은 suiji-common 로드 즉시(기존 213행) → 페이지 인라인 스크립트의 렌더러 생성 **이전**이라 첫 프레임부터 테마 적용 (§1-3 로드 순서 실측).
- `polaris-common.js` 부재 시 최상단 가드가 걸려 팔레트 설정도 스킵 → 엔진 내장 기본 팔레트 = 기존 외형 (폴백 유지).

---

## 4. 스코프 (v1)

| 페이지 | 적용 | 조건 |
|---|---|---|
| 바둑 `suiji-go.html` | O | 기존 적용 페이지 — filter → 팔레트 전환만 |
| 오목 `suiji-omok.html` | O | 상동 |
| 알까기 `suiji-alkkagi.html` | **O (확대)** | 기술검증 §1-2 — BoardRenderer 상속·동일 텍스처 경로 확인, 조건 없음 |
| 기보 `suiji-kifu.html` | **O (확대, 부분 조건부)** | 2D 확정. 3D는 보드 윗면 텍스처만 자동 적용(§1-2) — 3D 옆면·받침 톤은 v1 제외, QA에서 이질감 확인 시 별도 백로그 |
| 로비 `suiji-index.html` | 적용 대상 아님 | 스와치 프리뷰만 (vars) — 팔레트 해제 경로 유지 |

v1 제외: 3D 옆면·받침 톤, 알까기 `drawEdgeShade`의 고정 갈색 음영(알파 0.12–0.16으로 미묘해 테마 무관 사용 가능 — QA에서 neon 적용 시 위화감 확인하고 문제 시 백로그), 게임별 개별 테마 선택.

---

## 5. 수용기준 (QA 브라우저 체크리스트 — 12개)

QA는 file:// 와 http 양쪽, 데스크톱 Chrome + 모바일 뷰(375px)에서 검증. 테마는 기본 → 구매/장착 없이 devtools `Polaris.shop.equip('cheolmok')` 등으로도 치환 가능.

- [ ] **A1 테마별 텍스처 색**: `suiji-go.html`에서 cheolmok 장착 시 판 목재가 cheolmok `stops` 톤(짙은 적갈)으로 렌더되고, hanji 장착 시 미색으로 바뀐다 (4페이지 공통)
- [ ] **A2 결 표현**: cheolmok·hanji에서 결선·결눈이 각 테마 기준색으로 자연스럽게 보인다 (밝은 한지에서 결이 뭉개지거나 검게 뭉치지 않음 — 비율 스케일 확인)
- [ ] **A3 돌·라인 무영향**: 같은 화면에서 흑·백 돌 스킨과 라인 색이 basic 장착 시와 동일하다 (neon 장착 시 돌이 청록으로 물리지 않는다 — Phase 1 결함의 소멸 확인)
- [ ] **A4 filter 잔류 검사**: devtools에서 `#suiji-theme-tint`에 hue-rotate/sepia/saturate/brightness가 남지 않고, neon 장착 시 `drop-shadow`만 있다
- [ ] **A5 알까기 적용**: `suiji-alkkagi.html`에서 테마 장착 → 판 텍스처가 테마색으로 렌더되고 수(돌) 쏘기·파티클·에지 음영 연출이 정상 동작한다
- [ ] **A6 기보 2D·3D**: `suiji-kifu.html`에서 2D 재생 화면과 3D 보기 토글 양쪽의 보드 면이 같은 테마 톤이다 (3D는 윗면 기준 — 옆면은 §4 제외 범위)
- [ ] **A7 polaris-common 부재 폴백**: devtools에서 `polaris-common.js` 로딩 차단 후 4페이지 로드 → 전부 엔진 기본 목재(기존 출시색)로 정상 렌더, 콘솔 에러 없음
- [ ] **A8 새로고침 소유·활성 유지**: 테마 구매·장착 후 새로고침 → 소유(`polaris.shop.v1.owned`)와 활성(`active`)이 유지되고 보드에 즉시 적용된다
- [ ] **A9 basic 복귀**: '적용 해제' 시 4페이지 모두 엔진 내장 기본 팔레트(Phase 1 이전 출시색)와 동일 외형으로 복귀한다
- [ ] **A10 로비 비적용·페이지 이동 반영**: 로비에서는 판이 없어 변화가 없고, 로비에서 테마 변경 후 게임 페이지 진입 시 첫 프레임부터 새 테마가 적용된다 (로비 HTML에서 `SuijiEngine.woodPalette` 잔류 없음)
- [ ] **A11 리사이즈 재생성**: 게임 중 창 크기 변경(또는 모바일 회전) 후에도 판이 테마 텍스처로 다시 채워진다 (리사이즈 재생성 4곳 경로)
- [ ] **A12 캐시 갱신**: sw.js `CACHE_VERSION` bump + 페이지 `?v=` 동기화 후 재배포 시, PWA 재방문에서 새 엔진이 로드된다 (구버전 캐시 서빙 없음)

---

## 6. 파일 소유 계획 (개발자 1명 — 3파일 전부 소유)

| 파일 | 변경 내용 | 예상 규모 |
|---|---|---|
| `suiji-engine.js` | `makeWoodTexture` 4번째 인자 `palette` + 전역 기본 팔레트 상태 + `setWoodPalette` export (§2 힌트). 747행·나머지 알고리즘 무수정 | +15~25행, 수정 ~10행 (646–726행 내 상수 4군데) |
| `polaris-common.js` | `THEME_DEFS`에 `wood` 필드 4종 추가 + `filter` 색변환 제거(§3). `catalog()` 반환에 `wood` 포함 1줄 | +12~16행, 수정 4행 |
| `suiji-common.js` | `THEME_PAGES` 4종 확대 + `apply()`에 팔레트 설정/해제 분기 + filter 잔류 로직(§3 훅) | +6~10행, 수정 ~8행 |
| 게임 페이지 4종 | 로직 수정 0 — `suiji-engine.js?v=16`·`suiji-common.js?v=17` 쿼리 bump만 (go/omok/alkkagi/kifu/index 5파일) | 5파일 × 2행 |
| (릴리즈) `sw.js` | 로직 수정 없이 `CACHE_VERSION` bump + PRECACHE의 engine/common URL 동기화 | 3행 |

- 인터페이스 계약은 본 문서가 단일 출처: `SuijiEngine.setWoodPalette(wood|null)`, `THEME_DEFS[n].wood = { stops, grain, knot, vignette }`, 저장 키 변경 없음(`polaris.shop.v1` 기존 스키마).
- 1인 소유이므로 PR 리뷰는 셀프 + QA 시나리오(§5) 기반 통과로 대체한다. `tests/`(math/str)는 렌더러 의존 없어 회귀 대상 아님 — 엔진 기본 출력 동일성은 A9(기본 복귀 외형)로 검증.

---

## 7. 규모 산정 (항목별 S/M)

| 항목 | 규모 | 근거 |
|---|---|---|
| 엔진 팔레트 파라미터화 (makeWoodTexture + setWoodPalette) | **M** | 알고리즘 이해 + 상수 4군데의 비율 스케일링 변환 + "기본 출력 = 기존과 동일" 회귀 검증이 무게. 로직 자체는 상수 치환 수준 |
| THEME_DEFS wood 스키마 + 테마별 초기값 튜닝 | **S** | 필드 추가는 단순. 스와치↔실보드 색 대조 튜닝 1~2회 포함해도 S |
| suiji-common 훅 전환 (4페이지 확대 + 팔레트 set/clear) | **S** | 기존 apply 골격(화이트리스트·변수 정리·가드) 유지, 분기 2개 추가 |
| 알까기 확대 적용 | **S** | 기술검증으로 페이지 수정 0행 확정 — QA(A5)만 소요 |
| 기보 2D·3D 면 적용 | **S** | 2D 무수정, 3D 윗면은 전역 팔레트 자동 — QA(A6)로 확인. 이질감 시 백로그 분리(§8) |
| 릴리즈 (캐시 버전 동기화) | **S** | ?v= 5파일 × 2행 + sw.js 3행 — 기존 배포 절차 |
| **합계** | **M** | M 1개 + S 5개. 1인 1스프린트, 외부 의존 0 |

---

## 8. 후속 조치 (본 스프린트 밖)

1. **리서치팀**: Sabaki 수집본 재수집 (README.md 0바이트 · meta.json 404 · sabaki/ 빈 디렉터리 — §0 표의 인용 공백 해소. Phase 1의 wordle-clone과 동일 수집 오류 패턴)
2. **백로그 등록**: ① 기보 3D 옆면·받침 톤의 팔레트 연동 (QA A6에서 이질감 확인 시) ② 알까기 drawEdgeShade 음영의 팔레트화 (neon에서 위화감 확인 시) ③ 게임별 개별 테마 선택 ④ 테마 프리뷰를 실보드 렌더 기반으로 승격 (스와치는 vars 기반 유지)
3. **문서**: `suiji-design.md`의 렌더러 섹션에 `setWoodPalette` 계약 1줄 추가 (구현 완료 시)
