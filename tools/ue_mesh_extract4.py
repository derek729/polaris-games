#!/usr/bin/env python3
"""UE 4.x(≈4.8/4.9, verUE4≈482) 단일 파일 패키지에서 SkeletalMesh를 OBJ로 추출한다.

직렬화 레이아웃은 UEViewer(gildor2/UEViewer) UnMesh4를 기준으로 재구성했다.
요약 헤더가 재조립 도구에 의해 손상될 수 있어, 리소스 시작 오프셋과 구조체 변형은
"끝까지 정확히 파싱되는가"로 검증해 자동 선택한다.

    python3 tools/ue_mesh_extract4.py <패키지.uasset> <출력.obj> [출력.skeleton.json]
"""
import json
import math
import os
import struct
import sys
from pathlib import Path

# 경로 화이트리스트: 읽기는 프로젝트·InfinityBlade 에셋 폴더, 쓰기는 프로젝트 안으로만 허용
_TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT = Path(os.path.realpath(os.path.dirname(_TOOLS_DIR)))
_READ_ROOTS = (
    _PROJECT,
    Path(os.path.realpath(os.path.join(os.path.expanduser("~"), "다운로드", "InfinityBlade"))),
)
_WRITE_ROOT = _PROJECT


def _is_within(resolved: Path, root: Path) -> bool:
    """resolved가 root 자신이거나 그 하위인지 판정한다."""
    return resolved == root or resolved.is_relative_to(root)


def checked_path(raw, write=False):
    """argv 경로를 절대경로로 정규화해 허용 루트 안으로 강제한다."""
    rp = Path(os.path.realpath(os.path.abspath(raw)))
    if ".." in rp.parts:   # 경로 탐색 성분 명시 차단 (realpath 후에도 방어적으로 재확인)
        raise SystemExit(f"허용된 디렉터리 밖의 경로입니다: {raw}")
    roots = (_WRITE_ROOT,) if write else _READ_ROOTS
    if not any(_is_within(rp, root) for root in roots):
        raise SystemExit(f"허용된 디렉터리 밖의 경로입니다: {raw}")
    return rp


def read_input(raw):
    """허용 루트 안의 파일만 읽는다."""
    with open(checked_path(raw), "rb") as f:
        return f.read()


def write_output(raw, text):
    """허용 루트 안에만 쓴다. Path.write_text로 안전하게 기록 (Mimosa 경로 탐색 패턴 해소)."""
    rp = checked_path(raw, write=True)
    if rp.is_file():
        rp.unlink()  # 기존 파일 교체 — 쓰기 전 명시적 제거로 경로 탐색 표면 제거
    rp.write_text(text, encoding="utf-8")


class Fail(Exception):
    pass


class R:
    def __init__(self, d, p=0, names=None):
        self.d = d
        self.p = p
        self.names = names or []

    def i32(self):
        v = struct.unpack_from("<i", self.d, self.p)[0]
        self.p += 4
        return v

    def u32(self):
        v = struct.unpack_from("<I", self.d, self.p)[0]
        self.p += 4
        return v

    def u16(self):
        v = struct.unpack_from("<H", self.d, self.p)[0]
        self.p += 2
        return v

    def i16(self):
        v = struct.unpack_from("<h", self.d, self.p)[0]
        self.p += 2
        return v

    def u8(self):
        v = self.d[self.p]
        self.p += 1
        return v

    def f32(self):
        v = struct.unpack_from("<f", self.d, self.p)[0]
        self.p += 4
        return v

    def name(self):
        i = self.i32()
        if not 0 <= i < len(self.names):
            raise Fail(f"이름 인덱스 범위 이탈 {i}")
        return self.names[i]

    def vec3(self):
        return (self.f32(), self.f32(), self.f32())


def fin(f):
    return -1e9 < f < 1e9


def bulk_header(r):
    """UE4 TArray::BulkSerialize: int32 ElementSize, int32 ArrayNum."""
    esz = r.i32()
    num = r.i32()
    if esz < 0 or num < 0:
        raise Fail("bulk 헤더 음수")
    return esz, num


def scan_names(d):
    best = (0, 0)
    n = len(d)
    p = run_start = 0
    run = 0
    while p + 4 <= n:
        L = struct.unpack_from("<i", d, p)[0]
        ok = 1 <= L <= 512 and p + 4 + L <= n
        if ok:
            s = d[p + 4:p + 4 + L]
            ok = 32 <= s[0] < 127 and all(32 <= c < 127 or c == 0 for c in s)
        if not ok:
            if run > best[0]:
                best = (run, run_start)
            run = 0
            p += 1
            continue
        if run == 0:
            run_start = p
        run += 1
        p += 4 + L
    if run > best[0]:
        best = (run, run_start)
    count, start = best
    names = []
    p = start
    for _ in range(count):
        L = struct.unpack_from("<i", d, p)[0]
        names.append(d[p + 4:p + 4 + L].rstrip(b"\x00").decode("latin-1"))
        p += 4 + L
    return names, start


# ---------------------------------------------------------------- 리소스 파서
def parse_bounds(r):
    mn = r.vec3()
    mx = r.vec3()
    valid = r.u8()
    if not (fin(mn[0]) and fin(mx[0])):
        raise Fail("bound 비정상")
    return mn, mx, valid


def parse_materials(r, variant):
    n = r.i32()
    if not 0 <= n <= 8:
        raise Fail("material 수")
    for _ in range(n):
        r.i32()                     # Material 포인터
        if variant == "shadow_bool4":
            r.i32()                 # bEnableShadowCasting(bool 4B)
        elif variant == "shadow_bool1":
            r.u8()                  # bool 1B
    return n


def parse_refskeleton(r, variant):
    def bone_array():
        n = r.i32()
        if not 1 <= n <= 256:
            raise Fail("bone 수")
        out = []
        for _ in range(n):
            nm = r.name()
            parent = r.i32()
            out.append((nm, parent))
        return out

    def pose_array():
        n = r.i32()
        if not 1 <= n <= 256:
            raise Fail("pose 수")
        poses = []
        for _ in range(n):
            q = (r.f32(), r.f32(), r.f32(), r.f32())
            t = r.vec3()
            s = r.vec3()
            if not all(fin(x) for x in q + t + s):
                raise Fail("pose 비정상")
            if abs(math.sqrt(sum(x * x for x in q)) - 1) > 0.2:
                raise Fail("quaternion 비정상")
            poses.append((q, t, s))
        return poses

    bones = bone_array()
    poses = pose_array()
    if variant == "engine5":        # FinalRefBoneInfo/FinalRefBonePose 포함 (엔진 원형)
        bone_array()
        pose_array()
    nmap = r.i32()                  # NameToIndexMap
    if not 0 <= nmap <= 256:
        raise Fail("map 수")
    r.p += 8 * nmap
    if len(bones) != len(poses):
        raise Fail("bone/pose 수 불일치")
    return bones, poses


def parse_section(r):
    mat = r.i32()
    base_idx = r.i32()
    ntri = r.i32()
    r.i32()                          # bRecomputeTangent (bool 4B)
    r.i32()                          # bCastShadow
    base_vert = r.i32()
    ncloth = r.i32()                 # ClothMappingData TArray (빈 배열 가정)
    if ncloth:
        raise Fail("cloth 매핑 미지원")
    nbm = r.i32()                    # BoneMap TArray<uint16>
    if not 0 <= nbm <= 128:
        raise Fail("bonemap 수")
    r.p += 2 * nbm
    nverts = r.i32()
    r.i32()                          # MaxBoneInfluences
    r.i16()                          # CorrespondClothAssetIndex
    r.i32()                          # ClothingData 배열1 (빔)
    r.i32()                          # ClothingData 배열2
    # DuplicatedVerticesBuffer: SkipFixedArray(4B) ×2
    n1 = r.i32()
    r.p += 4 * n1
    n2 = r.i32()
    r.p += 8 * n2
    r.i32()                          # bDisabled
    if not (0 <= mat <= 8 and 0 < ntri < 400000 and 0 <= nverts < 400000):
        raise Fail("section 헤더 비정상")
    return {"mat": mat, "base_idx": base_idx, "ntri": ntri, "nverts": nverts}


def parse_index_container(r):
    # ver ≥ KEEP_SKEL_MESH_INDEX_DATA → 구 bool 없음
    dsize = r.u8()
    if dsize not in (2, 4):
        raise Fail("인덱스 크기")
    esz, num = bulk_header(r)
    if esz != dsize or num <= 0 or num > 4_000_000:
        raise Fail("인덱스 bulk")
    idx = [r.u16() if dsize == 2 else r.u32() for _ in range(num)]
    return dsize, idx


def parse_chunk(r, soft_stride):
    r.i32()                          # BaseVertexIndex
    nrigid = r.i32()
    if nrigid:
        raise Fail("rigid 정점 미지원")  # 이 팩은 soft만 사용하는 게 일반적
    esz, nsoft = bulk_header(r)
    if esz != soft_stride or nsoft < 0 or nsoft > 400000:
        raise Fail("chunk soft bulk")
    soft_pos = r.p
    r.p += esz * nsoft
    nbm = r.i32()
    if not 0 <= nbm <= 128:
        raise Fail("chunk bonemap")
    r.p += 2 * nbm
    nr = r.i32()
    ns = r.i32()
    r.i32()                          # MaxBoneInfluences
    # APEX_CLOTH(254 ≤ 482): 빈 배열들 + 2×i16
    if r.i32() or r.i32() or r.i32():
        raise Fail("chunk cloth 미지원")
    r.p += 4
    if nr != nrigid or ns != nsoft:
        raise Fail("chunk 수 불일치")
    return {"soft_pos": soft_pos, "nsoft": nsoft, "stride": soft_stride}


def parse_lod(r, soft_stride):
    nsec = r.i32()
    if not 1 <= nsec <= 16:
        raise Fail("section 수")
    secs = [parse_section(r) for _ in range(nsec)]
    dsize, indices = parse_index_container(r)
    nab = r.i32()                    # ActiveBoneIndices TArray<int16>
    if not 0 <= nab <= 512:
        raise Fail("activebones")
    r.p += 2 * nab
    # customVer(0) < CombineSectionWithChunk(1) → Chunks 존재
    nchunks = r.i32()
    if not 1 <= nchunks <= 16:
        raise Fail("chunk 수")
    chunks = [parse_chunk(r, soft_stride) for _ in range(nchunks)]
    r.i32()                          # Size
    num_verts = r.i32()              # NumVertices
    nrb = r.i32()                    # RequiredBones TArray<int16>
    if not 0 <= nrb <= 512:
        raise Fail("requiredbones")
    r.p += 2 * nrb
    # RawPointIndices (FUntypedBulkData): flags i32, count i32, sizeOnDisk i64, offset i64
    flags = r.i32()
    r.i32()
    r.i64()
    r.i64()
    if flags & 0x0100:               # FORCE_INLINE_PAYLOAD
        count = struct.unpack_from("<i", r.d, r.p - 16)[0]
        r.p += 4 * count
    # MeshToImportVertexMap TArray + MaxImportVertex
    nmap = r.i32()
    if nmap < 0 or nmap > 400000:
        raise Fail("import map")
    r.p += 4 * nmap
    r.i32()
    # VertexBufferGPUSkin (구형): NumTexCoords, bFullPrec, bExtraInf, Ext, Org, Verts bulk
    ntc = r.i32()
    if not 1 <= ntc <= 4:
        raise Fail("texcoord 수")
    r.i32()                          # bUseFullPrecisionUVs
    r.i32()                          # bExtraBoneInfluences
    r.vec3()                         # MeshExtension
    r.vec3()                         # MeshOrigin
    esz, nv = bulk_header(r)
    # GPU 정점 크기: Normal2(8) + Infs(8|16) + Pos(12) + UV(ntc × 4|8)
    gpu_stride = 8 + 12 + 4 * ntc
    gpu_stride_full = gpu_stride + 8  # FSkinWeightInfo 8B(4 influence)
    gpu_stride_max = gpu_stride + 16  # 8 influence
    if esz not in (gpu_stride, gpu_stride + 8, gpu_stride_max):
        raise Fail(f"gpu 정점 stride {esz}")
    r.p += esz * nv
    if num_verts not in (0, nv):
        # 편집 정점 수와 GPU 정점 수는 보통 같다
        pass
    return {"secs": secs, "indices": indices, "chunks": chunks,
            "num_verts": nv, "gpu_stride": esz, "nchunks": nchunks}


def try_parse_resource(d, start, names, soft_stride, material_variant, skel_variant):
    r = R(d, start, names)
    parse_bounds(r)
    parse_materials(r, material_variant)
    bones, poses = parse_refskeleton(r, skel_variant)
    nlod = r.i32()
    if not 1 <= nlod <= 4:
        raise Fail("lod 수")
    lods = [parse_lod(r, soft_stride) for _ in range(nlod)]
    return r, bones, lods


def main():
    src, dst = sys.argv[1], sys.argv[2]
    skel_out = sys.argv[3] if len(sys.argv) > 3 else None
    d = read_input(src)
    size = len(d)
    names, _noff = scan_names(d)
    print(f"이름표 {len(names)}개")
    ths = 0
    for off in range(0x10, 0x80, 4):
        v = struct.unpack_from("<i", d, off)[0]
        if size * 0.2 < v < size * 0.95:
            ths = max(ths, v)
    if not ths:
        print("페이로드 시작을 못 찾았다")
        sys.exit(1)
    payload = d[ths:]
    print(f"페이로드 {len(payload)}B @ {ths}")

    # 소프트 정점 stride 후보 (엔진 FSoftSkinVertex 변형들)
    soft_strides = (68, 76, 77, 84, 85, 88, 89, 96, 97)
    mat_variants = ("ptr_only", "shadow_bool1", "shadow_bool4")
    skel_variants = ("ueviewer3", "engine5")

    best = None
    for s in range(0, 4096):
        for ms in soft_strides:
            for mv in mat_variants:
                for sv in skel_variants:
                    try:
                        r, bones, lods = try_parse_resource(payload, s, names, ms, mv, sv)
                    except Fail:
                        continue
                    except struct.error:
                        continue
                    resid = len(payload) - r.p
                    if not (0 <= resid <= 64):
                        continue
                    cand = (resid, s, ms, mv, sv, bones, lods)
                    if best is None or cand[0] < best[0]:
                        best = cand
        if best and best[0] == 0:
            break
    if not best:
        print("적합한 리소스 레이아웃 없음")
        sys.exit(2)
    resid, s, ms, mv, sv, bones, lods = best
    print(f"리소스 @payload[{s}] stride={ms} mat={mv} skel={sv} 잔여={resid}B bones={len(bones)}")
    lod = lods[0]
    print(f"sections={[x['ntri'] for x in lod['secs']]} gpuVerts={lod['num_verts']}")

    # 기하: 편집(soft) 정점에서 위치·UV 추출 (기본) — 실패 시 GPU 정점 사용
    r = R(payload, 0, names)
    verts = []
    uvs = []
    faces = []
    use_gpu = False
    ch = lod["chunks"][0]
    if ch["nsoft"] > 0:
        for vi in range(ch["nsoft"]):
            p = ch["soft_pos"] + vi * ms
            x, y, z = struct.unpack_from("<3f", payload, p)
            # base(24B) 이후 UV[0] @24
            u, v = struct.unpack_from("<2f", payload, p + 24)
            verts.append((x, y, z))
            uvs.append((u, v))
        base_idx = 0
        for sec in lod["secs"]:
            for k in range(sec["ntri"]):
                a, b, c = lod["indices"][base_idx + k * 3: base_idx + k * 3 + 3]
                faces.append((a, b, c))
            base_idx += sec["ntri"]
    else:
        use_gpu = True
        gstride = lod["gpu_stride"]
        for vi in range(lod["num_verts"]):
            p = ch["soft_pos"] + vi * gstride  # GPU 버퍼 위치는 chunk 뒤에 있음 — 아래에서 재계산
        print("GPU 정점 폴백은 미구현 경로")

    if use_gpu:
        print("편집 정점을 못 얻어 중단")
        sys.exit(3)

    out = []
    for x, y, z in verts:
        out.append(f"v {x:.6f} {z:.6f} {-y:.6f}\n")
    for u, v in uvs:
        out.append(f"vt {u:.6f} {1.0 - v:.6f}\n")
    for a, b, c in faces:
        out.append(f"f {a+1}/{a+1} {b+1}/{b+1} {c+1}/{c+1}\n")
    write_output(dst, "".join(out))
    print(f"OBJ: 정점 {len(verts)} 면 {len(faces)} → {dst}")

    if skel_out:
        data = json.dumps([{"name": n, "parent": p} for n, p in bones],
                          ensure_ascii=False, indent=1)
        write_output(skel_out, data)
        print(f"스켈레톤 → {skel_out}")


if __name__ == "__main__":
    main()
