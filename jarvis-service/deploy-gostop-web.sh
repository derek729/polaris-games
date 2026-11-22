#!/usr/bin/env bash
# 고스톱 웹 빌드 배포 — release zip → 영속 서빙 루트(~/.local/share/gostop-web)
#
# 배경: 8793 서빙 루트가 /tmp/gostop-web 의존이라 /tmp 정리 시 서비스가
# 무너졌다(11-20 실증). #74 수리 — 지속 경로로 이전하고 언팩을 스크립트로
# 고정한다. 서버 재기동 불요(정적 서빙은 즉시 반영).
#
# 사용법: bash jarvis-service/deploy-gostop-web.sh [release-zip 경로]
#         (인자 생략 시 최신 v0.15.3 zip 사용)

set -euo pipefail

ROOT="${HOME}/.local/share/gostop-web"
# 기본값은 검증된 itch 패키지(rebuild-gostop-zip.py 산출) — release/ flat zip은
# export 중단 산물이라 index.* 명명이 없어 가드가 항상 거부(리뷰 참고 ① 반영)
DEFAULT_ZIP="${HOME}/.local/share/gostop-releases/gostop-v0.15.3-itch-web.zip"
ZIP="${1:-$DEFAULT_ZIP}"

# 경로 하드 검증 — 허용 소스는 두 곳뿐: Godot release/·영속 releases/
case "$ZIP" in
  /mnt/data/work/godot/gostop-godot/release/gostop-*-web.zip) ;;
  /home/derek/.local/share/gostop-releases/gostop-*-web.zip) ;;
  *) echo "[거부] 허용되지 않은 zip 경로: $ZIP" >&2; exit 1 ;;
esac
[ -f "$ZIP" ] || { echo "[오류] zip 없음: $ZIP" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

unzip -q -o "$ZIP" -d "$WORK/unpacked"
# itch 패키지처럼 내부 폴더(gostop/ 등)가 있으면 평탄화 — index.html이 루트에
# 오도록 한 단계 내리기
if [ -f "$WORK/unpacked/index.html" ]; then
  SRC="$WORK/unpacked"
else
  INNER="$(find "$WORK/unpacked" -name index.html -printf '%h\n' | head -1)"
  [ -n "${INNER:-}" ] || { echo "[오류] index.html 미발견" >&2; exit 1; }
  SRC="$INNER"
fi

mkdir -p "$ROOT"
# 원자적 교체 — 서빙 중에도 잠깐의 루트 스왑만 발생
rm -rf "${ROOT}.new"
mv "$SRC" "${ROOT}.new"
chmod -R a+rX "${ROOT}.new"
OLD=""
[ -d "$ROOT" ] && OLD="${ROOT}.old"
[ -n "$OLD" ] && mv "$ROOT" "$ROOT.old"
mv "${ROOT}.new" "$ROOT"
[ -n "$OLD" ] && rm -rf "$OLD"

echo "[배포] $ZIP → $ROOT ($(ls "$ROOT" | wc -l) files)"
ls -la "$ROOT" | head -12
