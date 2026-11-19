#!/usr/bin/env python3
"""Aurora 치장품 생성기

치장품의 3D 모양(상자 목록), 애니메이션, 픽셀 텍스처를 한 곳에서 정의하고
게임 모드와 런처 미리보기가 함께 쓰는 cosmetics.json + PNG 텍스처를 만듭니다.

좌표계는 Minecraft 엔티티 모델과 같습니다 (단위 = 1/16 블록 = 1픽셀).
  x: 좌우, y: 아래쪽이 +, z: 앞쪽이 -  (등 쪽이 +)
  머리(head) 뼈: 목이 원점, 머리는 y -8..0
  몸통(body) 뼈: 목이 원점, 몸통은 y 0..12, 등 표면은 z=+2

텍스처는 모델 1단위당 S 텍셀 (기본 스킨의 2배 해상도).
각 상자의 텍스처 배치(전개도):
  위   (u+D, v)       W x D      아래 (u+D+W, v)    W x D
  서쪽 (u, v+D)       D x H      앞   (u+D, v+D)    W x H
  동쪽 (u+D+W, v+D)   D x H      뒤   (u+2D+W, v+D) W x H
"""
import base64
import json
import math
import os
import random
import sys

from PIL import Image

S = 2  # 텍셀 / 모델 단위

OUT_MOD = sys.argv[1] if len(sys.argv) > 1 else 'out/mod'
OUT_LAUNCHER = sys.argv[2] if len(sys.argv) > 2 else 'out/launcher'


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(4))


def shade(c, f):
    return tuple(max(0, min(255, int(c[i] * f))) for i in range(3)) + (c[3],)


# ───────────────────────── 재질 (텍스처를 칠하는 함수) ─────────────────────────
# paint(img, x, y, w, h, face, rnd) : face 영역 하나를 칠함

def mat_noise(base, var=0.06, top=None, edge=0.86):
    """기본 재질: 잡티 + 가장자리 어둡게 + 윗면 밝게"""
    def paint(img, x0, y0, w, h, face, rnd):
        b = top if (top and face == 'up') else base
        for j in range(h):
            for i in range(w):
                f = 1 + (rnd.random() - 0.5) * 2 * var
                if i == 0 or j == 0 or i == w - 1 or j == h - 1:
                    f *= edge
                img.putpixel((x0 + i, y0 + j), shade(b, f))
    return paint


def mat_vgrad(c_top, c_bot, var=0.04, edge=0.9, up=None):
    def paint(img, x0, y0, w, h, face, rnd):
        for j in range(h):
            t = j / max(1, h - 1)
            c = up if (up and face in ('up', 'down')) else mix(c_top, c_bot, t)
            for i in range(w):
                f = 1 + (rnd.random() - 0.5) * 2 * var
                if i == 0 or i == w - 1 or j == 0 or j == h - 1:
                    f *= edge
                img.putpixel((x0 + i, y0 + j), shade(c, f))
    return paint


def mat_gold():
    hi, mid, lo = hexc('#fff1a8'), hexc('#f2c14e'), hexc('#a8761c')
    def paint(img, x0, y0, w, h, face, rnd):
        for j in range(h):
            for i in range(w):
                t = j / max(1, h - 1)
                c = mix(hi, mid, min(1, t * 1.6)) if face != 'down' else lo
                if face == 'up':
                    c = mix(hi, mid, 0.3)
                if j == h - 1 or i == w - 1:
                    c = mix(c, lo, 0.7)
                if (i + j * 3) % 7 == 0 and rnd.random() < 0.5:
                    c = mix(c, hi, 0.6)
                img.putpixel((x0 + i, y0 + j), c)
    return paint


def mat_gem(core, glow):
    def paint(img, x0, y0, w, h, face, rnd):
        for j in range(h):
            for i in range(w):
                d = abs(i - (w - 1) / 2) / max(1, w / 2) + abs(j - (h - 1) / 2) / max(1, h / 2)
                c = mix(glow, core, min(1, d))
                if i == 0 and j == 0:
                    c = hexc('#ffffff')
                img.putpixel((x0 + i, y0 + j), c)
    return paint


def mat_feather(base, shadow, rim):
    """깃털: 세로 줄무늬(깃대) + 아래로 갈수록 그림자 + 테두리"""
    def paint(img, x0, y0, w, h, face, rnd):
        for j in range(h):
            for i in range(w):
                t = j / max(1, h - 1)
                c = mix(base, shadow, t * 0.55)
                if face in ('north', 'south'):
                    if i % 4 == 0:
                        c = mix(c, shadow, 0.45)  # 깃대
                    if (j + (i // 4) * 2) % 6 == 0:
                        c = mix(c, rim, 0.35)  # 깃털 결
                    if j >= h - 2 and (i % 4) in (1, 2):
                        c = mix(c, rim, 0.7)  # 깃털 끝
                if i == 0 or i == w - 1:
                    c = mix(c, shadow, 0.3)
                c = shade(c, 1 + (rnd.random() - 0.5) * 0.05)
                img.putpixel((x0 + i, y0 + j), c)
    return paint


def mat_membrane(base, dark, vein):
    def paint(img, x0, y0, w, h, face, rnd):
        for j in range(h):
            for i in range(w):
                t = j / max(1, h - 1)
                c = mix(base, dark, t * 0.7)
                if face in ('north', 'south') and (i % 6 == 0 or (i + j) % 11 == 0):
                    c = mix(c, vein, 0.5)
                c = shade(c, 1 + (rnd.random() - 0.5) * 0.08)
                img.putpixel((x0 + i, y0 + j), c)
    return paint


def mat_fur(base, under, var=0.12, streak=None):
    def paint(img, x0, y0, w, h, face, rnd):
        for j in range(h):
            for i in range(w):
                c = under if face == 'down' else base
                if streak and (i + rnd.randint(0, 1)) % 3 == 0:
                    c = mix(c, streak, 0.35)
                c = shade(c, 1 + (rnd.random() - 0.5) * 2 * var)
                img.putpixel((x0 + i, y0 + j), c)
    return paint


def with_detail(paint, detail):
    """기본 재질 위에 특정 면에만 장식을 덧칠"""
    def p(img, x0, y0, w, h, face, rnd):
        paint(img, x0, y0, w, h, face, rnd)
        detail(img, x0, y0, w, h, face, rnd)
    return p


# ───────────────────────── 모델 정의 ─────────────────────────

def cube(frm, size, mat):
    return {'from': list(frm), 'size': list(size), 'mat': mat}


def part(cubes, pivot=(0, 0, 0), rot=(0, 0, 0), anims=None, glow=False):
    return {'pivot': list(pivot), 'rot': list(rot), 'anims': anims or [], 'glow': glow, 'cubes': cubes}


def mirror_part(p):
    """오른쪽 부품을 왼쪽으로 뒤집기 (x 반전)"""
    q = json.loads(json.dumps({k: v for k, v in p.items() if k not in ('cubes', 'children')}))
    q['pivot'][0] = -q['pivot'][0]
    q['rot'][1] = -q['rot'][1]
    q['rot'][2] = -q['rot'][2]
    for a in q['anims']:
        if a.get('axis') in ('y', 'z'):
            a['side'] = -a.get('side', 1)
    q['cubes'] = []
    for c in p['cubes']:
        x, y, z = c['from']
        w, h, d = c['size']
        q['cubes'].append({'from': [-(x + w), y, z], 'size': [w, h, d], 'mat': c['mat']})
    return q


def mirror_part_deep(p):
    q = mirror_part(p)
    q['children'] = [mirror_part_deep(c) for c in p.get('children', [])]
    return q


def buckle(color='#f2c14e'):
    g = hexc(color)
    def d(img, x0, y0, w, h, face, rnd):
        if face != 'north':
            return
        cx = x0 + w // 2 - 2
        for j in range(h):
            for i in range(4):
                if i in (0, 3) or j in (0, h - 1):
                    img.putpixel((cx + i, y0 + j), g)
    return d


def star(color='#ffe27a'):
    g = hexc(color)
    def d(img, x0, y0, w, h, face, rnd):
        if face != 'north':
            return
        cx, cy = x0 + w // 2, y0 + h // 2
        for dx, dy in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
            if 0 <= cx + dx - x0 < w and 0 <= cy + dy - y0 < h:
                img.putpixel((cx + dx, cy + dy), g)
    return d


def items():
    out = []

    # 실크햇 ─ 검은 펠트, 빨간 띠, 금 버클
    felt = mat_noise(hexc('#25232f'), 0.05, top=hexc('#34313f'))
    band = with_detail(mat_vgrad(hexc('#c8283f'), hexc('#8e1428')), buckle())
    out.append({
        'id': 'tophat', 'name': '실크햇', 'slot': 'hat', 'bone': 'head',
        'parts': [part([
            cube((-5.5, -8.75, -5.5), (11, 1, 11), mat_noise(hexc('#1e1c27'), 0.05, top=hexc('#2c2a36'))),
            cube((-4, -15.5, -4), (8, 5.25, 8), felt),
            cube((-4.25, -10.5, -4.25), (8.5, 1.75, 8.5), band),
        ])],
    })

    # 왕관 ─ 금 테 + 네 면 가운데 높은 뾰족 + 모서리 작은 뾰족 + 끝 구슬, 테두리 보석(빛남)
    g = mat_gold()
    crown_cubes = [cube((-4.5, -10, -4.5), (9, 2.25, 9), g)]
    gems = []
    # 네 면 가운데와 네 모서리에 계단식으로 좁아지는 뾰족 장식
    steps = [(2.0, 1.25), (1.3, 1.0), (0.7, 0.9)]
    spots = [(0, -4.5, 'z'), (0, 3.75, 'z'), (-4.5, 0, 'x'), (3.75, 0, 'x')]
    for cx, cz, ax in spots:
        y = -10
        for w, h in steps:
            if ax == 'z':
                crown_cubes.append(cube((cx - w / 2, y - h, cz), (w, h, 0.75), g))
            else:
                crown_cubes.append(cube((cz if False else cx, y - h, -w / 2), (0.75, h, w), g))
            y -= h
    for cx, cz in [(-4.5, -4.5), (3.5, -4.5), (-4.5, 3.5), (3.5, 3.5)]:
        crown_cubes.append(cube((cx, -11.25, cz), (1, 1.25, 1), g))
    gem_r = mat_gem(hexc('#b81d3a'), hexc('#ff6a85'))
    gem_t = mat_gem(hexc('#127e6b'), hexc('#5dffd9'))
    gem_b = mat_gem(hexc('#2d4fd1'), hexc('#8fb0ff'))
    for off, m in [(-2.6, gem_t), (0, gem_r), (2.6, gem_b)]:
        gems.append(cube((off - 0.6, -9.5, -4.85), (1.2, 1.2, 0.4), m))
        gems.append(cube((off - 0.6, -9.5, 4.45), (1.2, 1.2, 0.4), m))
    gems.append(cube((-4.85, -9.5, -0.6), (0.4, 1.2, 1.2), gem_r))
    gems.append(cube((4.45, -9.5, -0.6), (0.4, 1.2, 1.2), gem_r))
    out.append({
        'id': 'crown', 'name': '왕관', 'slot': 'hat', 'bone': 'head',
        'parts': [part(crown_cubes), part(gems, glow=True)],
    })

    # 마법사 모자 ─ 휘어진 원뿔 + 별 장식
    purple = mat_vgrad(hexc('#5b34a6'), hexc('#3a1f73'), up=hexc('#4a2a8c'))
    out.append({
        'id': 'wizard', 'name': '마법사 모자', 'slot': 'hat', 'bone': 'head',
        'parts': [
            part([
                cube((-6.5, -8.75, -6.5), (13, 1, 13), mat_noise(hexc('#3a1f73'), 0.05, top=hexc('#4b2a8f'))),
                cube((-4.25, -11, -4.25), (8.5, 2.25, 8.5), with_detail(mat_vgrad(hexc('#f2c14e'), hexc('#c48d23')), star('#fff6c8'))),
                cube((-3.5, -13.25, -3.25), (7, 2.25, 7), purple),
            ]),
            part([cube((-2.5, -2.25, -2.5), (5, 2.25, 5), purple)], pivot=(0, -13.25, 0.75), rot=(-0.18, 0, 0),
                 anims=[{'type': 'sway', 'axis': 'x', 'amp': 0.05, 'speed': 0.06}]),
            part([cube((-1.5, -2, -1.5), (3, 2, 3), purple)], pivot=(0, -15.25, 1.7), rot=(-0.42, 0, 0),
                 anims=[{'type': 'sway', 'axis': 'x', 'amp': 0.08, 'speed': 0.06, 'phase': 0.6}]),
            part([cube((-0.75, -1.75, -0.75), (1.5, 1.75, 1.5), with_detail(purple, star('#ffe27a')))], pivot=(0, -16.6, 3.0), rot=(-0.85, 0, 0),
                 anims=[{'type': 'sway', 'axis': 'x', 'amp': 0.12, 'speed': 0.06, 'phase': 1.2}]),
        ],
    })

    # 고양이 귀 ─ 아래가 넓은 삼각형 귀 + 안쪽 분홍 + 끝 짙은 털, 가끔 쫑긋
    fur = mat_fur(hexc('#2f2a33'), hexc('#24202a'), 0.08)
    fur_tip = mat_fur(hexc('#1c1920'), hexc('#1c1920'), 0.06)
    pink = mat_noise(hexc('#f29ab3'), 0.06, edge=0.95)
    ear = part([
        cube((-1.75, -1.25, -0.6), (3.5, 1.25, 1.2), fur),
        cube((-1.25, -2.5, -0.5), (2.5, 1.25, 1.0), fur),
        cube((-0.75, -3.5, -0.4), (1.5, 1.0, 0.8), fur),
        cube((-0.25, -4.25, -0.3), (0.75, 0.75, 0.6), fur_tip),
        cube((-1.0, -2.25, -0.75), (2.0, 2.0, 0.2), pink),
        cube((-0.5, -3.25, -0.65), (1.0, 1.0, 0.2), pink),
    ], pivot=(2.75, -8, -0.25), rot=(-0.1, 0.15, 0.28), anims=[{'type': 'twitch', 'axis': 'z', 'amp': 0.25, 'speed': 0.045, 'side': 1}])
    out.append({'id': 'cat_ears', 'name': '고양이 귀', 'slot': 'ears', 'bone': 'head', 'parts': [ear, mirror_part_deep(ear)]})

    # 후광 ─ 머리 위에서 천천히 돌며 떠 있음 (빛남)
    halo_mat = mat_vgrad(hexc('#fff8cf'), hexc('#ffd65a'), 0.02, edge=0.96)
    segs = []
    n = 10
    for i in range(n):
        a = 2 * math.pi * i / n
        segs.append(part([cube((-1.35, -0.35, -4.3), (2.7, 0.7, 0.7), halo_mat)], rot=(0, a, 0)))
    halo = {'pivot': [0, -13, 0], 'rot': [0, 0, 0], 'glow': True,
            'anims': [{'type': 'spin', 'speed': 0.03}, {'type': 'bob', 'amp': 0.5, 'speed': 0.08}], 'children': segs, 'cubes': []}
    out.append({'id': 'halo', 'name': '후광', 'slot': 'halo', 'bone': 'head', 'parts': [halo]})

    # 천사 날개 ─ 위로 휜 날개뼈 + 부채꼴로 펼쳐진 긴 깃털, 펄럭임
    covert = mat_feather(hexc('#ffffff'), hexc('#f1f3fa'), hexc('#dfe5f4'))
    plume = mat_feather(hexc('#ffffff'), hexc('#e6edfc'), hexc('#c4d3f5'))
    plume2 = mat_feather(hexc('#fdfdff'), hexc('#dde6fa'), hexc('#b9caf2'))

    def feathers(xs, lens, top=-0.5, z=0.35):
        res = []
        for i, (x, L) in enumerate(zip(xs, lens)):
            res.append(part([cube((-1.2, 0, 0), (2.4, L, 0.6), plume if i % 2 == 0 else plume2)],
                            pivot=(x, top, z), rot=(0, 0, 0.05 * i)))
        return res

    inner = part([cube((0, -2.25, 0), (7.5, 3.25, 1.3), covert)] , pivot=(0, 0, 0))
    inner['children'] = feathers([1.4, 3.6, 5.8], [8, 9.5, 11])
    outer = part([cube((0, -1.75, 0.1), (8.5, 2.5, 1.1), covert)], pivot=(7.2, -0.6, 0), rot=(0, 0, -0.38))
    outer['children'] = feathers([1.2, 3.4, 5.6, 7.6], [11.5, 12, 11, 9])
    inner['children'].append(outer)
    wing = {'pivot': [1.0, 1.25, 2.2], 'rot': [0.12, -0.62, 0.22], 'glow': False, 'scale': 1.35,
            'anims': [{'type': 'flap', 'axis': 'y', 'amp': 0.26, 'speed': 0.11, 'side': 1}], 'cubes': [], 'children': [inner]}
    out.append({'id': 'angel_wings', 'name': '천사 날개', 'slot': 'back', 'bone': 'body', 'parts': [wing, mirror_part_deep(wing)]})

    # 악마 날개 ─ 뼈대 + 막
    bone_m = mat_noise(hexc('#2b1622'), 0.06, top=hexc('#3c1f2f'))
    memb = mat_membrane(hexc('#7a1f3d'), hexc('#3a0d20'), hexc('#b04066'))
    dwing = part([
        cube((0, -1, 0), (12, 1.25, 1.25), bone_m),
        cube((11.25, -2, 0.25), (1.25, 1.5, 0.75), mat_noise(hexc('#e8e0d0'), 0.05)),
        cube((0.5, 0.25, 0.5), (3.5, 8.5, 0.35), memb),
        cube((4, 0.25, 0.5), (3.5, 7, 0.35), memb),
        cube((7.5, 0.25, 0.5), (3, 5.5, 0.35), memb),
        cube((10.5, 0.25, 0.5), (1.5, 3.5, 0.35), memb),
        cube((3.6, 0, 0.4), (0.6, 8, 0.5), bone_m),
        cube((7.2, 0, 0.4), (0.6, 6.5, 0.5), bone_m),
    ], pivot=(1.25, 2, 2.25), rot=(0.1, -0.5, -0.32),
        anims=[{'type': 'flap', 'axis': 'y', 'amp': 0.22, 'speed': 0.09, 'side': 1}])
    dwing['scale'] = 1.25
    out.append({'id': 'demon_wings', 'name': '악마 날개', 'slot': 'back', 'bone': 'body', 'parts': [dwing, mirror_part_deep(dwing)]})

    # 여우 꼬리 ─ 세 마디가 흔들림
    orange = mat_fur(hexc('#e9822f'), hexc('#f3d9b0'), 0.1, streak=hexc('#c5601b'))
    cream = mat_fur(hexc('#f6e6c8'), hexc('#efd9b0'), 0.06)
    white = mat_fur(hexc('#fbfaf6'), hexc('#ece7dd'), 0.05)
    tip = part([cube((-1.75, -1.75, 0), (3.5, 3.5, 3.5), white)], pivot=(0, 0, 4.5), rot=(-0.25, 0, 0),
               anims=[{'type': 'sway', 'axis': 'y', 'amp': 0.22, 'speed': 0.09, 'phase': 1.0}])
    mid = part([cube((-2.25, -2.25, 0), (4.5, 4.5, 4.75), orange), cube((-1.75, 1.75, 0.5), (3.5, 0.75, 3.75), cream)],
               pivot=(0, 0, 3), rot=(-0.2, 0, 0), anims=[{'type': 'sway', 'axis': 'y', 'amp': 0.18, 'speed': 0.09, 'phase': 0.5}])
    mid['children'] = [tip]
    tail = part([cube((-1.5, -1.5, 0), (3, 3, 3.25), orange)], pivot=(0, 10.5, 1.5), rot=(-0.7, 0, 0),
                anims=[{'type': 'sway', 'axis': 'y', 'amp': 0.16, 'speed': 0.09}])
    tail['children'] = [mid]
    out.append({'id': 'fox_tail', 'name': '여우 꼬리', 'slot': 'tail', 'bone': 'body', 'parts': [tail]})
    return out


# ───────────────────────── 텍스처 배치 + 출력 ─────────────────────────

def net_size(c):
    w, h, d = [max(1, math.ceil(v * S)) for v in c['size']]
    return w, h, d, 2 * d + 2 * w, d + h


def all_cubes(parts):
    for p in parts:
        for c in p['cubes']:
            yield c
        yield from all_cubes(p.get('children', []))


def layout(item):
    """상자 전개도를 텍스처 한 장에 선반식으로 배치"""
    cubes = list(all_cubes(item['parts']))
    cubes.sort(key=lambda c: -net_size(c)[4])
    width = 128
    while True:
        x = y = row_h = 0
        ok = True
        for c in cubes:
            _, _, _, nw, nh = net_size(c)
            if nw > width:
                ok = False
                break
            if x + nw > width:
                x, y, row_h = 0, y + row_h + 1, 0
            c['uv'] = [x, y]
            x += nw + 1
            row_h = max(row_h, nh)
        if ok:
            height = y + row_h + 1
            th = 16
            while th < height:
                th *= 2
            if th <= width * 2:
                return width, th
        width *= 2


def faces(c):
    w, h, d, _, _ = net_size(c)
    u, v = c['uv']
    return {
        'up': (u + d, v, w, d), 'down': (u + d + w, v, w, d),
        'west': (u, v + d, d, h), 'north': (u + d, v + d, w, h),
        'east': (u + d + w, v + d, d, h), 'south': (u + 2 * d + w, v + d, w, h),
    }


def strip(parts):
    res = []
    for p in parts:
        q = {k: v for k, v in p.items() if k not in ('cubes', 'children')}
        q['cubes'] = [{'from': c['from'], 'size': c['size'], 'uv': c['uv']} for c in p['cubes']]
        if p.get('children'):
            q['children'] = strip(p['children'])
        res.append(q)
    return res


def main():
    tex_mod = os.path.join(OUT_MOD, 'assets', 'aurora_cosmetics', 'textures', 'cosmetics')
    os.makedirs(tex_mod, exist_ok=True)
    os.makedirs(OUT_LAUNCHER, exist_ok=True)
    data = {'version': 1, 'texelsPerUnit': S, 'items': []}
    for item in items():
        tw, th = layout(item)
        img = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
        rnd = random.Random(item['id'])
        for c in all_cubes(item['parts']):
            for face, (x, y, w, h) in faces(c).items():
                c['mat'](img, x, y, w, h, face, rnd)
        img.save(os.path.join(tex_mod, f"{item['id']}.png"))
        data['items'].append({
            'id': item['id'], 'name': item['name'], 'slot': item['slot'], 'bone': item['bone'],
            'texture': f"{item['id']}.png", 'tw': tw, 'th': th, 'parts': strip(item['parts']),
        })
        print(f"{item['id']:12s} {tw}x{th}  cubes={len(list(all_cubes(item['parts'])))}")
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT_MOD, 'assets', 'aurora_cosmetics', 'cosmetics.json'), 'w', encoding='utf-8') as f:
        f.write(text)
    # 런처 화면은 로컬 파일을 fetch 할 수 없고, 로컬 이미지는 3D 텍스처로 쓸 수 없어서
    # 텍스처까지 data URL 로 넣은 스크립트를 따로 만듭니다.
    for it in data['items']:
        with open(os.path.join(tex_mod, it['texture']), 'rb') as f:
            it['textureData'] = 'data:image/png;base64,' + base64.b64encode(f.read()).decode()
    text2 = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT_LAUNCHER, 'cosmetics.data.js'), 'w', encoding='utf-8') as f:
        f.write('// gen_cosmetics.py 가 만든 파일입니다. 직접 고치지 마세요.\nwindow.AURORA_COSMETICS = ' + text2 + ';\n')


if __name__ == '__main__':
    main()
