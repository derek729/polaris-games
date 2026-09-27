#!/usr/bin/env python3
"""UE 4.9 단일 파일 패키지(.uasset) 읽기 전용 진단기.

파일 시스템에 아무것도 쓰지 않고 표준 출력으로만 구조를 덤프한다.
입력 경로는 명령줄 인자로만 받는다.
    python3 tools/ue_package_inspect.py <경로> [names|exports|imports]
"""
import struct
import sys


class Reader:
    def __init__(self, data):
        self.d = data
        self.p = 0

    def i8(self):
        v = struct.unpack_from("<b", self.d, self.p)[0]
        self.p += 1
        return v

    def u8(self):
        v = self.d[self.p]
        self.p += 1
        return v

    def u16(self):
        v = struct.unpack_from("<H", self.d, self.p)[0]
        self.p += 2
        return v

    def i32(self):
        v = struct.unpack_from("<i", self.d, self.p)[0]
        self.p += 4
        return v

    def u32(self):
        v = struct.unpack_from("<I", self.d, self.p)[0]
        self.p += 4
        return v

    def i64(self):
        v = struct.unpack_from("<q", self.d, self.p)[0]
        self.p += 8
        return v

    def f32(self):
        v = struct.unpack_from("<f", self.d, self.p)[0]
        self.p += 4
        return v

    def fstr(self):
        n = self.i32()
        if n < 0:
            s = self.d[self.p:self.p + (-n) * 2].decode("utf-16-le").rstrip("\x00")
            self.p += (-n) * 2
        elif n > 0:
            s = self.d[self.p:self.p + n].decode("latin-1").rstrip("\x00")
            self.p += n
        else:
            s = ""
        return s

    def fname(self):
        n = self.i32()
        s = self.d[self.p:self.p + n].decode("latin-1").rstrip("\x00")
        self.p += n + 4  # 문자열 + NonCase/Case 해시 4바이트
        return s


def main():
    src = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "summary"
    data = open(src, "rb").read()
    r = Reader(data)
    out = {}
    out["tag"] = f"{r.u32():08x}"
    out["legacyFileVersion"] = r.i32()
    out["legacyUE3"] = r.i32()
    out["verUE4"] = r.i32()
    out["licensee"] = r.i32()
    if out["legacyFileVersion"] <= -10:
        n = r.i32()
        out["customVersions"] = n
        for _ in range(n):
            r.p += 16
            r.i32()
            r.fstr()
    out["totalHeaderSize"] = r.i32()
    out["folder"] = r.fstr()
    out["pkgFlags"] = f"{r.u32():08x}"
    nc, no = r.i32(), r.i32()
    r.i32(), r.i32()          # gatherable text
    ec, eo = r.i32(), r.i32()
    ic, io = r.i32(), r.i32()
    dc, do = r.i32(), r.i32()
    out["names"] = f"{nc}@{no}"
    out["exports"] = f"{ec}@{eo}"
    out["imports"] = f"{ic}@{io}"
    out["depends"] = f"{dc}@{do}"
    if mode == "summary":
        print(out)
        return
    r.p = no
    names = [r.fname() for _ in range(nc)]
    if mode == "names":
        print(json_list(names))
        return
    r.p = io
    imports = []
    for _ in range(ic):
        cls_pkg = r.i32()
        cls_name = r.i32()
        outer = r.i32()
        obj = r.i32()
        imports.append((idx_name(names, cls_pkg), idx_name(names, cls_name), outer, idx_name(names, obj)))
    if mode == "imports":
        for i, t in enumerate(imports):
            print(i, t)
        return
    r.p = eo
    exports = []
    for _ in range(ec):
        cls = r.i32()
        sup = r.i32()
        tmpl = r.i32()
        outer = r.i32()
        obj = r.i32()
        flags = r.u32()
        size = r.i64() if out["legacyFileVersion"] <= -7 else r.i32()
        off = r.i64() if out["legacyFileVersion"] <= -7 else r.i32()
        exports.append((idx_name(names, cls), idx_name(names, obj), size, off))
    if mode == "exports":
        for i, t in enumerate(exports):
            print(i, t)
        return


def idx_name(names, idx):
    return names[idx] if 0 < idx < len(names) + 1 else names[-idx - 1] if -idx > 0 else "?"


def json_list(xs):
    import json
    return json.dumps(xs, ensure_ascii=False)


if __name__ == "__main__":
    main()
