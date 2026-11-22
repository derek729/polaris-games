#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""고스톱 v0.15.3 itch 웹 패키지 재생성.

실측(#74): release/의 v0.15.2·v0.15.3-web.zip은 export 중단 산물(5.5KB)이고,
loose html은 $GODOT_URL 플레이스홀더가 남은 미완성 템플릿. 반면 js·wasm은
v0.15.2와 md5 동일(엔진 불변)이고 pck만 GDPC 매직의 온전한 신규 콘텐츠.

따라서 올바른 패키지 = 검증된 itch v0.15.2 엔진 파일(index.* 레이아웃) +
v0.15.3 pck 교체. 산출물은 배포 검증된 것과 같은 구조(gostop/ 폴더·index.html).

모든 경로는 리터럴 상수 — 동적 경로 구성 없음(Mimosa 경로 순회 지적 반영).
실행: python3 jarvis-service/rebuild-gostop-zip.py
"""
import os
import shutil
import sys
import tempfile
import zipfile

ITCH_ZIP = "/mnt/data/work/polaris/store/itch-gostop-package/gostop-web-v0152.zip"
V0153_PCK = "/mnt/data/work/godot/gostop-godot/release/gostop-v0.15.3-web.pck"
OUT_DIR = "/home/derek/.local/share/gostop-releases"
OUT_ZIP = os.path.join(OUT_DIR, "gostop-v0.15.3-itch-web.zip")


def main():
    """itch v0.15.2 레이아웃 + v0.15.3 pck → 신규 패키지. 성공 0, 실패 1."""
    if not os.path.isfile(V0153_PCK):
        print(f"[오류] pck 없음: {V0153_PCK}")
        return 1
    if not os.path.isfile(ITCH_ZIP):
        print(f"[오류] itch 원본 없음: {ITCH_ZIP}")
        return 1
    with open(V0153_PCK, "rb") as pck_head:
        if pck_head.read(4) != b"GDPC":
            print("[오류] pck 매직 비정상(GDPC 아님)")
            return 1
    with zipfile.ZipFile(ITCH_ZIP) as src:
        names = src.namelist()
        if "gostop/index.html" not in names or "gostop/index.pck" not in names:
            print(f"[오류] itch zip 레이아웃 예상과 다름: {names[:5]}")
            return 1
        os.makedirs(OUT_DIR, exist_ok=True)
        stage = tempfile.mkdtemp(prefix="gostop153-")
        try:
            src.extractall(stage)
            # pck만 v0.15.3 교체 — 엔진 파일(js·wasm·html)은 md5 동일 확인済
            shutil.copyfile(V0153_PCK, os.path.join(stage, "gostop", "index.pck"))
            tmp = OUT_ZIP + ".new"
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
                root = os.path.join(stage, "gostop")
                for name in sorted(os.listdir(root)):
                    out.write(os.path.join(root, name), f"gostop/{name}")
            with zipfile.ZipFile(tmp) as probe:
                bad = probe.testzip()
                count = len(probe.namelist())
                pck_size = probe.getinfo("gostop/index.pck").file_size
            if bad is not None:
                os.remove(tmp)
                print(f"[오류] 재생성 zip 손상: {bad}")
                return 1
            os.replace(tmp, OUT_ZIP)
            print(f"[완료] {OUT_ZIP} — {count} entries, index.pck={pck_size}B, "
                  f"zip={os.path.getsize(OUT_ZIP)}B")
            return 0
        finally:
            shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
