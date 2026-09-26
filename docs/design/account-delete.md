# 계정 삭제 API 기획서 (Phase 2 후속 — 개인정보 삭제권 대응)

- 작성: 김실장 · 2026-09-22 (자체 승인 — 근거: 테스트 계정 "점검요원"이 라이브 리더보드에 잔존 중,
  사용자 데이터 삭제권은 계정 서비스의 기본 의무. portal-phase2-account-server.md §4의 후속 엔드포인트)
- 규모: M (서버 S + 클라이언트 S + QA S)

## 1. 엔드포인트

`POST /api/account/delete` — Bearer 토큰 + 비밀번호 재확인 필수.

요청: `{"password": "..."}` (Authorization: Bearer <token> 헤더)
동작:
1. authenticate로 토큰 검증 (401 AUTH_REQUIRED/TOKEN_EXPIRED 기존 계약)
2. 본문 password와 계정의 scrypt 해시 대조 → 불일치 401 AUTH_FAILED
3. **하드 삭제**: accounts에서 제거 · 해당 계정의 토큰 전부 폐기 · weekly 버킷(모든 주 파일)에서
   해당 name의 전적 제거
4. 원자적 쓰기 + 백업(기존 saveTokens/saveAccounts/주간 저장 경유 — 롤백 가능성은 백업 4세대가 담당)
5. 응답 200 `{"ok": true}`

에러코드: 401 AUTH_REQUIRED / TOKEN_EXPIRED / AUTH_FAILED, 400 BAD_JSON·FIELD_INVALID(password),
413 PAYLOAD_TOO_LARGE, 429 RATE_LIMITED(계정 카운터 재사용), 500 INTERNAL

## 2. 리더보드 정합성

버킷에서 즉시 제거되므로 삭제 직후 리더보드에서 사라진다(부정 삭제 방지는 이미 비밀번호 재확인으로
커버). 랭킹 순위는 남은 항목으로 재정렬 — 별도 마이그레이션 불필요.

## 3. 클라이언트 (polaris-common.js + index.html)

- `P.cloud.deleteAccount(password)` — 토큰·로컬 auth 키 제거까지 포함, 실패 시 {ok:false, code} 반환
- 계정 카드(로그인 상태)에 "계정 삭제" 텍스트 링크 추가 → 클릭 시 카드 내 인라인 확인 폼
  (비밀번호 재입력 + "삭제하면 전적·랭킹 기록도 함께 사라져요" 경고 문구) — window.confirm 미사용 원칙 유지
- 삭제 성공 시: 로그아웃 상태로 전환 + 토스트 "계정이 삭제되었어요" + leaderboard 갱신

## 4. 제약·보안

- 삭제는 재확인(비밀번호) 2단계 없이는 절대 실행하지 않는다
- 이미 로그아웃/만료된 토큰으로는 삭제 불가(본인 확인 불가) — 재로그인 후 가능
- 기존 엔드포인트·프로토콜 무수정 (switch case 1개 + 헬퍼 함수 추가만)
- CORS·레이트리밋(계정 카운터) 기존 경로 그대로 적용

## 5. 수용기준 (CLI + 브라우저 검증)

- [ ] 가입 → 삭제(비밀번호 재확인) 200 → 동일 닉네임 재가입 201 가능 (삭제 완전성)
- [ ] 오답 비밀번호로 삭제 시도 → 401, 계정·토큰·전적 무변동
- [ ] 삭제 후 구 토큰 재사용 → 401 (토큰 전부 폐기 확인)
- [ ] 삭제 후 리더보드에서 해당 이름 소실 (다른 항목 랭킹 유지)
- [ ] 무토큰/만료 토큰 삭제 시도 → 401
- [ ] 로비 계정 카드에 삭제 링크·확인 폼 렌더, 성공 시 로그아웃 전환 + 랭킹 갱신
- [ ] 기존 기능 회귀: 가입·로그인·업로드·leaderboard·WS 대전 전부 통과
- [ ] node --check 전수 + py_compile 해당 없음(순수 JS)

## 6. 파일 소유 (개발자 1인)

server.cjs / polaris-common.js / index.html — 기획서 본 문서 포함 3파일+1문서.
DEPLOY-RAILWAY.md에 삭제 API 운영 메모 1줄 추가(선택).

## 7. 구현 메모 (개발팀 — 2026-09-26)

- server.cjs: switch case `POST /api/account/delete` 1개 + `apiAccountDelete`·`purgeWeeklyEntries` 헬퍼 2개만 추가.
  순서는 기존 POST /api/matches와 동일(본문 413/BAD_JSON → authenticate 401 → 계정 카운터 429 →
  FIELD_INVALID 400 → scrypt 재확인 401 AUTH_FAILED → 하드 삭제 → saveAccounts/saveTokens/saveWeek 원자적 기록).
  API_VERSION·기존 엔드포인트 응답은 무수정. 주간 버킷은 WEEKLY_DIR의 `YYYY-MM-DD.json` 전 파일에서
  accountId 키로 제거(loadWeek/saveWeek weeklyCache 경유).
- polaris-common.js: `P.cloud.deleteAccount(password)` — 200 시 clearAuth+emitCloud, 401 AUTH_FAILED는
  로그인 유지, 그 외 401(TOKEN_EXPIRED/AUTH_REQUIRED)은 기존 규약대로 조용히 로그아웃.
- index.html: 로그인 상태 계정 카드에 "계정 삭제" 텍스트 링크 → 인라인 확인 폼(비밀번호 재입력 +
  "삭제하면 전적·랭킹 기록도 함께 사라져요" 경고). 성공 시 polaris:cloud 이벤트로 로그아웃 전환·
  토스트 "계정이 삭제되었어요"·리더보드 갱신이 기존 구독 경로로 자동 수행됨.
- sw.js: CACHE_VERSION polaris-v25 → polaris-v26 (릴리스 절차).
- password 필드 유효성: 문자열이 아니거나 빈 문자열이면 400 FIELD_INVALID, 그 외는 scrypt 대조 결과로
  401 AUTH_FAILED — 길이 정책을 삭제 API에서 재노출하지 않는다.
