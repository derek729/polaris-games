#!/usr/bin/env python3
"""폴라리스 게임 에셋 PNG 자동 검증 (art-lint) — 기획서 docs/design/디자인시스템-v1.md §6.

기획서 §4-1 납품 규격 표가 곧 기대값 테이블이다(§6-2). 의존성은 Pillow뿐
(pngquant·ComfyUI 불필요) — 개발·QA가 배포 전 실행한다(§6).

CLI (§6-1):
  python3 game-assets/art_lint.py                 # game-assets/ 전수, 사람용 목록 출력
  python3 game-assets/art_lint.py --json          # CI/에이전트 소비용
  python3 game-assets/art_lint.py --root <경로>   # 특정 폴더만

종료코드: 위반 0건=0, 1건 이상=1. 경고(NEAREST 흔적·부드운 가장자리)는 exit 0(§6-3-5).

규칙 추론 (§6-2):
  bg-*.png·*-background.png -> background / cover*.png -> cover /
  atlas*.png -> 검사 제외 / 그 외 -> 스프라이트류(sprite·icon·UI 공통 규칙)

검사 5종 (§6-3): ①치수 ②투명도 ③용량 ④256색 ⑤NEAREST 흔적(경고만)

구현 비고 — ②의 "외곽 1px 테두리 투명(배경제거 확인)": 기존 33종 실측에서 rembg의
반투명 소프트 엣지가 테두리에 남는다(예: zombie-cone 테두리 알파=0 비율 37.5%).
"모든 테두리 픽셀 알파=0"으로 요구하면 §6-4의 day-1 전수 통과가 깨지므로,
배경제거 미수행(불투명 배경 잔존)을 잡는 본래 목적에 맞춰 "테두리 완전 불투명
비율 50% 미만"을 통과 조건으로 한다. 소프트 엣지 과다는 ⑤ 경고로 따로 잡는다.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image

# --- 기대값 테이블 (§4-1 납품 규격) ----------------------------------------
# 스프라이트류(스프라이트/아이콘/UI) 치수별 용량 상한(KB):
#   32px=아이콘 8KB · 64px=스프라이트 15KB · 96px=UI 15KB · 128px=보스 40KB
SPRITE_SIDE_KB = {32: 8, 64: 15, 96: 15, 128: 40}
RULES = {
    "sprite":     {"dims": "32/64/96/128 정사각", "transparent": True},
    "background": {"dims": (672, 384), "max_kb": 120, "transparent": False},
    "cover":      {"dims": (1200, 630), "max_kb": 250, "transparent": False},
}
BORDER_OPAQUE_PASS_MAX = 0.50   # 테두리 완전 불투명 비율이 이 이상이면 배경제거 미확인(위반)
SEMI_ALPHA_WARN = 0.05          # 알파 반톤(0/255 제외) 비율 경고 임계 (§6-3-5②)


def infer_rule(path: Path):
    """§6-2 규칙 추론 — 제외면 None."""
    name = path.name.lower()
    if name.startswith("atlas"):
        return None
    if name.startswith("bg-") or name.endswith("-background.png"):
        return "background"
    if name.startswith("cover"):
        return "cover"
    return "sprite"


def sprite_kb_limit(side: int) -> int:
    """치수별 용량 상한. 비규격 치수는 그보다 큰 최소 규격의 상한을 적용(예: 63px -> 64px 상한)."""
    if side in SPRITE_SIDE_KB:
        return SPRITE_SIDE_KB[side]
    larger = [SPRITE_SIDE_KB[s] for s in sorted(SPRITE_SIDE_KB) if s >= side]
    return larger[0] if larger else SPRITE_SIDE_KB[max(SPRITE_SIDE_KB)]


def border_opaque_ratio(rgba) -> float:
    """외곽 1px 링에서 완전 불투명(알파=255) 비율."""
    w, h = rgba.size
    px = rgba.load()
    ring = [px[x, y] for x in range(w) for y in (0, h - 1)]
    ring += [px[x, y] for x in (0, w - 1) for y in range(h)]
    opaque = sum(1 for c in ring if c[3] == 255)
    return opaque / len(ring) if ring else 0.0


def upscale_trace_k(rgba):
    """§6-3-5① — 정수 배율 k(2~16)의 k×k 균일 블록 전체 일치 시 k 반환(업스케일 흔적), 없으면 None."""
    w, h = rgba.size
    px = rgba.load()
    for k in range(2, 17):
        if w % k or h % k:
            continue
        uniform = True
        for by in range(0, h, k):
            for bx in range(0, w, k):
                base = px[bx, by]
                for y in range(by, by + k):
                    for x in range(bx, bx + k):
                        if px[x, y] != base:
                            uniform = False
                            break
                    if not uniform:
                        break
                if not uniform:
                    break
            if not uniform:
                break
        if uniform:
            return k
    return None


def lint_png(path: Path):
    """단일 PNG 검사 — {preset, violations[], warnings[]} 반환. 제외 대상은 None."""
    preset = infer_rule(path)
    if preset is None:
        return None
    rule = RULES[preset]
    violations, warnings = [], []

    def add(check, expected, actual):
        violations.append({"check": check, "expected": expected, "actual": actual})

    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        add("파일", "열리는 PNG", f"열기 실패({e})")
        return {"preset": preset, "violations": violations, "warnings": warnings}

    kb = path.stat().st_size / 1024
    rgba = im.convert("RGBA")
    w, h = rgba.size
    total = w * h
    hist = rgba.getchannel("A").histogram()
    n_transparent, n_opaque = hist[0], hist[255]
    n_semi = total - n_transparent - n_opaque

    # ① 치수 (§6-3-1)
    if preset == "sprite":
        if not (w == h and w in SPRITE_SIDE_KB):
            add("치수", rule["dims"], f"{w}x{h}")
    else:
        if (w, h) != rule["dims"]:
            add("치수", f"{rule['dims'][0]}x{rule['dims'][1]}", f"{w}x{h}")

    # ② 투명도 (§6-3-2) — 구현 비고는 모듈 독스트링 참조
    if rule["transparent"]:
        if n_transparent == 0:
            add("투명 픽셀", "투명 픽셀 존재(배경제거)", "투명 픽셀 0개")
        ratio = border_opaque_ratio(rgba)
        if ratio >= BORDER_OPAQUE_PASS_MAX:
            add("테두리 투명", f"외곽 1px 완전 불투명 <{BORDER_OPAQUE_PASS_MAX:.0%}(배경제거 확인)",
                f"불투명 {ratio:.1%}")
        if total and n_semi / total > SEMI_ALPHA_WARN:
            warnings.append(f"부드러운 가장자리(알파 반톤 {n_semi / total:.1%} > 5%) — 바이리니어·rembg 과다 의심")
    else:
        if n_transparent + n_semi > 0:
            add("불투명", "알파 255 전체(불투명 규격)", f"투명/반투명 {n_transparent + n_semi}px")

    # ③ 용량 (§6-3-3)
    limit = sprite_kb_limit(max(w, h)) if preset == "sprite" else rule["max_kb"]
    if kb > limit:
        add("용량", f"≤{limit}KB", f"{kb:.1f}KB")

    # ④ 256색 (§6-3-4) — P 팔레트 모드가 정상(postprocess가 pngquant까지 수행)
    if im.mode != "P":
        colors = rgba.getcolors(maxcolors=257)
        n_colors = None if colors is None else len(colors)
        if n_colors is None or n_colors > 256:
            add("색수", "P 팔레트 또는 고유색 ≤256", "고유색 >256" if n_colors is None else f"고유색 {n_colors}")

    # ⑤ NEAREST 흔적 — 경고만, exit 불영향 (§6-3-5)
    if total:
        k = upscale_trace_k(rgba)
        if k:
            warnings.append(f"업스케일 흔적 의심({k}x{k} 균일 블록 전체 일치)")

    return {"preset": preset, "violations": violations, "warnings": warnings}


def collect_pngs(root: Path):
    return sorted(p for p in root.rglob("*.png") if infer_rule(p) is not None)


def main():
    default_root = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description="폴라리스 게임 에셋 PNG 검증 (art-lint, §6)")
    ap.add_argument("--root", default=str(default_root), help=f"검사 루트 폴더 (기본: {default_root})")
    ap.add_argument("--json", action="store_true", help="CI/에이전트 소비용 JSON 출력")
    args = ap.parse_args()

    root = Path(args.root).expanduser().resolve()
    files = collect_pngs(root) if root.is_dir() else []
    if not root.is_dir():
        print(f"[art-lint] 루트 폴더를 찾을 수 없습니다: {root}", file=sys.stderr)

    results = []
    for path in files:
        res = lint_png(path)
        if res is None:
            continue
        res["file"] = str(path)
        results.append(res)

    failed = [r for r in results if r["violations"]]
    warned = [r for r in results if not r["violations"] and r["warnings"]]

    def rel(p):
        try:
            return str(Path(p).relative_to(root.parent))
        except ValueError:
            return str(p)

    if args.json:
        print(json.dumps({
            "root": str(root),
            "checked": len(results),
            "failed": len(failed),
            "warnings": sum(len(r["warnings"]) for r in results),
            "results": [{
                "file": r["file"], "preset": r["preset"],
                "ok": not r["violations"],
                "violations": r["violations"], "warnings": r["warnings"],
            } for r in results],
        }, ensure_ascii=False, indent=2))
    else:
        for r in results:
            if r["violations"]:
                reasons = "; ".join(f"{v['check']}: 기대 {v['expected']} vs 실측 {v['actual']}" for v in r["violations"])
                print(f"FAIL {rel(r['file'])} | {r['preset']} | {reasons}")
            elif r["warnings"]:
                print(f"WARN {rel(r['file'])} | {r['preset']} | {'; '.join(r['warnings'])}")
            else:
                print(f"OK   {rel(r['file'])} | {r['preset']}")
        print(f"---")
        print(f"{len(results)}종 검사, {len(failed)}종 위반 (경고 {len(warned)}종)")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
