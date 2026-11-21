#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""뱀파이어 키우기 — 부족 스프라이트 자체 제작 (PIL 픽셀아트).

기존 AI 생성 스프라이트(game-assets/vampire-survivors/*.png)와 동일 규격으로
누락 에셋을 채운다: 늑대·골렘·나무정령·유령(64x64), 코인·자석·폭탄·촛대(32x32),
게임 파비콘/애플터치 아이콘(64/180).

규격은 art_lint §6-2·§6-3 준수: 256색 팔레트 모드, 외곽 1px 투명, 작은 용량.
실행: python3 game-assets/gen_vs_sprites.py
"""
from PIL import Image
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vampire-survivors")
OUTLINE = (26, 20, 38, 255)  # 게임 치비 드로잉과 같은 다크 아웃라인 (#1a1426)


def canvas(n):
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    return im


def px(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((int(x), int(y)), c)


def disc(im, cx, cy, r, c):
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                px(im, x, y, c)


def ring_arc(im, cx, cy, r_in, r_out, c, skip=None):
    """두께 있는 고리. skip(a0,a1): 라디안 구간(중심각)을 비운다(자석 U자 등)."""
    for y in range(int(cy - r_out) - 1, int(cy + r_out) + 2):
        for x in range(int(cx - r_out) - 1, int(cx + r_out) + 2):
            d = math.hypot(x - cx, y - cy)
            if r_in <= d <= r_out:
                if skip is not None:
                    a = math.atan2(y - cy, x - cx)  # -pi..pi, 아래=+pi/2
                    if skip(a):
                        continue
                px(im, x, y, c)


def rrect(im, x0, y0, x1, y1, c, r=0):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if r:
                dx = min(x - x0, x1 - x)
                dy = min(y - y0, y1 - y)
                if dx < r and dy < r and (r - dx) ** 2 + (r - dy) ** 2 > r * r:
                    continue
            px(im, x, y, c)


def hline(im, x0, x1, y, c):
    for x in range(x0, x1 + 1):
        px(im, x, y, c)


def vline(im, x, y0, y1, c):
    for y in range(y0, y1 + 1):
        px(im, x, y, c)


def auto_outline(im, col=OUTLINE):
    """불투명 픽셀의 4방향 빈 이웃을 외곽선으로 칠한다(1px 성장)."""
    src = im.load()
    edits = []
    for y in range(im.height):
        for x in range(im.width):
            if src[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < im.width and 0 <= ny < im.height and src[nx, ny][3] > 0:
                    edits.append((x, y))
                    break
    for x, y in edits:
        src[x, y] = col


def save(im, name):
    assert im.width >= 3 and im.height >= 3
    # 외곽 1px는 항상 투명(art_lint ②) — 본체를 2px 안쪽에 그렸으므로 안전망으로 가장자리 클리어
    src = im.load()
    for i in range(im.width):
        src[i, 0] = src[i, im.height - 1] = (0, 0, 0, 0)
    for j in range(im.height):
        src[0, j] = src[im.width - 1, j] = (0, 0, 0, 0)
    q = im.quantize(colors=255, method=Image.FASTOCTREE)  # 256색 팔레트(art_lint ④)
    path = os.path.join(OUT, name)
    q.save(path, optimize=True)
    print("saved", path, q.size, os.path.getsize(path), "bytes")


# ---------------- 32x32 아이템 ----------------
def coin():
    im = canvas(32)
    disc(im, 16, 16, 11, (198, 146, 20))   # 테두리 톤
    disc(im, 16, 16, 9, (247, 201, 93))    # 몸체
    disc(im, 13, 13, 3, (255, 232, 150))   # 광택
    disc(im, 20, 20, 1, (222, 170, 40))    # 음영
    for a in range(-40, 220, 8):           # 내부 원형 홈
        x = 16 + round(6 * math.cos(math.radians(a)))
        y = 16 + round(6 * math.sin(math.radians(a)))
        px(im, x, y, (222, 170, 40))
    auto_outline(im)
    save(im, "item-coin.png")


def magnet():
    im = canvas(32)
    red = (232, 58, 58)
    red_d = (180, 34, 34)
    # U자 (아래가 열림) — 아래 중앙 각도 구간을 비움
    ring_arc(im, 16, 14, 7, 12, red, skip=lambda a: 0.9 < a < 2.24)
    # 다리 끝 은색 극
    rrect(im, 5, 19, 10, 25, (210, 216, 228))
    rrect(im, 22, 19, 27, 25, (210, 216, 228))
    vline(im, 7, 19, 25, (170, 176, 190)); vline(im, 24, 19, 25, (170, 176, 190))
    disc(im, 12, 8, 2, (255, 255, 255, 180))  # 광택
    auto_outline(im)
    save(im, "item-magnet.png")


def bomb():
    im = canvas(32)
    disc(im, 16, 20, 9, (46, 44, 60))      # 몸체
    disc(im, 12, 16, 3, (96, 94, 118))     # 하이라이트
    rrect(im, 13, 8, 19, 12, (96, 96, 110))  # 심지 고정캡
    # 휘어진 심지
    fuse = [(18, 7), (20, 5), (23, 4), (25, 5)]
    for i, (x, y) in enumerate(fuse):
        px(im, x, y, (150, 110, 70))
        px(im, x, y + 1, (110, 80, 50))
    disc(im, 26, 4, 2, (255, 160, 60))     # 불꽃
    disc(im, 26, 4, 1, (255, 232, 130))
    auto_outline(im)
    save(im, "item-bomb.png")


def candle():
    im = canvas(32)
    # 불꽃 (몸체보다 위)
    disc(im, 16, 6, 3, (255, 150, 50))
    disc(im, 16, 6, 1, (255, 232, 130))
    vline(im, 16, 10, 11, (90, 70, 50))    # 심지
    rrect(im, 11, 12, 20, 26, (245, 235, 205), r=2)  # 몸체
    hline(im, 12, 19, 16, (255, 248, 228))  # 흐른 밀랍
    vline(im, 13, 17, 20, (255, 248, 228))
    rrect(im, 10, 25, 21, 28, (232, 216, 178), r=1)  # 받침
    auto_outline(im)
    save(im, "prop-candle.png")


# ---------------- 64x64 몬스터 ----------------
W_BODY = (154, 162, 178); W_DK = (118, 126, 146); W_LT = (198, 206, 222)

def wolf():
    im = canvas(64)
    # 꼬리 (뒤 왼쪽)
    for i, (x, y) in enumerate([(6, 26), (5, 22), (6, 18), (9, 15), (12, 14), (14, 16), (15, 20)]):
        disc(im, x, y, 3, W_DK)
    # 몸통
    disc(im, 28, 40, 13, W_BODY)
    rrect(im, 15, 34, 42, 50, W_BODY, r=6)
    disc(im, 28, 46, 9, W_LT)              # 배
    # 다리 4개
    for x in (20, 27, 36, 43):
        rrect(im, x, 48, x + 4, 58, W_DK, r=1)
        px(im, x + 2, 57, (232, 200, 180))  # 발톱
    # 머리 (오른쪽)
    disc(im, 45, 26, 11, W_BODY)
    rrect(im, 48, 22, 61, 30, W_BODY, r=3)  # 주둥이
    disc(im, 59, 27, 2, (40, 36, 50))       # 코
    # 귀
    for ex in (38, 50):
        for i in range(7):
            hline(im, ex + i // 2, ex + 6 - i // 2, 9 + i, W_BODY)
    px(im, 40, 11, W_DK); px(im, 52, 11, W_DK)
    # 눈 (붉은 빛)
    disc(im, 48, 24, 2, (232, 72, 72))
    px(im, 48, 23, (255, 160, 140))
    # 입
    px(im, 55, 31, OUTLINE); px(im, 56, 31, OUTLINE)
    auto_outline(im)
    save(im, "enemy-wolf.png")


def golem():
    im = canvas(64)
    stone = (120, 116, 140); stone_lt = (142, 138, 164); stone_dk = (94, 90, 114)
    # 팔
    rrect(im, 4, 26, 13, 48, stone_dk, r=4)
    rrect(im, 51, 26, 60, 48, stone_dk, r=4)
    # 몸통
    rrect(im, 14, 20, 50, 60, stone, r=6)
    # 머리 바위
    rrect(im, 20, 4, 44, 24, stone_lt, r=5)
    # 이끼
    disc(im, 26, 6, 3, (95, 168, 86)); disc(im, 38, 7, 2, (95, 168, 86))
    disc(im, 32, 4, 2, (110, 186, 98))
    # 균열
    vline(im, 22, 34, 44, stone_dk); hline(im, 22, 28, 44, stone_dk)
    vline(im, 44, 30, 40, stone_dk)
    # 발광 눈
    rrect(im, 26, 12, 29, 19, (120, 240, 255), r=1)
    rrect(im, 36, 12, 39, 19, (120, 240, 255), r=1)
    px(im, 27, 13, (220, 255, 255)); px(im, 37, 13, (220, 255, 255))
    hline(im, 28, 38, 30, stone_dk)  # 무표정 입
    auto_outline(im)
    save(im, "enemy-golem.png")


def stump():
    im = canvas(64)
    trunk = (168, 132, 90); trunk_dk = (132, 100, 64); top = (206, 170, 122)
    # 뿌리
    for x0, y0, x1 in ((12, 60, 22), (44, 60, 54)):
        for i in range(6):
            hline(im, x0 + i, x1 - i, y0 - i, trunk_dk)
    # 몸통
    rrect(im, 16, 20, 48, 58, trunk, r=4)
    vline(im, 22, 26, 54, trunk_dk); vline(im, 42, 28, 56, trunk_dk)
    # 절단면(나이테)
    disc(im, 32, 20, 16, top)
    ring_arc(im, 32, 20, 8, 10, (150, 116, 74), skip=None)
    ring_arc(im, 32, 20, 3, 5, (150, 116, 74), skip=None)
    # 새싹
    vline(im, 34, 4, 10, (74, 138, 58))
    disc(im, 37, 5, 3, (95, 174, 74))
    # 얼굴
    disc(im, 26, 38, 3, (40, 32, 46)); disc(im, 40, 38, 3, (40, 32, 46))
    px(im, 25, 37, (255, 255, 255)); px(im, 39, 37, (255, 255, 255))
    for x in (32, 33, 34):
        px(im, x, 48, OUTLINE)
    auto_outline(im)
    save(im, "enemy-stump.png")


def ghost():
    im = canvas(64)
    g = (238, 242, 250); g_sh = (214, 222, 240)
    disc(im, 32, 24, 18, g)
    rrect(im, 14, 24, 50, 46, g, r=6)
    # 물결 치맛단 (아래를 파고들어 지우기)
    for i, (x0, y0, x1, y1) in enumerate([(14, 46, 20, 56), (22, 42, 28, 52), (30, 46, 36, 58), (38, 42, 44, 52), (46, 46, 50, 54)]):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                px(im, x, y, (0, 0, 0, 0))
    # 얼굴
    disc(im, 24, 24, 4, (40, 32, 58)); disc(im, 40, 24, 4, (40, 32, 58))
    px(im, 23, 22, (255, 255, 255)); px(im, 39, 22, (255, 255, 255))
    disc(im, 18, 30, 2, (255, 150, 160))  # 볼터치
    disc(im, 46, 30, 2, (255, 150, 160))
    for x in (30, 31, 32, 33):
        px(im, x, 34, OUTLINE)
    auto_outline(im)
    save(im, "enemy-ghost.png")


# ---------------- 아이콘 (파비콘/애플터치) ----------------
def vampire_icon(n):
    im = canvas(n)
    s = n / 64.0
    # 망토 (아래 좌우)
    disc(im, 32 * s, 46 * s, 20 * s, (122, 31, 43))
    rrect(im, int(6 * s), int(40 * s), int(58 * s), int(62 * s), (122, 31, 43), r=6)
    # 얼굴
    disc(im, 32 * s, 32 * s, 18 * s, (240, 220, 200))
    # 머리카락 (앞머리 V컷)
    disc(im, 32 * s, 20 * s, 18 * s, (42, 32, 51))
    for i in range(int(10 * s)):
        y = int(28 * s) + int(i * 1.2 * s)
        w = int((10 - i) * 1.4 * s) + int(2 * s)
        hline(im, int(32 * s) - w, int(32 * s) + w, y, (42, 32, 51))
    # 눈 (붉은빛)
    disc(im, 24 * s, 34 * s, 3 * s, (200, 40, 40))
    disc(im, 40 * s, 34 * s, 3 * s, (200, 40, 40))
    px(im, int(24 * s), int(33 * s), (255, 200, 200))
    px(im, int(40 * s), int(33 * s), (255, 200, 200))
    # 송곳니
    fw = max(1, int(2 * s))
    for fx in (int(26 * s), int(37 * s)):
        rrect(im, fx, int(41 * s), fx + fw, int(46 * s), (255, 255, 255))
    auto_outline(im)
    save(im, f"icon-vampire-{n}.png")


if __name__ == "__main__":
    coin(); magnet(); bomb(); candle()
    wolf(); golem(); stump(); ghost()
    vampire_icon(64); vampire_icon(180)
    print("done")
