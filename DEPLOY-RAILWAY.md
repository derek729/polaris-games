# DEPLOY-RAILWAY — 두마당 서버 Railway 배포 절차 (사이클 B)

> 대상 독자: 배포를 직접 따라 하시는 분 (CLI 명령을 그대로 복붙하면 됩니다)
> 기획서: `docs/design/portal-phase2-account-server.md` §8 (사이클 A에서 구현 완료, 본 문서는 **사이클 B 실행 절차**)
> 소요 시간: 약 20~30분 (계정 로그인 대기 제외)

---

## 0. 준비물 확인

| 항목 | 확인 |
|---|---|
| Railway 계정 | 유료 플랜 사용 중 (2026-09-18 승인 완료) — https://railway.app 로그인 가능 |
| Node.js 20 이상 | `node --version` → v20 이상 출력 |
| npm | `npm --version` |
| 이 저장소 최신 코드 | 사이클 A 결과 포함: `server.cjs`, `railway.json`, `.env.example`, `package.json`(ws 의존성) |

Railway CLI가 없다면 먼저 설치:

```bash
npm install -g @railway/cli
# 확인
railway --version
```

---

## 1. Railway 로그인 (브라우저 인증)

```bash
railway login
```

- 실행하면 터미널에 브라우저 확인 링크가 뜨고(자동으로 브라우저가 열림) 브라우저에서 **"Approve"** 를 누르면 로그인됩니다.
- 브라우저가 없는 서버 환경이면 출력된 URL을 로컬 브라우저로 복사해서 열어 승인하세요.
- 확인: `railway whoami` → 내 계정 이메일 출력.

---

## 2. 프로젝트 생성 (저장소 루트에서)

저장소 루트(`server.cjs`가 있는 폴더)로 이동한 뒤:

```bash
cd <이 저장소 폴더>
railway init
```

- 프롬프트: 프로젝트 이름 → **`dumadang`** 입력 (다른 이름도 무방, 이하 문서에서는 `dumadang` 기준)
- 이미 만든 프로젝트에 연결하는 경우: `railway link` → 목록에서 선택

확인: `railway status` → 프로젝트/환경(production)이 표시됨.

---

## 3. 볼륨 마운트 (DATA_DIR = /data) — **반드시 배포 전에**

계정·전적 파일(`DATA_DIR`)은 재배포 시에도 살아있어야 하므로 볼륨이 필수입니다.

```bash
railway volume add
```

- 프롬프트가 mount path를 물으면 **`/data`** 입력.
- (CLI 버전에 따라 볼륨 메뉴가 없으면 대시보드 → 프로젝트 → 서비스 우클릭 → *Attach Volume* → Mount path `/data`)

이후 환경변수로 이 볼륨을 가리킵니다(§5). 마운트 경로가 `/data`와 다르면 반드시 `DATA_DIR`을 그 경로로 맞출 것.

⚠️ 볼륨 없이 배포하면 컨테이너 재시작마다 **계정·전적이 전부 삭제**됩니다.

---

## 4. AUTH_SALT 발급 (시크릿 — 저장소에 절대 넣지 않음)

로컬 터미널에서 32바이트 hex 값을 생성:

```bash
openssl rand -hex 32
```

출력된 64자리 문자열을 **복사해 둡니다.** 이 값은 다시 볼 수 없으므로 지금 비밀글고(CLI 등록 직후)에도
**팀 비밀 저장소에 백업**해 둡니다.

> 🔴 **AUTH_SALT는 재발급 불가 시크릿입니다.** 이 값을 바꾸면 기존 회원의 비밀번호가 전부 검증 불가가 되어
> **전원 재가입** 절차가 필요합니다. 분실 대비: Railway Variables 목록을 백업 대상에 포함할 것.

---

## 5. 환경변수 등록

```bash
railway variables --set AUTH_SALT=<4번에서 발급한 값>
railway variables --set DATA_DIR=/data
railway variables --set CORS_ORIGIN=https://derek729.github.io
railway variables --set TOKEN_TTL_DAYS=30
railway variables --set WEEKLY_TZ_OFFSET_MIN=540
```

- `PORT`는 **Railway가 자동 주입** — 등록 불필요.
- `CORS_ORIGIN`은 GitHub Pages 포털 origin(`https://derek729.github.io`). 커스텀 도메인을 추가할 때 콤마로 나열:
  `railway variables --set CORS_ORIGIN="https://derek729.github.io,https://새도메인"`
- 등록 확인: `railway variables` (값이 마스킹되면 정상 — 시크릿이 노출되지 않는 것)

> 참고: `RATE_LIMIT_ACCOUNT_PER_MIN`(기본 60)·`RATE_LIMIT_IP_PER_MIN`(기본 120)은 그대로 둡니다.

---

## 6. 배포

```bash
railway up
```

- 저장소 전체를 업로드해 빌드(NIXPACKS — `npm install` 후 `node server.cjs`)합니다. 첫 빌드는 2~4분.
- `railway.json`의 `healthcheckPath: /api/health` 때문에 **헬스체크를 통과해야 배포가 확정**됩니다.
- 진행 로그: `railway logs`

---

## 7. 도메인 생성 + 헬스체크

```bash
railway domain
```

- `https://dumadang-production.up.railway.app` 형태의 공개 URL이 출력됩니다 (이하 `<서버URL>`).

헬스체크:

```bash
curl https://<서버URL>/api/health
```

기대 응답 (200):

```json
{ "ok": true, "service": "dumadang", "version": "2.1.0", "uptimeSec": 3, "accounts": 0 }
```

실패 시 체크리스트:
- `railway logs`에서 `AUTH_SALT 환경변수가 비어 있습니다` → §5 재확인 (서버는 의도적으로 종료되는 것이 정상 동작).
- DeployLogs에 `Cannot find module 'ws'` → `package.json`의 dependencies가 빠진 것 — 저장소 최신 코드인지 확인.
- 헬스체크 타임아웃 → 볼륨 마운트 경로 권한 문제 여부 확인(`DATA_DIR`에 쓰기 가능해야 함).

동작 점검 (배포 서버에서 가입 1회):

```bash
curl -s -X POST https://<서버URL>/api/auth/register \
  -H "Content-Type: application/json" -d '{"name":"점검요원","password":"test1234"}'
```

→ 201 + `token`이 나오면 성공. **점검용 계정은 실제 서비스 닉네임을 쓰지 않도록** (삭제 API는 v1에 없음).

---

## 8. Pages Origin 등록 확인 (CORS 마무리)

GitHub Pages 포털(`https://derek729.github.io/...`)에서 API를 호출하려면 §5의
`CORS_ORIGIN=https://derek729.github.io` 만으로 충분합니다. 확인:

```bash
curl -s -o /dev/null -D - -X OPTIONS https://<서버URL>/api/auth/login \
  -H "Origin: https://derek729.github.io" -H "Access-Control-Request-Method: POST"
```

기대: `HTTP/2 204` + `access-control-allow-origin: https://derek729.github.io` 헤더.

미등록 origin은 403이 맞습니다:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<서버URL>/api/auth/login \
  -H "Origin: https://example.com" -H "Content-Type: application/json" -d '{}'
# → 403 (FORBIDDEN_ORIGIN)
```

> 온라인 대전(WebSocket)은 별도 설정 없이 Railway 서버 URL에서 서빙되는 페이지로 접속하면 동작합니다
> (클라이언트가 `location.host + '/ws'`로 접속 — 사이클 B에서 클라이언트가 Railway URL을 가리키게 함).

---

## 9. 배포 후 운영 (반복 참고)

| 작업 | 명령/절차 |
|---|---|
| 로그 보기 | `railway logs` |
| 재배포(코드 갱신) | `railway up` (볼륨 데이터는 유지됨) |
| Variables 목록 백업 | 대시보드 Variables 탭 캡처 or `railway variables` 출력 저장 — **AUTH_SALT 포함, 백업처 안전하게** |
| 데이터 수동 덤프 (주 1회 권장) | 대시보드 → 볼륨 → 스냅샷 생성. 또는 서버에 덤프 엔드포인트 추가 전까지 볼륨 스냅샷으로 대체 |
| 백업 확인 | 서버 기동 시마다 `DATA_DIR/backups/accounts.*.json`, `tokens.*.json` (최근 4세대), 주 전환 시 `backups/weekly/` |
| 백업 **삭제** | ⚠️ 승인 대상(POLICY 데이터 파기·백업 삭제) — 임의 삭제 금지 |

데이터 파일 레이아웃 (볼륨 `/data`):

```
/data/
  accounts.json        # 회원 — 평문 비밀번호 없음 (scrypt 해시만)
  tokens.json          # 로그인 토큰 sha256 해시만 저장
  weekly/YYYY-MM-DD.json   # 주 단위 전적 버킷 (KST 월요일 시작)
  backups/             # 자동 사본 (각 종류 최근 4세대)
```

---

## 10. 문제 발생 시

- **서버가 기동 직후 죽음** → 로그에 `AUTH_SALT` 메시지가 있는지. Variables 등록 후 `railway up` 재배포.
- **가입은 되는데 Pages에서 403/CORS 에러** → 브라우저 콘솔의 Origin과 `CORS_ORIGIN` 값이 정확히 일치하는지 (끝 슬래시 없이).
- **전적이 재배포마다 사라짐** → 볼륨 미마운트 또는 `DATA_DIR`이 볼륨 경로(/data)와 불일치.
- **AUTH_SALT 분실 확정** → 전원 재가입 절차: Variables 재발급(`openssl rand -hex 32`) → 재배포 → 기존 `accounts.json` 삭제(승인 필요) → 안내 공지.

---

## 11. 이 절차 이후 (사이클 B 나머지)

배포가 끝나면 사이클 B의 남은 작업은 클라이언트 연동입니다:
`polaris-common.js`에 `P.cloud`(가입/로그인/토큰 저장 — localStorage 키 `polaris.auth.v1`),
`P.settle` emit 직후 `/api/matches` 업로드 훅, 로비 계정 UI + 주간 리더보드 패널, `file://` localStorage 폴백.
자세한 스펙은 기획서 §4·§9 참조.
