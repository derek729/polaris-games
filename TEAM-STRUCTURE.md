# 주식회사 폴라리스 — 소프트웨어개발팀 조직 구조

**팀장: 김팀장** (메인 ZCode 에이전트) — 전체 프로젝트 총괄, 실무 에이전트(직원) 지휘·감사.
프로토콜: `parallel-dev` 스킬 + 파일 소유권 분리 (파일이 untracked인 동안은 worktree 대신
백업(.backups/) + 소유권 분리로 격리).

## 1. 조직도 및 직군별 지시 체계

| 직군 | 담당 (에이전트) | 담당 영역 | 사용 도구/인프라 |
|------|----------------|-----------|------------------|
| 팀장 | 김팀장 (메인 에이전트) | 작업 분해, 인터페이스 컨트랙트 확정, 병렬 지시, 머지(위임 금지), 감사, 사용자 보고 | 전체 도구 |
| 아트팀 | 에셋 생성 직영 or 서브에이전트 | 스프라이트/아이콘/아틀라스 생성·검수 | ComfyUI(SDXL+pixel-art-xl), generate_sprite.py, postprocess_sprite.py, pack_atlas.py |
| 사운드팀 | 서브에이전트 or 직영 | 효과음(SFX)·배경음악(BGM) 생성 | sfx_gen.py (절차적 8종), bgm_gen.py (MusicGen 로컬) |
| 개발1팀~N | general-purpose 서브에이전트 | 게임별 코드 작업 (게임당 1명, 파일 소유 분리) | 파일 도구, node --check 검증 |
| QA팀 | 브라우저 검수 (팀장 직영) | 게임 실행, 스크린샷 시각 수용 검사 | browser-use:control-browser, web-gui-tester |
| 문서팀 | 필요시 서브에이전트 | 보고서/매뉴얼/이슈 문서 | document-skills (docx/pdf/pptx/xlsx) |
| 감사 | judge 서브에이전트 + 팀장 | 코드 diff 직접 검증, 렌더 결과 수용 판정 | diff, node --check, judge |

지시 규칙 (parallel-dev 준수):
- 인터페이스/컨트랙트(파일명, 크기, 경로, 폴백 패턴)는 **팀장이 사전 확정**해 프롬프트에 verbatim.
- 두 직원이 같은 파일을 건드리는 분해는 금지 — 병합하거나 순차 실행.
- 에이전트 프롬프트는 자기완결적 + 절대경로. 완료 보고: 변경 함수 목록, 검증 결과, 스펙 이탈 여부.
- 감사는 보고가 아니라 **실제 diff/트리/렌더**를 검증. 스프라이트 통합 컨트랙트:
  "스프라이트 로드 성공 시 drawImage, 실패 시 기존 도형 렌더링 폴백 유지" (file:// 상대경로).

## 2. 진행 흐름 (스프린트 단위)

```
① 분해 → ② 격리(백업/worktree) → ③ 병렬 지시(한 메시지, 백그라운드)
→ ④ 수집 → ⑤ 통합(팀장 머지) → ⑥ 감사(diff+문법+브라우저) → ⑦ 보고
```

## 3. 인프라 인벤토리

### 아트 (로컬 GPU: RTX 3060 12GB)
- ComfyUI 0.35: http://127.0.0.1:8188 — 재시작 `bash /home/derek/comfyui/start_comfyui.sh`
- SDXL base 1.0 + pixel-art-xl LoRA. 장당 20~30초(첫 장 ~2분).
- `/home/derek/comfyui/generate_sprite.py` 생성 / `postprocess_sprite.py` 배경제거+축소 / `pack_atlas.py` 아틀라스.
- 에셋 저장소: `game-assets/<game>/<name>.png` (몬스터/캐릭터 64px, 아이콘/노트 32px, 투명배경).

### 사운드 (/home/derek/polaris-audio/)
- `sfx_gen.py`: coin/jump/hit/laser/explosion/powerup/select/gameover 절차적 합성 (numpy).
- `bgm_gen.py`: MusicGen-small 로컬 생성. **ComfyUI 사용 중에는 --device cpu** (VRAM 충돌 방지).
- 출력: `game-assets/sfx/*.wav`, `game-assets/bgm/*.wav`.

### 보유 스킬 매핑
- 병렬 개발: parallel-dev / 브라우저 QA: browser-use + web-gui-tester / UI 디자인: design-taste-frontend
- 문서: document-skills / 자체 스킬 제작: skill-creator

## 4. MCP 추가 검토 결과 (2026-09-12 김팀장 판정)

| 후보 | 판정 | 사유 |
|------|------|------|
| 이미지 생성 MCP (ComfyUI 래퍼) | **불필요** | Bash 스크립트가 이미 완전 자동화 인터페이스. MCP화는 설정·재시작·의존성 리스크만 추가 |
| 파일시스템/Git MCP | 불필요 | 기본 도구로 충족 |
| 브라우저 자동화 MCP | 불필요 | browser-use 플러그인 보유 |
| DB/SQLite MCP | 불필요 | 게임이 단일 파일 + 데이터 테이블 구조 |
| GitHub MCP | **보류(재검토)** | 원격 협업/이슈 트래커 연동이 필요해지는 시점에 도입 |

재검토 트리거: (1) 원격 저장소 협업 시작, (2) TTS/음성 담당 신설, (3) 3D 에셋 수요 발생.
커스텀 스킬 백로그: "폴라리스 에셋 파이프라인" 스킬화 (skill-creator).

## 5. 프로젝트 목록

| 프로젝트 | 내용 | 비고 |
|----------|------|------|
| vampire-survivors.html | 로그라이크 생존 게임 | 에셋 파이프라인 1순격, 스프린트 1 진행 |
| plants-vs-zombies.html | 타워 디펜스 | 스프린트 1 진행 |
| beatcraft.html | 리듬 게임 (DDR식) | 스프린트 1 진행 |
| suiji-* 시리즈 | 보드게임 포털 (바둑/오목/알까기/기보) | 공유 엔진 suiji-engine.js, 스프린트 1 진행 |
| atelier-studio/ | 스튜디오 페이지 | |
| fullstack-agent/ | 별도 풀스택 프로젝트 | |
| contrib-issues/ | 기여 이슈 문서 | |
| game-assets/ | AI 생성 에셋 (스프라이트/sfx/bgm) | |

## 6. 스프린트 로그

### 스프린트 2 + v1.0.0 릴리스 (2026-09-12) — "사운드 통합 & 출시" ✅ 완료
- 투입: 개발팀 2명(Agent E: VS, Agent F: PvZ+suiji — 파일 소유 분리) + 아트팀/사운드팀 + QA, 팀장 통합·감사·릴리스
- 결과:
  - VS: 신규 몬스터 6종(snail/bat/pig/보스 3종 128px) 연결, WAV SFX 6이벤트, 루프 BGM(뮤트 연동)
  - PvZ: 심기·폭발·식물 피식 SFX(스로틀·뮤트 연동)
  - suiji: 엔진 착수음 (기존 Suiji.sound 시스템 존중, SGF 리플레이 80ms 스로틀)
  - BGM 3트랙(MusicGen 로컬 생성) — vs/pvz/suiji
  - 아트 검수 1건 반려→재생성: boss-reaper(단일 캐릭터가 아닌 시트 형태로 생성됨)
  - 릴리스: 포털 index.html, sw.js polaris-v17, 매니페스트 7종 브랜딩, README-release v1.0.0 노트
  - git: 커밋 cb519e5 + 태그 v1.0.0 (69파일, 중첩저장소·백업·ONNX 제외)
- 이슈/교훈:
  - CUDA OOM 경고로 BGM 1트랙 실패 → cuda 재시도→cpu 폴백 체인으로 해결
  - 동일 시드+상이 프롬프트는 서로 다른 출력 확인(md5 검증)
  - 보스급 대형 스프라이트는 "single character only" 프롬프트 필수

### 스프린트 1 (2026-09-12) — "스프라이트 전환" ✅ 완료
- 투입: 개발팀 4명(파일 소유 분리) + 아트팀(24종 생산) + QA(브라우저 수용 검사), 팀장 통합·감사
- 결과: 4개 게임 전부 AI 스프라이트 렌더링 적용 (폴백 유지), `node --check` 전수 통과,
  브라우저 실행 확인 (VS 전투/PvZ 식물·좀비/beatcraft 노트 젬/suiji 흑백돌)
- 산출물: 스프라이트 24종, SFX 8종, BGM 생성기, 아틀라스 패커
- 스프린트 2 백로그:
  - VS: 미적용 몬스터 snail/bat/pig + 보스 3종 스프라이트 추가, 군집 몹 가독성 개선
    (어두운 배경에서 어두운 스프라이트 → 밝은 외곽선/저해상도 소스 고려)
  - VS: item-potion 미사용 (게임에 물약 픽업 없음 — chicken이 힐) → 재활용 or 폐기
  - PvZ: 스프라이트 경로에서 피격 플래시/장비 손실 표현 생략됨 → 손상 단계 스프라이트 검토
  - 전 게임: SFX/BGM 파일 연결 (사운드팀 산출물 통합), 아틀라스 패킹 적용
  - git: 파일 커밋 후 worktree 격리 전환 검토
