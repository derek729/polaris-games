# 개발 워크스페이스

병렬 멀티 에이전트 개발 환경 (parallel-dev 스킬 사용).

- 각 에이전트는 `.worktrees/<agent-name>` 의 독립 worktree에서 작업
- 브랜치 규칙: `agent/<agent-name>` → 완료 후 main에 병합
- 스킬 위치: `~/.agents/skills/parallel-dev/`
