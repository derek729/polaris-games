# 폴라리스 게임 센터 — 릴리스 노트 & 출시 가이드

## v1.2.0 (2026-09-13) — "콘텐츠 확장" 🎮

리서치→기획→승인→구현→QA 전 사이클을 거친 첫 콘텐츠 확장 릴리스.
리서치 브리프 4건(`본사 01-research/`), 기획서 4건(`docs/design/`)이 근거 문서입니다.

### 뱀파이어 키우기
- **주스 패스**: 엘리트/보스 처치·피격 히트스톱, 크리티컬 데미지 숫자 강화, 저체력 비네트
- **레벨업 개편**: 리롤(런당 2회 무료), 스킵(체력 8% 회복+골드 30), 진화 레시프 배지+이번 런 목표 스트립
- **런 종료 요약**: 총 피해량·DPS·빌드 리캡·다음 런 목표 3규칙

### 식물 vs 좀비
- **웨이브 예고**: 진행바 아래 다음 웨이브 조성 미리보기, 최종 웨이브 15초 전 경고
- **장비 파손 3단계**: 콘/버킷 손상 시각화 (스프라이트·폴백 모두)
- **신규 좀비 2종**: 화병 투척형(thrower)·질주형(runner) + 웨이브 테이블 전면 개편
- **태양 광폭**: 태양 12회 수집 = 1충전, Q키/버튼 발동 전체 버스트

### BeatCraft
- **판정 개편**: 윈도우 ±45/90/135/180ms 재조정, 얼리/레이트 오차바, 결과 빠름·늦음 통계
- **FC/PFC 라벨**: 결과 배지 + 레벨 카드 영구 마크(localStorage) + 50콤보 마일스톤 연출
- **스크롤 스피드 개조**: 1.0~4.0× — 판정·채보 무영향 렌더 전용

### 두마당 보드게임
- **수 품질 피드백**: 바둑 착수 직후 등급 칩(선수/좋은 수/아쉬운 수/실수) + 코칭 한 줄
- **기보 승부처**: 복기 그래프에 승부처 3곳 자동 마킹 + 클릭 이동
- **업적 9종**: 전 게임 공통 도전과제 (도장 페이지 스트립, localStorage)

---

## v1.0.0 (2026-09-12) — 첫 통합 출시 🚀

주식회사 폴라리스 소프트웨어개발팀(팀장: 김팀장, AI 멀티에이전트 조직)의 첫 통합 릴리스.

### 수록 게임 (7종)
| 게임 | 장르 | 이번 릴리스 포인트 |
|---|---|---|
| 뱀파이어 키우기 | 뱀서라이크 생존 액션 | AI 생성 몬스터·아이템 스프라이트 15종, SFX·BGM 탑재 |
| 식물 vs 좀비 | 타워 디펜스 | AI 생성 식물·좀비 스프라이트 10종, SFX 탑재 |
| BeatCraft (DDR 에디션) | 리듬 게임 | 노트 젬·퍼펙트 스타 스프라이트 적용 |
| 두마당 바둑 | 보드 | AI 생성 픽셀아트 흑백돌 스킨, 착수음 |
| 두마당 오목 / 알까기 / 기보 | 보드 | 공유 엔진 스프라이트·사운드 적용 |

### 새로 추가된 인프라
- **통합 포털** `index.html` — 전체 게임 허브 (게임 스프라이트 썸네일 사용)
- **PWA 확장** — `manifest.webmanifest`가 7종 전체를 커버 (바로가기 7개), `sw.js` v17이
  신규 게임 파일 + AI 생성 에셋(스프라이트/SFX/BGM)까지 프리캐시 → **오프라인 실행 지원**
- **AI 에셋 파이프라인** — 로컬 ComfyUI(SDXL + pixel-art-xl LoRA) 스프라이트 생성,
  절차적 SFX 합성기, MusicGen BGM 생성기 (`game-assets/` 33종)
- 조직/프로세스 문서: `TEAM-STRUCTURE.md` (스프린트 로그 포함)

### 설치·실행
정적 호스팅 또는 `node server.cjs` 후 접속. 포털에서 PWA 설치 가능.

---

## 두마당 — 앱 출시 가이드 (기존 문서)

이 스위트는 **PWA(프로그레시브 웹 앱)**로 완성되어 있습니다.
호스팅만 하면 안드로이드 · 아이폰 · 데스크톱(Windows/macOS/ChromeOS)에
"앱"으로 설치되고, 오프라인에서도 실행됩니다.

**온라인 대전(유저 간 대국)**은 함께 제공되는 Node 서버(`server.cjs`)가 필요합니다 —
정적 호스팅만으로는 AI 대국/로컬 대전만 가능합니다 (아래 4장 참고).

## 포함된 PWA 구성 요소

| 파일 | 역할 |
|---|---|
| `manifest.webmanifest` | 앱 이름·아이콘·색상·시작 화면 정의 (앱 바로가기 4개 포함) |
| `sw.js` | 서비스 워커 — 전체 게임 파일을 캐시해 **오프라인 실행** 지원 |
| `icons/` | 192/512px·마스커블·iOS(apple-touch) 아이콘 |
| 각 페이지 `<head>` | 설치 메타태그·테마 색상·세이프 에어리어 대응 |
| `suiji-index.html` | "앱으로 설치" 버튼 (iOS는 홈 화면 추가 안내) |
| `server.cjs` | 게임 호스팅 + 온라인 대전 릴레이 (Node + ws) |
| `suiji-net.js` | 온라인 매칭 클라이언트 (방 코드·초대 링크·동기화) |

---

## 0단계 · 로컬에서 온라인 대전 실행

```bash
npm install ws      # 최초 1회
node server.cjs     # PORT 환경변수로 포트 변경 가능 (기본 8787)
```

`http://localhost:8787` 접속 → 바둑·오목·알까기 페이지에서
**Online** 모드 → "방 만들기" → 생성된 4자리 코드 또는 초대 링크를 친구에게 전달 → 친구가 참가하면 대국 시작.

- 바둑: 수순·패스·항복·집계(죽은 돌 표시)까지 양쪽 동기화, 집계 확정은 양측 동의
- 오목: 실시간 수순 동기화 + 재대국(색 교체)
- 알까기: 발사 스냅샷 동기화 + 슛터 권위 결과로 턴 정산, 차례 넘기기 지원

---

## 1단계 · 호스팅 (5분)

PWA는 **HTTPS 주소**가 필요합니다. 아래 중 하나를 고르세요.

### 방법 A — Netlify Drop (가장 빠름, 무료)
1. <https://app.netlify.com/drop> 접속 (무료 계정 가입)
2. 작업 폴더의 파일 전부(8개 + `icons/` 폴더)를 **드래그 앤 드롭**
3. 발급된 주소(`https://xxxx.netlify.app`)로 접속 → 끝

### 방법 B — GitHub Pages (무료)
```bash
git init && git add -A && git commit -m "두마당 release"
git branch -M main
git remote add origin https://github.com/<계정>/dumadang.git
git push -u origin main
```
→ 저장소 Settings → Pages → Source: `main` 브랜치 선택
→ `https://<계정>.github.io/suiji-dojo/` 에서 실행

### 방법 C — Vercel / Cloudflare Pages
두 서비스 모두 폴더를 통째로 업로드하면 바로 HTTPS 주소가 나옵니다.

> **유의**: 위 세 방식은 정적 호스팅이라 **온라인 대전 릴레이가 동작하지 않습니다**
> (AI 대국·로컬 2인·PWA 설치는 모두 정상). 유저 간 온라인 대전까지 열려면
> 아래 **4단계 · 온라인 대전 서버 배포**를 진행하세요.

### 방법 D — Node 서버로 통배포 (정적 + 온라인 대전 동시 지원, 권장)
Render / Railway / Fly.io / 자체 VPS 등 Node 런타임에 이 폴더를 올리고:

```bash
npm install ws
PORT=80 node server.cjs     # 정적 호스팅 + WebSocket 릴레이를 같은 포트에서 제공
```

HTTPS가 필요하므로 Render/Railway처럼 인증서를 자동 발급해 주는 플랫폼을 권장합니다.
배포 주소 하나로 PWA 설치와 온라인 대전이 모두 동작합니다.

---

## 2단계 · 기기에 앱으로 설치

호스팅 주소를 휴대폰/PC 브라우저로 열면:

| 플랫폼 | 설치 방법 |
|---|---|
| **Android (Chrome)** | 하단 "앱으로 설치" 버튼 클릭 → 설치 확인 |
| **iPhone / iPad (Safari)** | 공유 버튼(⬆️) → **홈 화면에 추가** |
| **Windows / mac (Chrome·Edge)** | 주소창 오른쪽 설치(＋) 아이콘 또는 "앱으로 설치" 버튼 |

설치하면 독립 창(주소창 없음)·홈 화면 아이콘·오프라인 실행이 모두 활성화됩니다.

---

## 3단계 · 스토어 출시 (선택)

호스팅 URL이 있으면 **PWABuilder**(<https://www.pwabuilder.com>)에 넣어
스토어용 패키지를 무료로 생성할 수 있습니다.

- **Google Play**: Android App Bundle(.aab) 생성 → Play Console 업로드
  (Play Console 개발자 계정 등록비 $25 필요)
- **Microsoft Store**: Windows 패키지(.msix) 생성 → Partner Center 제출
- **App Store**: PWABuilder의 iOS 패키지는 Xcode 빌드가 필요해 진입 장벽이 있으니,
  iOS는 2단계의 "홈 화면 추가" 경로를 권장

---

## 4단계 · 온라인 대전 서버 배포 (세부)

- **필수 파일**: `server.cjs`, `package.json`(ws 의존성), 게임 파일 전부
- **환경변수**: `PORT` (기본 8787)
- **동작 방식**: 서버가 정적 파일과 WebSocket 릴레이를 **같은 포트**로 제공하므로
  별도 CORS/프록시 설정이 필요 없습니다
- **방 코드**: 4자리(혼동 문자 제외) — 게임 내 "방 만들기"로 생성, 초대 링크는
  `https://주소/게임페이지.html?room=코드` 형태로 복사됩니다
- **동시 접속**: 방당 2명(흑/백), 방은 마지막 유저가 나가면 자동 소멸
- 헬스체크용 ping/pong 내장 — 플랫폼 유휴 종료 방지에 도움이 됩니다

---

## (대안) 데스크톱 네이티브 앱 — Electron

브라우저 없이 실행되는 Windows/macOS/Linux 앱이 필요하면:

```bash
npm init -y
npm install --save-dev electron electron-packager
```

`main.js` 파일 생성:
```js
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1400, height: 950, autoHideMenuBar: true });
  win.loadFile('suiji-index.html');
});
```

`package.json`에 추가:
```json
"main": "main.js",
"scripts": { "start": "electron .", "package": "electron-packager . DuMadang --platform=win32,darwin,linux --out=dist" }
```

```bash
npm start      # 실행 테스트
npm run package  # dist/ 에 각 OS 실행 파일 생성
```

---

## 유지보수 노트

- 게임 파일을 수정했으면 **`sw.js`의 `CACHE_VERSION`을 `suiji-v6` 등으로 올려야**
  방문자가 갱신된 버전을 받습니다.
- 로컬 테스트는 `node server.cjs` 하나로 충분합니다 (정적 + 온라인 동시 지원).
  서비스 워커는 HTTPS/localhost에서만 등록됩니다 — 파일 직접 열기로도
  게임 자체는 그대로 작동합니다 (온라인 대전 제외).
- 전적·기보 라이브러리는 기기의 localStorage에 저장되며 서버 전송은 없습니다.
- 온라인 대전 서버는 게임 상태를 저장하지 않습니다 (릴레이만 수행 — 개인정보 없음).
