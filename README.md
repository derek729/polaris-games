# 폴라리스 게임 센터 (Polaris Games)

주식회사 폴라리스 소프트웨어개발팀의 게임·툴 컬렉션.
**AI 멀티에이전트 조직**(김팀장 + 아트/사운드/개발/QA 직군 병렬 스프린트)으로 개발했습니다.

## 수록 프로젝트

| 프로젝트 | 설명 | 진입점 |
|----------|------|--------|
| 뱀파이어 키우기 | 뱀서라이크 생존 액션 — AI 생성 몬스터·아이템 스프라이트, SFX·BGM | `vampire-survivors.html` |
| 식물 vs 좀비 | 타워 디펜스 — AI 생성 식물·좀비 스프라이트, SFX | `plants-vs-zombies.html` |
| BeatCraft DDR | 4레인 리듬 게임 — 노트 젬 스프라이트 | `beatcraft.html` |
| 두마당 보드게임 | 바둑·오목·알까기·기보 — 온라인 대전, AI 픽셀아트 돌 스킨 | `suiji-index.html` |
| Atelier Studio | 3D 인테리어 디자인 스위트 (Three.js) — 견적·PDF 내보내기 | `atelier-studio/index.html` |
| utils-kit | JS 유틸 라이브러리 (수학·문자열, 26 테스트) | `src/utils/` |

**통합 포털**: `index.html` — 전체 컬렉션 허브

## 실행

```bash
# 정적 호스팅 + 온라인 대전 릴레이 (WebSocket)
npm install ws   # 최초 1회
node server.cjs  # http://localhost:8787
```

또는 임의의 정적 호스팅(GitHub Pages 등)에 업로드 — PWA로 설치하면 오프라인 실행됩니다.

## 개발 구조

- 병렬 멀티 에이전트 개발: `parallel-dev` 스킬, 브랜치 `agent/<name>` → main 병합
- 조직·프로세스·스프린트 로그: [TEAM-STRUCTURE.md](TEAM-STRUCTURE.md)
- 릴리스 노트·배포 가이드: [README-release.md](README-release.md)
- AI 에셋 파이프라인 산출물: `game-assets/` (스프라이트 33종 · SFX 8종 · BGM 3트랙)

## 테스트

```bash
npm test   # utils-kit 26 테스트
```
