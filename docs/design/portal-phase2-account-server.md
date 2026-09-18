# 포털 Phase 2 — 계정 서버 + 클라우드 주간 리더보드 기획서

- 작성: 기획팀 · 2026-09-18 (김실장 승인 — Railway 유료 사용 중, 사장님 상용화 승인)
- 대상: `server.cjs` (두마당 서버 v2, 338행 — Node + ws WebSocket) · `package.json` · 신규 배포 구성 파일
- 근거:
  - 사업기획서 `/mnt/data/work/polaris/02-planning/포털통합-사업기획서-v1.md` §3 Phase 2 —
    "server.cjs를 회원·전적 클라우드로 확장, 온라인 대전 랭크 시즌제, 친구 대국 링크 공유"
  - BACKLOG **#28 [L][기능] 포털 Phase 2: 계정 서버 + 클라우드 주간 리더보드** — "lila 단일 API 철학 참고"
  - **사장님 승인 획득 (2026-09-18 사용자 메시지)**: Railway 유료 플랜을 이미 사용 중 — POLICY §3-1
    "외부 유료 서비스 가입·결제" 게이트 해소. 단, §5 수익화는 Phase 3으로 계속 보류
    (이번 스코프는 **계정 + 클라우드 전적 + 주간 리더보드** 3가지뿐)
- 스프린트 규모: **L + L** → POLICY §2 게이트("규모 L 단독 또는 L+L 이상 → 2사이클 분할")에 따라
  **사이클 A(이번, 서버 구현·L) + 사이클 B(다음, 배포·연동·L)** 로 분할 (§9)

---

## 0. 기술 검증 (선행 조사 기록 — 착수 전 수행 완료)

| # | 조사 대상 | 결과 (설계 반영) |
|---|---|---|
| 1 | `server.cjs` 전체 (338행) | `http.createServer` 한 대로 ① 정적 파일 서빙(MIME 테이블, path traversal 가드) ② `new WebSocketServer({ server })` — **같은 포트에서 WS 릴레이**. PORT는 `process.env.PORT \|\| 8787`. → HTTP API는 이 핸들러 **앞단에 `/api/*` 분기 1개 추가**로 충분하며, WS 구현과 정적 서빙은 1줄도 건드리지 않는다(§2 제약 1). 주의: `ws`가 node_modules에는 있지만 `package.json`에 의존성 **미등록** — 로컬 우연 성공 상태이므로 배포 준비물에 의존성 등록이 필수(§8-3) |
| 2 | ao01 Railway 배포 선례 (`/mnt/data/work/ao01/`) | 참고한 것: `railway.toml`의 `healthcheckPath="/api/health"` + Variables 탭 주석 문서화 패턴, `CORS_ORIGIN` 콤마 화이트리스트 패턴, Dockerfile의 `PORT` env 수용. **코드 복사 금지 준수** — ao01은 실돈 시스템(POLICY §3-6)이므로 배포 구성 뼈대만 참고. 반대로 배울 점: `NEXTAUTH_SECRET` 실값이 railway.toml에 하드코딩된 것은 **나쁜 선례** — 본 프로젝트는 시크릿을 저장소에 두지 않고 Railway Variables에만 등록(§8-4) |
| 3 | `polaris-common.js` 클라우드 연동 지점 | `P.settle`이 유일한 수집점이고 `emit('weekly', P.weekly.record(game, outcome, delta, expGain))`으로 주간 성적표를 1곳서만 집계 — **클라우드 업로드 훅은 이 emit 직후 1줄 지점이면 끝난다**(사이클 B). `P.weekly` 스키마 `{weekStart, plays, games{w,l,d}, coinsEarned, coinsSpent, exp}`를 서버 버킷이 그대로 승격. `weekStartISO`는 **기기 로컬** 월요일 기준 — 서버는 KST 고정으로 단일화해야 함(§5-2). 닉네임 상한 12자(`setName`)를 계정 규칙과 일치시킴(§3-2) |
| 4 | fetch origin·CORS·폴백 | GitHub Pages(https) → Railway(https) 호출은 교차 origin — `Content-Type: application/json` POST는 **프리플라이트(OPTIONS) 발생**하므로 서버가 OPTIONS를 답해야 함(§8-2). `file://` 로컬은 Origin이 `null` → 서버가 거부하고, 클라이언트는 localStorage 폴백(기존 동작 그대로). 발견 사항: `suiji-net.js:34`가 온라인 대전 WS를 `location.host + '/ws'`로 접속 — 즉 **온라인 대전은 지금도 "서버 origin에서 서빙되는 페이지"에서만 동작**. Railway 배포 후 서버가 정적 서빙을 유지하면 온라인 대전이 자동으로 Railway에서 살아나고, Pages 포털은 API만 호출하는 이중 구조가 된다(§2 제약 4) |

### 참고 프로젝트에서 배운 점 (Phase 1 기획서 인용의 이행)

| 프로젝트 | 수집본 | 이행 설계에의 반영 |
|---|---|---|
| **lichess** (lichess-org/lila, AGPL-3.0) | `/mnt/data/work/polaris/01-research/references/랭킹시스템/lila/README.md` | 수집본 README의 두 사실 — ① "MongoDB에 120억 게임을 저장" ② 하단 "HTTP API — 애플리케이션과 웹사이트에서 자유롭게 사용하세요". Phase 1 기획서가 말한 **lichess 주간 리더보드의 전제 = "집계 원본이 서버 한 곳에 모여 있다"** 는 것이고, 본 문서는 그 철학의 이행이다: 원본 기록을 `POST /api/matches` **한 곳에서만** 받고, 조회는 `GET /api/leaderboard/weekly` **하나로만** 노출한다. 반면 lila는 WS를 별도 서버(lila-ws)+Redis로 분리했지만 우리는 1인 개발·캐주얼 트래픽이므로 **반대로 단일 프로세스 유지**가 정답 — WS 대전(상태는 메모리, 재시작 시 방 소멸을 이미 허용)과 계정/전적(영속 파일)의 성격 차이만 파일 레이어로 흡수한다 |
| **cards-game-server** (수집본, 멀티게임서버) | `/mnt/data/work/polaris/01-research/references/멀티게임서버/cards-game-server/README.md` | README 특징 목록의 "Server-authoritative multiplayer game record persistence" — 전적의 권위를 서버가 갖는 패턴. 우리 v1은 그 **최소판**으로, 권위를 통계 집계에만 국한한다: 도토리 지갑 권한은 끝까지 클라이언트에 두고(§5-4), 서버는 "받은 기록의 합계"만 쌓는다 |

---

## 1. 목표와 비목표

**목표 (사이클 A)** — Railway 배포 가능한 상태의 계정·전적·리더보드 API를 server.cjs에 추가한다.

1. 무이메일 계정: 닉네임 + 비밀번호 → 토큰 발급
2. 판 종료 전적 업로드(토큰 인증) → 서버 측 주간 버킷 집계
3. 주간 리더보드 조회(상위 N + 내 순위)
4. Railway 배포 준비물(railway.json + 의존성 + 환경변수 문서) 완비

**비목표 (이번에 안 함)**

- 수익화 전부(사업기획서 §5 — Phase 3, 사장님 승인 별도)
- 서버가 도토리 지갑·상점 소유권을 관리하는 것 (§5-4)
- 온라인 대전 랭크 시즌제·친구 대국 링크 공유 (사업기획서 Phase 2 후반부 — 사이클 B 이후 백로그)
- 친구·채팅·이메일 찾기·비밀번호 찾기 (무이메일 v1 — 비번 분실 시 계정 재생성이 공식 절차)

---

## 2. 하드 제약 (전 항목 공통)

1. **기존 WebSocket 프로토콜 무수정** — `create/join/init/move/sync/msg/rematch/reset/leave` 메시지와
   릴레이·검증·시계 로직은 1줄도 바꾸지 않는다. HTTP API는 `http.createServer` 핸들러에서
   `urlPath.startsWith('/api/')` 분기를 **정적 서빙보다 먼저** 실행하는 추가만 허용.
2. **같은 포트 공존** — 정적 서빙 + WS + HTTP API가 단일 `server.listen(PORT)`. Railway는 PORT env만 주입하면 된다.
3. **무DB v1** — Railway 볼륨에 마운트한 JSON 파일만 사용(§7). 외부 DB 서비스 추가 금지(승인 대상 회피).
4. **이중 origin 전략 유지** — GitHub Pages 포털 = 정적 게임 + API 클라이언트. Railway 서버 = API + WS + 정적 서빙
   (온라인 대전은 서버 origin에서). 어느 쪽에서 열어도 게임은 동작하되, file://는 클라우드 비활성 + localStorage 폴백.
5. **시크릿 하드코딩 금지** — `AUTH_SALT` 등 모든 시크릿은 Railway Variables에만. 저장소에는 `.env.example` 자리표시만
   (ao01의 시크릿 하드코딩은 재발 금지 — §0-2).
6. **파일 소유** — 사이클 A는 `server.cjs` + `package.json` + 신규 배포 구성 파일만 손대고,
   `polaris-common.js`·`index.html`·`sw.js`·게임 HTML은 **수정 금지**(사이클 B 소유 — §9). Phase 1의
   "기존 저장 키 스키마 불변" 원칙도 동일하게 유지.

---

## 3. 계정 v1 명세 (규모: M)

### 3-1. 무이메일 가입

- 가입 필드: **닉네임 + 비밀번호** 2개뿐. 이메일·전화·소셜 로그인 없음 (개인정보 수집 최소화 — POLICY §3-5 리스크 회피).
- 닉네임: trim 후 **2~12자** (기존 `P.profile.setName`의 12자 상한과 일치), 제어문자 금지,
  **전체 유니크** (리더보드 표시명이 곧 식별자 — 대소문자/공백 차이만 다른 중복도 거부, 비교는 `nameLower`).
- 비밀번호: **6~128자**. 무이메일 캐주얼 계정의 부담을 낮추되 하한은 둠. 유출 피해 상한이
  코스메틱·전적 통계 수준임을 감안한 균형점.

### 3-2. 비밀번호 저장 — scrypt

Node 내장 `crypto.scryptSync` (매개변수 기본: N=16384, r=8, p=1, keylen=64). 계정당 솔트 16바이트 랜덤.
저장 형식(단일 문자열 — 파일 내 평문 비번이 절대 존재하지 않음을 QA로 검증 가능하게):

```
scrypt$16384$8$1$<saltHex>$<hashHex>
```

추가로 `AUTH_SALT`(서버 전역 페퍼, 32바이트 hex — Railway Variables)를 비밀번호에 혼입해
볼륨 파일 유출만으로는 오프라인 크랙이 불가능하게 한다: `scryptSync(password + pepper, salt, 64)`.

### 3-3. 토큰 — 30일 만료 (권안)

- 발급: `crypto.randomBytes(32).toString('hex')` — 클라이언트에 원문 1회만 전달.
- 저장: **sha256(토큰) 해시만** 저장 (`tokens.json` — 파일 유출 시 재사용 불가).
- **30일 만료를 권고한다** (무기한 토큰 대비). 근거: ① 무기한 토큰은 유출 시 회수 수단이 만료뿐인데
  만료가 없으면 영구 유출 — 30일이면 최악의 피해 기간이 한정된다 ② 캐주얼 포털에서 월 1회 재로그인은 수용 가능한
  빈도 ③ 구현이 만료 타임스탬프 1필드 추가뿐으로 공짜에 가깝다. 클라이언트는 토큰을 `localStorage`에 저장하고
  401(EXPIRED) 수신 시 재로그인 유도(사이클 B UI).
- 동시 세션: 계정당 최대 3개(멀티기기). 4번째 로그인 시 가장 오래된 토큰 자동 폐기.
- 만료 청소: 서버 기동 시 + 주간 롤오버 시점(§5-3)에 일괄 삭제.
- 전달: `Authorization: Bearer <token>` 헤더 단일 방식 (쿼리스트링 토큰 금지 — 로그 남는 경로 차단).

---

## 4. API 명세

공통 규칙:

- 본문/응답은 모두 `application/json; charset=utf-8`. 성공 응답에 `ok: true` 포함.
- 인증이 필요한 엔드포인트는 `Authorization: Bearer` 헤더. 부재·불일치 → `401 AUTH_REQUIRED`,
  만료 → `401 TOKEN_EXPIRED` (클라이언트가 재로그인 분기할 수 있게 에러 코드 분리).
- 라우팅은 `switch` 1개의 순수 함수로 `handleApi(req, res)` — 정적 서빙/WS와 완전 분리.

### 4-1. 엔드포인트 일람

| 메서드/경로 | 인증 | 용도 |
|---|---|---|
| `GET /api/health` | — | 헬스체크 (Railway 배포 게이트) |
| `POST /api/auth/register` | — | 회원가입 + 토큰 즉시 발급 |
| `POST /api/auth/login` | — | 로그인 + 토큰 발급 |
| `POST /api/auth/logout` | ○ | 토큰 폐기 |
| `GET /api/me` | ○ | 내 프로필 + 누적 전적 요약 |
| `POST /api/matches` | ○ | 판 종료 전적 업로드 (주간 버킷 집계) |
| `GET /api/leaderboard/weekly` | (○) | 주간 리더보드 — 토큰 있으면 `me` 추가 |

### 4-2. `GET /api/health`

```jsonc
// 200
{ "ok": true, "service": "dumadang", "version": "2.1.0", "uptimeSec": 3600, "accounts": 42 }
```

DB 접속 등 의존성이 없으므로 프로세스 생존 여부만 보고. Railway `healthcheckPath`로 사용(§8-1).

### 4-3. `POST /api/auth/register`

```jsonc
// 요청
{ "name": "은하기사", "password": "dotori99" }
// 201 — 가입과 동시에 로그인 상태로 시작 (캐주얼 플로우: 가입 후 별도 로그인 단계 없음)
{
  "ok": true,
  "token": "a1b2...64hex",
  "expiresInDays": 30,
  "account": { "id": "u_8f3a", "name": "은하기사", "level": 1, "expTotal": 0, "matchesTotal": 0 }
}
```

에러: `400 FIELD_INVALID`(닉네임 길이/문자, 비번 길이 — `field` 필드로 원인 표시) · `409 NAME_TAKEN` · `429 RATE_LIMITED`

### 4-4. `POST /api/auth/login`

```jsonc
// 요청: register와 동일 필드
// 200
{ "ok": true, "token": "...", "expiresInDays": 30,
  "account": { "id": "u_8f3a", "name": "은하기사", "level": 7, "expTotal": 3120, "matchesTotal": 118 } }
```

에러: `401 AUTH_FAILED` (닉네임 부재와 비번 불일치를 **같은 코드로** 응답 — 계정 존재 여부 탐지 방지) · `429`

### 4-5. `POST /api/auth/logout` — 200 `{ "ok": true }`. 해당 토큰 즉시 무효.

### 4-6. `GET /api/me` — 200 `{ "ok": true, "account": {...}, "weekly": <서버 버킷 요약, §5-2 스키마> }`

### 4-7. `POST /api/matches` — 전적 업로드 (§5 상세 규칙)

```jsonc
// 요청 — 클라이언트 settle 결과 그대로 (P.weekly 스키마의 단판 단위)
{ "game": "go", "outcome": "w", "delta": 50, "exp": 25 }
// 201
{ "ok": true, "weekly": { "weekStart": "2026-09-14", "plays": 12, "exp": 260, ... }, "matchesTotal": 119 }
```

- 1요청 = 1판. 배치 업로드 금지(배열 허용 안 함 — 부정 시 단위가 판 단위로 묶이는 이득 차단).
- 서버 수신 시각(KST)으로 주간 버킷 배정 — 클라이언트 타임스탬프를 받지 않음(시계 조작 무의미화).
- 에러: `401` · `400 FIELD_INVALID` (§5-1 검증표) · `429 RATE_LIMITED`

### 4-8. `GET /api/leaderboard/weekly`

쿼리: `week=YYYY-MM-DD`(생략 시 현재 주) · `game=`(생략 시 전체 합산) · `limit=1~100`(기본 20)

```jsonc
// 200 — 토큰 없이도 조회 가능(공개 — Pages 비로그인 방문자용), 토큰 있으면 me 추가
{
  "ok": true,
  "weekStart": "2026-09-14",
  "metric": "exp",
  "entries": [
    { "rank": 1, "name": "새벽항해사", "level": 9, "plays": 40, "wins": 28, "exp": 910, "coinsEarned": 1400 },
    { "rank": 2, "name": "별빛장인", "level": 7, "plays": 31, "wins": 20, "exp": 705, "coinsEarned": 1150 }
    // ... 최대 limit개
  ],
  "me": { "rank": 57, "name": "은하기사", "plays": 12, "wins": 7, "exp": 260, "coinsEarned": 350 }  // 토큰 시에만
}
```

- 정렬: `exp` 내림차순 → 동점 시 `wins` 내림차순 → 동점 시 `coinsEarned` 내림차순 → 동점 시 가입 순.
  기준 지표를 `exp`로 한 근거: 도토리 수급은 승리 판돈(+50)·출석(+100)·미션이 섞여 "판 실력"과 상관이 낮고,
  exp는 승 25/무 12/패 8로 **플레이 기여도**를 반영 — 리더보드가 "열심히 둔 사람"을 가려낸다. 랭크 시즌제(이후)에서
  대전 승률 지표로 교체할 자리임을 `metric` 필드로 명시해 둔다.
- 과거 주 조회 지원 — `weekly/{weekStart}.json` 파일이 남아 있는 범위에서 가능 (시즌 아카이브의 씨앗).
- 존재하지 않는 주 → `404 WEEK_NOT_FOUND`. `level`은 서버가 expTotal에서 Phase 1과 동일 규칙
  (`expForNext = 100 + 50*(L-1)`)으로 계산 — 클라이언트 `P.level.info()`와 숫자가 일치해야 한다(AC-8).

### 4-9. 에러 코드 총표

| HTTP | 코드 | 상황 |
|---|---|---|
| 400 | `BAD_JSON` | 본문 파싱 실패 |
| 400 | `FIELD_INVALID` | 필드 검증 실패 (응답에 `field`, `reason` 동봉) |
| 401 | `AUTH_REQUIRED` | 토큰 헤더 없음/형식 불량 |
| 401 | `TOKEN_EXPIRED` | 30일 경과 (클라이언트 재로그인 트리거) |
| 401 | `AUTH_FAILED` | 로그인 실패 (닉네임/비번 구분 없음) |
| 403 | `FORBIDDEN_ORIGIN` | CORS 화이트리스트 외 Origin (file:// `null` 포함) |
| 404 | `NOT_FOUND` / `WEEK_NOT_FOUND` | 미정의 경로 / 존재하지 않는 주 |
| 409 | `NAME_TAKEN` | 닉네임 중복 |
| 413 | `PAYLOAD_TOO_LARGE` | 본문 16KB 초과 |
| 429 | `RATE_LIMITED` | §5-5 제한 초과 |
| 500 | `INTERNAL` | 그 외 (스택 미노출, 콘솔 로그만) |

---

## 5. 전적 업로드와 주간 집계 (규모: M)

### 5-1. 서버 측 필드 검증 (부정 방지 v1 최소선)

| 필드 | 규칙 | 거부 시 |
|---|---|---|
| `game` | 화이트리스트 `["go","omok","alkkagi","kifu","beatcraft","vampire","pvz","gostop"]` — suiji 4종(`Suiji.stats.record` → `Polaris.settle` 경로) + Phase 1 포털 게임 4종. 상수 1곳 정의 | 400 |
| `outcome` | `"w" \| "l" \| "d"` | 400 |
| `delta` | 정수, 절댓값 ≤ 1000 (현재 판돈 STAKE=50 — 상한은 향후 판돈 인상 여유분) | 400 |
| `exp` | 정수, 0 ≤ exp ≤ 100 (현재 settle 최대 25 — 상한 여유) | 400 |

### 5-2. 주간 버킷 — KST 월요일 시작, 원본은 서버 한 곳

- 클라이언트 `weekStartISO`는 기기 로컬 기준(해외 접속 시 주가 어긋남) → **서버가 UTC+9 고정으로
  월요일 00:00을 주 시작으로 계산**해 버킷을 배정한다. 타깃층이 한국이고, "집계 원본이 서버 한 곳"이라는
  lila 철학(§0 인용)의 귀결 — 주의 정의는 클라이언트가 아니라 원본 보관자가 갖는다.
- 파일: `DATA_DIR/weekly/{weekStart}.json`

```jsonc
{
  "weekStart": "2026-09-14",
  "players": {
    "u_8f3a": { "name": "은하기사", "plays": 12, "w": 7, "l": 4, "d": 1,
                "coinsEarned": 350, "coinsSpent": 0, "exp": 260 }
  }
}
```

- `P.weekly` 스키마의 서버 승격 — Phase 1이 "Phase 2에 스키마 그대로 승격"이라고 예약해 둔 그대로.
  업로드 1건마다 누적 합산만 하고, 기존 기록 재전송(중복 POST)은 합산된다(§5-6).

### 5-3. 주간 롤오버

- 업로드/조회 시점에 현재 주 시작일을 계산해 파일명으로 자연 분할 — 롤오버 배치 작업이 필요 없다.
- 롤오버 시점(주 전환 후 첫 접근)에: 지난 주 파일을 `DATA_DIR/backups/`로 사본 1장 + 토큰 만료 일괄 청소.
- 지난 주 파일은 삭제하지 않고 조회 가능 상태로 유지 — 과거 주 리더보드(§4-8)가 곧 시즌 아카이브의 기반.

### 5-4. 화폐 권한 경계 (핵심 설계 결정)

**서버는 도토리 지갑의 권한을 갖지 않는다.** 클라이언트가 보낸 `delta`는 통계 합산에만 쓰이고,
서버가 지급·차감·상점 결제에 사용하지 않는다. 도토리 잔액·상점 소유권은 Phase 1대로
로컬 localStorage가 유일한 원본 — 서버의 `coinsEarned`는 **미러(참고 통계)** 다.

- 근거: ① 서버가 화폐를 갖는 순간 "서버 부정 업로드로 지갑 탈취" 공격면이 생기고, 이를 막으려면
  판 검증 서버 권위화(대전 서버 재구축급 공사)가 필요해 v1 스코프를 넘는다 ② 현재 화폐 소비처인
  코스메틱 상점은 로컬 소유로 충분하다(사업기획서 §5 "코스메틱 한정" 원칙) ③ 카드게임서버 수집본의
  "서버 권위 전적 저장"은 전적 통계에만 이식한다(§0 인용).
- 귀결: 리더보드 부정의 최대 피해 = "리더보드 순위 오염". v1에서 이를 수용 가능하게 하는 완화는 §5-5·§5-6.

### 5-5. 레이트 리미트 (메모리 카운터, v1)

- 계정당: 분 60회 / IP당: 분 120회 — 초과 시 `429`. in-memory Map, 재기동 시 리즈(허용 — 완화 목적이 차단이 아니라 폭주 방지).
- 온라인 대전 판은 최소 수십 초이므로 60판/분은 자연 플레이로 불가능한 수치.

### 5-6. 알려진 한계 (정직한 기록 — Phase 3 과제)

- `delta`·`exp`의 진위는 클라이언트를 신뢰(서버가 판을 검증하지 않음) → 조작 가능. 완화는 토큰+화이트리스트+상한+레이트리미트 뿐.
- 멱등키 없음 — 클라이언트 재시도 1회 허용 시 중복 합산 가능(통계 미러이므로 피해는 지표 오차 수준).
  대전 서버가 종료 결과를 서버에서 직접 기록하게 되는 시점(랭크 시즌제)에 근본 해결 — §10 사이클 B 이후 백로그.

---

## 6. 기존 WebSocket 대전과의 공존 (규모: S)

- 수정 0: `WebSocketServer({ server })`, 방 코드·착수 검증·시계·스냅샷 로직 전부 무수정.
- HTTP 핸들러 선두에 분기 1개 추가 — `/api/*`는 정적 서빙 경로와 절대 충돌하지 않는다
  (기존 정적 파일 중 `/api/`로 시작하는 파일 없음 — 확인 완료).
- 부수 효과 정리: Railway 배포 후 `location.host` 기반 WS(`suiji-net.js`)가 Railway를 가리키게 되면
  온라인 대전이 별도 설정 없이 Railway에서 동작한다. 이때 WS는 Origin 검증을 두지 않는다(v1 — 게임 릴레이는
  비영속 데이터라 도청·남용 피해가 낮고, 검증 추가는 사이클 B 백로그로 기록).

---

## 7. 데이터 저장과 백업 (규모: M)

### 7-1. 레이아웃 (Railway 볼륨 마운트 지점 = `DATA_DIR`)

```
DATA_DIR/
  accounts.json        // [{ id, name, nameLower, passHash, createdAt, expTotal, matchesTotal }]
  tokens.json          // [{ hash, accountId, createdAt, expiresAt }] — sha256 해시만 저장
  weekly/2026-09-14.json   // 주 단위 버킷 (§5-2)
  backups/             // 롤오버 시 지난 주 스냅샷 + 기동 시 accounts/tokens 사본 (아래)
```

- `id`: `u_` + 4바이트 hex (내부 식별자 — 리더보드에는 노출 안 함).
- 쓰기 원자성: **임시 파일 write 후 `renameSync`** — 전원 차단 중에도 파일이 반쪽이 되지 않는다.
  Node 단일 스레드 이벤트 루프에서 동기 쓰기이므로 별도 파일 잠금은 불필요(v1 캐주얼 트래픽 규모).

### 7-2. 백업 전략 (명시 계약)

1. **주 단위 파일 분할** — 단일 파일 파손 시 피해가 "그 주"로 국소화 (accounts.json 제외 — 최중요 파일).
2. **자동 사본**: ① 기동 시마다 `backups/accounts.{ts}.json`, `backups/tokens.{ts}.json` 1장
   ② 주간 롤오버 시 `backups/weekly/{weekStart}.json` 1장. 각 종류 최근 **4세대**만 보관(초과분 자동 삭제).
3. **수동 덤프(사이클 B)**: Railway 볼륨 스냅샷 + 주 1회 덤프 파일 로컬 다운로드 절차를 운영 문서로 기록.
   백업 **삭제**는 POLICY §3-3(데이터 파기·백업 삭제) 승인 대상 — 운영 문서에 명기.
4. 복구 리허설은 v1 생략(백업 존재 확인만 QA) — 사이클 B 실배포 후 1회 수행 과제로 기록.

---

## 8. Railway 배포 구성 (규모: S)

### 8-1. `railway.json` (신규)

```jsonc
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },            // 의존성 ws 1개 — Dockerfile 불필요
  "deploy": {
    "startCommand": "node server.cjs",
    "healthcheckPath": "/api/health",             // ao01 선례 패턴 (§0-2)
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "numReplicas": 1                              // JSON 파일 저장소이므로 단일 레플리카 필수 (§7과 짝)
  }
}
```

### 8-2. CORS (같은 HTTP 핸들러에서 처리)

- `CORS_ORIGIN` env: 허용 origin 콤마 목록 (GitHub Pages origin + Railway 자기 origin).
  응답 헤더: `Access-Control-Allow-Origin: <매칭된 origin 1개>`(미매칭 시 헤더 없음) +
  `Access-Control-Allow-Methods: GET, POST, OPTIONS` + `Access-Control-Allow-Headers: Content-Type, Authorization` +
  `Access-Control-Max-Age: 86400` (프리플라이트 캐시 — 매 판마다 OPTIONS 폭주 방지).
- `OPTIONS /api/*` → `204` 즉답 (본문 없음).
- Origin 없음(같은 origin/curl/서버 자체 서빙 페이지) → 통과. `Origin: null`(file://) → `403 FORBIDDEN_ORIGIN`
  — 클라이언트 폴백(로컬 localStorage만)과 짝을 이루는 서버 측 문.

### 8-3. `package.json` 갱신 (사이클 A 필수)

- `"dependencies": { "ws": "^8.0.0" }` — 현재 node_modules에만 있고 매니페스트에 없는 우연 상태 해소 (§0-1).
  Nixpacks는 이 의존성 1개로 `npm install` → 빌드 성공. 기존 `"type": "module"`은 유지
  (server.cjs는 `.cjs` 확장자로 CommonJS — 충돌 없음, 이미 검증된 조합).
- `"engines": { "node": ">=20" }` + `"start": "node server.cjs"` 추가.

### 8-4. 환경변수 (시크릿은 저장소 금지 — `.env.example`에 자리표시만)

| 변수 | 기본값 | 용도 |
|---|---|---|
| `PORT` | 8787 (Railway 자동 주입) | 서버 포트 — 기존 로직 그대로 |
| `DATA_DIR` | `./data` | 볼륨 마운트 지점 (Railway: `/data`) |
| `AUTH_SALT` | 없음 — **필수, 기동 시 부재면 강제 종료** | scrypt 페퍼 (32바이트 hex, Railway Variables에만) |
| `CORS_ORIGIN` | GitHub Pages origin | §8-2 화이트리스트 |
| `TOKEN_TTL_DAYS` | 30 | §3-3 |
| `WEEKLY_TZ_OFFSET_MIN` | 540 (UTC+9) | §5-2 주 시작 계산 |

---

## 9. 파일 소유 계획 (개발자 1인 전부 소유 — 충돌 원천 없음)

| 파일 | 사이클 A | 사이클 B | 비고 |
|---|---|---|---|
| `server.cjs` | **수정** — `handleApi` 추가, 저장 레이어, CORS | 버그 수정 한정(신규 엔드포인트 추가 금지) | 기존 WS·정적 서빙 함수는 A에서도 불변 |
| `package.json` | **수정** — ws·engines·start | 불변 | |
| `railway.json` | **신규** | 불변 | |
| `.env.example` | **신규** | 불변 | 시크릿 자리표시만 |
| `docs/design/portal-phase2-account-server.md` | **신규** (본 문서) | QA 결과 갱신 | |
| `polaris-common.js` | **수정 금지** | **수정** — `P.cloud`(가입/로그인/토큰 저장 `polaris.auth.v1`, `P.settle` emit 직후 업로드 훅, file:// 폴백) | 키 추가는 `polaris.auth.v1` 1개뿐 |
| `index.html` | 수정 금지 | **수정** — 로비 계정 UI + 주간 리더보드 패널(`weeklyPanel` 옆 `leaderboardPanel`) | |
| `sw.js` | 수정 금지 | 확인 — `/api` 경로 캐시 제외(네트워크 통과) | 로직 수정 없이 확인만 |
| 게임 HTML / `suiji-*.js` | 수정 금지 | 수정 금지 | settle 훅은 이미 Phase 1에서 존재 — 게임 측 변경 0 |

POLICY §2 "2개 이상 파일에 걸친 게임 로직 동시 변경" 게이트: 게임 로직 파일은 A/B 모두 0건이므로 해소.

---

## 10. 규모 산정과 사이클 분할 경계

### 규모 산정 (Phase 1 기준 — S < M < L)

| 단위 | 구성 | 규모 |
|---|---|---|
| 인증 모듈 | 가입/로그인/로그아웃/토큰 검증 + scrypt/sha256/페퍼 | M |
| 저장 레이어 | accounts/tokens/weekly 파일 + 원자적 쓰기 + 롤오버 + 백업 | M |
| API 라우팅 | 엔드포인트 7종 + 검증 + 에러 코드표 + CORS | S |
| 배포 구성 | railway.json + package.json + .env.example | S |
| **사이클 A 합계** | | **L** (POLICY §1 한 사이클 ≤ L+M 이내) |
| 클라이언트 연동 | P.cloud + settle 훅 + 토큰 관리 + 폴백 | M |
| 로비 UI | 계정 카드 + 리더보드 패널 | M |
| 실배포·라이브 QA | Railway 프로젝트·볼륨·Variables + 라이브 검증 + 릴리스 | S |
| **사이클 B 합계** | | **L** |

### 분할 경계 (명확한 인도물 기준)

- **사이클 A 종료 = "Railway에 push만 하면 살아나는 상태"** — 서버 구현 + 로컬 QA 전수(§11) + 배포 준비물.
  실제 Railway 서비스 생성·볼륨 마운트·Variables 등록은 **하지 않는다** (첫 실배포는 라이브 검증 절차가 필요해 B와 묶음).
- **사이클 B 종료 = "Pages 포털에서 계정 만들고 리더보드가 보이는 상태"** — 실배포 + 클라이언트 연동 + 로비 패널 + 라이브 QA.
- 경계 규칙: A의 수용기준이 하나라도 미통과면 B를 착수하지 않는다(§11이 A/B 게이트).
- 사이클 B 이후 백로그(이번에 등록만): 랭크 시즌제(대전 종료를 서버가 직접 기록 — §5-6 근본 해결),
  친구 대국 링크 공유, 멱등키, WS Origin 검증, 백업 복구 리허설.

---

## 11. 수용기준 (사이클 A — 전부 로컬 QA로 검증, 10개)

| # | 기준 | 검증 방법 |
|---|---|---|
| AC-1 | `node --check server.cjs` 통과 + **기존 기능 회귀 0** — 정적 서빙과 WS 온라인 대전(방 생성/입장/착수/시계)이 기존과 동일 동작 | 로컬 기동 후 브라우저에서 suiji 게임 온라인 대전 1대국 (기존 프로토콜 무수정 확인) |
| AC-2 | `GET /api/health` → 200 JSON `{ok:true, version, uptimeSec}` | curl |
| AC-3 | 회원가입: 유효 입력 201+토큰, 중복 닉네임 409, 1자 닉네임/5자 비번 400 | curl 스크립트 |
| AC-4 | 로그인: 정답 200+신규 토큰, 오답 401 `AUTH_FAILED`(닉네임/비번 실패 구분 불가), 로그아웃 후 구 토큰 재사용 401 | curl 스크립트 |
| AC-5 | `accounts.json`에 평문 비밀번호 부재 — `scrypt$…$…` 해시 형식만 존재, 토큰은 sha256 해시로만 저장 | 파일 직접 열람 |
| AC-6 | 전적 업로드 가드: 토큰 없음 401, 만료 토큰 401 `TOKEN_EXPIRED`, 미화이트리스트 game 400, \|delta\|>1000 400, 배열(배치) 본문 400 | curl 스크립트 |
| AC-7 | 유효 업로드가 KST 월요일 기준 `weekStart` 버킷에 합산 반영 + 연속 100건 업로드 후 모든 JSON 파일이 파싱 성공(원자적 쓰기) | 더미 100건 스크립트 + `JSON.parse` 전수 |
| AC-8 | 리더보드: 더미 계정 5개의 exp가 내림차순 rank로 반환, limit 기본 20, 동점 tiebreak 순서 준수, 토큰 시 `me.rank` 포함, 서버 계산 `level`이 `P.level.info()` 규칙과 일치 | 더미 시나리오 + Node 계산 대조 |
| AC-9 | CORS: 등록 origin의 OPTIONS → 204+헤더 세트, 미등록 origin POST → 403 `FORBIDDEN_ORIGIN`, `Origin: null`(file://) → 403 | curl `-H "Origin: …"` |
| AC-10 | 배포 준비물: `railway.json` 존재(healthcheckPath·numReplicas 1) + `package.json`에 ws·engines 등록 + 클린 설치(`rm -rf node_modules && npm install`) 후 `node server.cjs` 기동 + `.env.example`에 시크릿 실값 없음 | 클린 클론 재현 |

AC-1~AC-10 전수 통과 시 POLICY §4 품질 게이트(노드 체크·브라우저 실행·기록)와 함께 사이클 A 완료로 판정한다.

---

## 12. 위험과 후속 과제

| 위험 | 영향 | 대응 |
|---|---|---|
| 리더보드 부정 업로드(클라이언트 신뢰 한계, §5-6) | 순위 오염 | v1 완화(토큰+상한+레이트리미트) 후 순위 오염이 체감되면 랭크 시즌제로 근본 해결 — 백로그 등록 |
| 볼륨 파일 파손·볼륨 유실 | 계정/전적 소실 | §7-2 자동 사본 4세대 + 주 단위 분할 + 사이클 B 수동 덤프 절차 |
| Railway 무료→유료 전환 변동(플랜 정책 변경) | 서비스 다운타임 | 서버는 표준 Node — Fly.io 등 동일 구성 재배포 가능(railway.json만 교체). DATA_DIR 백업으로 이관 |
| `AUTH_SALT` 분실(Variables 삭제) | 기존 비번 전부 검증 불가 | 운영 문서에 "재설정 불가 시크릿 — 분실 시 전원 재가입 절차" 명기, 백업 대상에 Variables 목록 포함 |
| 개인정보(민감도 낮음: 닉네임·전적뿐, 이메일 없음) | POLICY §3-5 | 수집 최소 설계(§3-1)로 회피 — 향후 이메일 도입 시 승인 재요청 |
