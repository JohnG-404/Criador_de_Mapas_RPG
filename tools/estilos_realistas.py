"""Gera as propostas de estilo "realistas" do Atlas Board.

Tudo é procedural (ruído, Voronoi, mapas de altura e iluminação), com sementes
fixas: o resultado é reprodutível, original e livre de licenças de terceiros.
As mesmas texturas servem de base para o pacote de assets do editor.

Uso:
    pip install -r tools/requirements.txt
    python3 tools/estilos_realistas.py      # escreve docs/estilos/realista-*.png
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

C = 64                 # pixels por célula
W, H = 16, 10          # células
PW, PH = W * C, H * C  # pixels

# G grama, T árvore (sobre grama), B arbusto, K rocha, F piso de pedra, W água, R estrada de terra
LAYOUT = [
    "GGGGGGGGGGGGGGGG",
    "GTGGGGGGGGGGGTGG",
    "GGGFFFFFFFFGGGBG",
    "GGGFFFFFFFFGGWWG",
    "RRRFFFFFFFFGWWWW",
    "RRRFFFFFFFFGWWWW",
    "GGGFFFFFFFFGGWWG",
    "GTGGGGGGGGGGKGGG",
    "GGGGGTGGGBGGGGTG",
    "GGGGGGGGGGGGGGGG",
]
ROOM = (3, 2, 11, 7)           # células (x0, y0, x1, y1)
DOOR_ROWS = (4, 6)             # abertura na parede esquerda
WALL_T = 22                    # espessura da parede em px
LIGHT = np.array([-0.55, -0.75, 1.0]); LIGHT /= np.linalg.norm(LIGHT)
SHADOW_DIR = np.array([0.62, 0.78])  # para onde as sombras caem (baixo-direita)

yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)


# ---------------------------------------------------------------- utilidades
def fbm(scale: float, octaves: int = 5, seed: int = 0, persistence: float = 0.5) -> np.ndarray:
    """Ruído fractal suave em [0,1] do tamanho do mapa."""
    rng = np.random.default_rng(seed)
    out = np.zeros((PH, PW), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(scale / (2 ** o), 1.0)
        gh, gw = int(PH / s) + 4, int(PW / s) + 4
        grid = rng.random((gh, gw)).astype(np.float32)
        img = Image.fromarray(grid, mode="F").resize((int(gw * s), int(gh * s)), Image.BICUBIC)
        out += np.asarray(img)[:PH, :PW] * amp
        tot += amp
        amp *= persistence
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def rect_mask(x, y, w, h, soft=0.0):
    m = ((xx >= x) & (xx < x + w) & (yy >= y) & (yy < y + h)).astype(np.float32)
    return ndi.gaussian_filter(m, soft) if soft else m


def disk(cx, cy, r):
    return (((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r).astype(np.float32)


def bevel(mask: np.ndarray, width: float) -> np.ndarray:
    """Altura 0→1 subindo da borda do objeto para dentro (bordas arredondadas)."""
    d = ndi.distance_transform_edt(mask > 0.5)
    t = np.clip(d / width, 0, 1)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return np.asarray(a, np.float32) * (1 - t) + np.asarray(b, np.float32) * t


def shift(mask, dx, dy):
    return ndi.shift(mask, (dy, dx), order=1, mode="constant")


def voronoi(spacing: float, jitter: float, seed: int, region: np.ndarray | None = None):
    """Células de Voronoi (pedras). Retorna (id, f2-f1) por pixel."""
    rng = np.random.default_rng(seed)
    gx, gy = np.meshgrid(np.arange(-1, PW / spacing + 2), np.arange(-1, PH / spacing + 2))
    pts = np.stack([gx.ravel(), gy.ravel()], 1) * spacing
    pts += (rng.random(pts.shape) - 0.5) * spacing * jitter
    tree = cKDTree(pts)
    sel = np.ones((PH, PW), bool) if region is None else region > 0.01
    q = np.stack([xx[sel], yy[sel]], 1)
    d, idx = tree.query(q, k=2)
    vid = np.full((PH, PW), -1, np.int64)
    edge = np.zeros((PH, PW), np.float32)
    vid[sel] = idx[:, 0]
    edge[sel] = d[:, 1] - d[:, 0]
    return vid, edge, len(pts)


def layout_mask(chars: str) -> np.ndarray:
    m = np.zeros((H, W), np.float32)
    for y, row in enumerate(LAYOUT):
        for x, ch in enumerate(row):
            if ch in chars:
                m[y, x] = 1
    return np.kron(m, np.ones((C, C), np.float32))


def warp(mask, amp, scale, seed):
    dx = (fbm(scale, 4, seed) - 0.5) * 2 * amp
    dy = (fbm(scale, 4, seed + 1) - 0.5) * 2 * amp
    return ndi.map_coordinates(mask, [yy + dy, xx + dx], order=1, mode="nearest")


# ---------------------------------------------------------------- a cena
class Scene:
    def __init__(self):
        self.albedo = np.zeros((PH, PW, 3), np.float32)
        self.bump = np.zeros((PH, PW), np.float32)     # relevo local (para luz)
        self.elev = np.zeros((PH, PW), np.float32)     # altura real (para sombras)
        self.casters: list[tuple[np.ndarray, float]] = []
        self.lights: list[tuple[float, float, float]] = []  # x, y, raio
        self.outline = np.zeros((PH, PW), np.float32)  # bordas para o estilo tinta
        self.emissive = np.zeros((PH, PW, 3), np.float32)

    def paint(self, mask, color, bump=None, elev=0.0, cast=False, outline=True):
        m = np.clip(mask, 0, 1)
        col = color if np.ndim(color) == 3 else np.broadcast_to(np.asarray(color, np.float32), (PH, PW, 3))
        self.albedo = self.albedo * (1 - m[..., None]) + col * m[..., None]
        if bump is not None:
            self.bump = self.bump * (1 - m) + bump * m
        hard = m > 0.5
        self.elev[hard] = elev
        if cast and elev > 0:
            self.casters.append((m, elev))
        if outline:
            g = np.hypot(*np.gradient(ndi.gaussian_filter(m, 0.7)))
            self.outline = np.maximum(self.outline, np.clip(g * 2.2, 0, 1))


def build_scene() -> Scene:
    s = Scene()

    # --- solo: máscaras suaves com bordas naturais
    grass_b = layout_mask("GTBK")
    road_b = layout_mask("R")
    floor_b = layout_mask("F")
    # lago com contorno orgânico: elipse deformada por ruído (o layout só marca a região)
    ell = 1 - np.hypot((xx - 14.1 * C) / (2.1 * C), (yy - 4.7 * C) / (1.6 * C))
    ell += (fbm(70, 4, 11) - 0.5) * 0.7
    water_m = np.clip(ndi.gaussian_filter((ell > 0).astype(np.float32), 1.5), 0, 1)
    road_m = np.clip((ndi.gaussian_filter(warp(road_b, 10, 40, 21), 4) - 0.45) * 3, 0, 1)

    # grama
    n_big = fbm(220, 5, 1)
    n_mid = fbm(40, 4, 2)
    blades = ndi.gaussian_filter(np.random.default_rng(3).random((PH, PW)).astype(np.float32), 0.6)
    blades = ndi.uniform_filter1d(blades, 5, axis=0)
    dry = np.clip((fbm(140, 4, 4) - 0.62) * 4, 0, 1)
    grass = lerp((46, 72, 34), (104, 132, 60), np.clip(n_big * 0.7 + n_mid * 0.5 - 0.1, 0, 1))
    grass = lerp(grass, (138, 128, 72), dry * 0.6)
    grass *= (0.82 + 0.36 * blades)[..., None]
    s.paint(np.ones((PH, PW), np.float32), grass, bump=blades * 1.2, outline=False)

    # estrada de terra com pedrinhas
    dirt = lerp((104, 80, 56), (150, 120, 84), fbm(60, 5, 5))
    pid, pedge, n = voronoi(11, 0.9, 6, road_m)
    keep = np.random.default_rng(7).random(n + 1) < 0.14
    pebble = (pid >= 0) & keep[np.clip(pid, 0, n)] & (pedge > 2.0)
    pb = np.where(pebble, np.clip((pedge - 2) / 3, 0, 1), 0)
    dirt = lerp(dirt, (112, 104, 92), pebble.astype(np.float32) * 0.55)
    ruts = np.exp(-((yy - 4.5 * C - 18) ** 2) / 60) + np.exp(-((yy - 5.5 * C + 18) ** 2) / 60)
    dirt *= (1 - 0.12 * ruts * road_m)[..., None]
    s.paint(road_m, dirt, bump=fbm(8, 3, 8) * 1.5 + pb * 3, outline=False)

    # margem molhada + água com profundidade
    near_water = np.clip(ndi.gaussian_filter(water_m, 9) * 2.2, 0, 1) * (1 - water_m)
    s.paint(near_water * 0.85, lerp((92, 84, 60), (120, 108, 76), fbm(20, 3, 9)), outline=False)
    depth = ndi.distance_transform_edt(water_m > 0.5)
    depth = np.clip(depth / 70, 0, 1) ** 0.7
    ripple = fbm(18, 3, 10)
    water = lerp((96, 136, 118), (22, 54, 78), depth)
    water *= (0.9 + 0.2 * ripple)[..., None]
    s.paint(water_m, water, bump=ripple * 0.6, outline=False)
    s.water = water_m
    spec = ndi.gaussian_filter(np.clip((fbm(12, 3, 12) - 0.74) * 6, 0, 1), (0.6, 2.5))
    s.water_spec = spec * water_m * (0.3 + 0.7 * depth) * 0.7

    # piso de lajes de pedra
    x0, y0, x1, y1 = ROOM
    floor_m = rect_mask(x0 * C, y0 * C, (x1 - x0) * C, (y1 - y0) * C)
    fid, fedge, fn = voronoi(25, 0.85, 13, floor_m)
    tone = np.random.default_rng(14).random((fn + 1, 3)).astype(np.float32)
    stone_col = 112 + tone[np.clip(fid, 0, fn), 0][..., None] * 34
    warmth = (tone[np.clip(fid, 0, fn), 1][..., None] - 0.5) * np.array([10, 4, -8], np.float32)
    floor = np.broadcast_to(stone_col, (PH, PW, 3)) + warmth
    floor *= (0.86 + 0.28 * fbm(6, 3, 15))[..., None]
    grout = np.clip(1 - fedge / 2.6, 0, 1)
    floor = lerp(floor, (52, 47, 42), grout * 0.9)
    stone_h = np.clip(fedge / 7, 0, 1) ** 0.6
    s.paint(floor_m, floor, bump=stone_h * 4 + fbm(5, 2, 16) * 0.8, outline=False)
    s.floor = floor_m

    # tapete
    rx, ry, rw, rh = 5.75 * C, 3.85 * C, 3.5 * C, 2.3 * C
    rug = rect_mask(rx, ry, rw, rh)
    border = rug - rect_mask(rx + 12, ry + 12, rw - 24, rh - 24)
    inner = rect_mask(rx + 20, ry + 20, rw - 40, rh - 40)
    weave = 0.9 + 0.1 * np.sin(xx * 1.9) * np.sin(yy * 1.9) + 0.08 * fbm(4, 2, 17)
    rug_col = np.broadcast_to(np.array([120, 30, 32], np.float32), (PH, PW, 3)).copy()
    diamond = (np.abs((xx - (rx + rw / 2)) / (rw / 2 - 24)) + np.abs((yy - (ry + rh / 2)) / (rh / 2 - 24))) < 0.55
    rug_col = lerp(rug_col, (150, 106, 48), border * 0.8)
    rug_col = lerp(rug_col, (60, 34, 42), (inner * diamond).astype(np.float32) * 0.8)
    rug_col *= weave[..., None]
    s.paint(rug, rug_col, bump=bevel(rug, 3) * 1.0, elev=0.5)

    # mesa e bancos de madeira
    def wood(mask, horizontal=True, base=(112, 74, 44), seed=20, planks=16):
        u = yy if horizontal else xx
        v = xx if horizontal else yy
        grain = np.sin(v * 0.05 + u * 0.02 + fbm(30, 3, seed) * 14) * 0.5 + 0.5
        fine = fbm(3, 2, seed + 1)
        col = lerp(np.array(base) * 0.75, np.array(base) * 1.15, grain * 0.6 + fine * 0.4)
        gaps = (np.mod(u, planks) < 1.2).astype(np.float32)
        col = lerp(col, np.array(base) * 0.35, gaps * 0.8)
        return col, bevel(mask, 4) * 3 - gaps * 0.8

    tx, ty, tw, th = 6.15 * C, 4.45 * C, 2.7 * C, 1.2 * C
    for bx in (ty - 22, ty + th + 8):
        bench = rect_mask(tx + 8, bx, tw - 16, 14)
        col, b = wood(bench, True, (96, 64, 38), 22, 7)
        s.paint(bench, col, bump=b, elev=8, cast=True)
    table = rect_mask(tx, ty, tw, th)
    col, b = wood(table, True, (122, 82, 48), 24, 15)
    s.paint(table, col, bump=b, elev=18, cast=True)
    # objetos na mesa: canecas e uma vela
    for i, (cx, cy) in enumerate([(tx + 40, ty + 22), (tx + 110, ty + 50), (tx + 140, ty + 20)]):
        mug = disk(cx, cy, 7)
        s.paint(mug, lerp((150, 150, 150), (90, 90, 95), fbm(4, 2, 30 + i)), bump=bevel(mug, 3) * 4, elev=22)
    candle = (tx + tw - 30, ty + th / 2)
    s.paint(disk(*candle, 5), (230, 220, 190), bump=bevel(disk(*candle, 5), 2) * 2, elev=22)
    s.lights.append((candle[0], candle[1], 1.6 * C))

    # baú
    cx, cy = 9.55 * C, 3.15 * C
    chest = rect_mask(cx - 22, cy - 15, 44, 30)
    col, b = wood(chest, False, (110, 70, 38), 26, 11)
    bands = (rect_mask(cx - 14, cy - 15, 5, 30) + rect_mask(cx + 9, cy - 15, 5, 30)) * chest
    col = lerp(col, (70, 70, 74), np.clip(bands, 0, 1))
    lock = rect_mask(cx - 4, cy + 8, 8, 7)
    col = lerp(col, (196, 160, 70), lock)
    s.paint(chest, col, bump=b + bands * 1.5, elev=14, cast=True)

    # barris
    for i, (bx, by) in enumerate([(10.2 * C, 6.35 * C), (9.65 * C, 6.5 * C)]):
        r = 17
        m = disk(bx, by, r)
        d = np.hypot(xx - bx, yy - by) / r
        rings = (np.abs(d - 0.82) < 0.07) | (np.abs(d - 0.45) < 0.05)
        top = lerp((120, 84, 50), (88, 60, 36), np.clip(d, 0, 1)) * (0.9 + 0.2 * fbm(3, 2, 40 + i))[..., None]
        top = lerp(top, (60, 60, 64), rings.astype(np.float32))
        s.paint(m, top, bump=np.sqrt(np.clip(1 - d ** 2, 0, 1)) * 5, elev=24, cast=True)

    # paredes de pedra (alvenaria irregular)
    ox0, oy0, ox1, oy1 = x0 * C, y0 * C, x1 * C, y1 * C
    t = WALL_T
    wall = np.clip(
        rect_mask(ox0 - t / 2, oy0 - t / 2, ox1 - ox0 + t, oy1 - oy0 + t)
        - rect_mask(ox0 + t / 2, oy0 + t / 2, ox1 - ox0 - t, oy1 - oy0 - t), 0, 1)
    door_y0, door_y1 = DOOR_ROWS[0] * C + 8, DOOR_ROWS[1] * C - 8
    opening = rect_mask(ox0 - t, door_y0, 2 * t, door_y1 - door_y0)
    wall = wall * (1 - opening)
    wid, wedge, wn = voronoi(15, 0.7, 50, wall)
    wt = np.random.default_rng(51).random(wn + 1).astype(np.float32)
    wall_col = (128 + wt[np.clip(wid, 0, wn)] * 40)[..., None] * np.array([1.0, 0.97, 0.92], np.float32)
    wall_col *= (0.9 + 0.2 * fbm(4, 2, 52))[..., None]
    mortar = np.clip(1 - wedge / 2.2, 0, 1)
    wall_col = lerp(wall_col, (64, 58, 52), mortar * 0.85)
    s.paint(wall, wall_col, bump=np.clip(wedge / 5, 0, 1) ** 0.5 * 5 + bevel(wall, 5) * 3, elev=48, cast=True)
    s.wall = wall

    # porta de madeira (aberta para dentro, girada)
    door = rect_mask(ox0 - 6, door_y0, 12, door_y1 - door_y0)
    col, b = wood(door, False, (104, 66, 36), 60, 12)
    hinges = (rect_mask(ox0 - 6, door_y0 + 10, 12, 4) + rect_mask(ox0 - 6, door_y1 - 14, 12, 4)) * door
    col = lerp(col, (50, 50, 54), np.clip(hinges, 0, 1))
    s.paint(door, col, bump=b, elev=40, cast=True)

    # tochas na parede de cima
    for tx_ in (4.5 * C, 9.5 * C):
        ty_ = oy0 + 4
        bracket = rect_mask(tx_ - 3, ty_ - 6, 6, 14)
        s.paint(bracket, (58, 52, 48), elev=50)
        flame = disk(tx_, ty_ + 10, 5)
        s.paint(flame, (255, 214, 120), elev=52, outline=False)
        s.emissive += disk(tx_, ty_ + 10, 4)[..., None] * np.array([255, 230, 160], np.float32)
        s.lights.append((tx_, ty_ + 14, 3.2 * C))

    # rochas, arbustos e árvores
    rng = np.random.default_rng(70)
    for y, row in enumerate(LAYOUT):
        for x, ch in enumerate(row):
            cx, cy = x * C + C / 2, y * C + C / 2
            if ch == "K":
                for j in range(3):
                    r = rng.uniform(9, 20)
                    px, py = cx + rng.uniform(-14, 14), cy + rng.uniform(-12, 12)
                    m = warp(disk(px, py, r), 3, 8, 71 + j)
                    col = lerp((96, 94, 90), (150, 146, 138), fbm(6, 3, 72 + j))
                    s.paint(m, col, bump=bevel(m, r * 0.8) * 8 + fbm(4, 2, 73) * 2, elev=10 + r, cast=True)
            if ch in "TB":
                tree = ch == "T"
                R = 52 if tree else 26
                hmap = np.zeros((PH, PW), np.float32)
                for _ in range(26 if tree else 12):
                    a = rng.uniform(0, math.tau)
                    dist = rng.uniform(0, R * 0.62)
                    br = rng.uniform(R * 0.28, R * 0.42)
                    bx, by = cx + math.cos(a) * dist, cy + math.sin(a) * dist
                    d2 = ((xx - bx) ** 2 + (yy - by) ** 2) / (br * br)
                    zb = np.sqrt(np.clip(1 - d2, 0, 1)) * br * (1 - dist / R * 0.5)
                    hmap = np.maximum(hmap, zb)
                m = np.clip(hmap * 3, 0, 1)
                leaves = fbm(3, 2, int(rng.integers(1000)))
                hn = hmap / (hmap.max() + 1e-6)
                dark, light = ((26, 50, 24), (92, 124, 50)) if tree else ((40, 70, 30), (110, 142, 62))
                col = lerp(dark, light, np.clip(hn * 0.8 + leaves * 0.35, 0, 1))
                s.paint(m, col, bump=hmap * 0.9 + leaves * 3, elev=90 if tree else 20, cast=True)

    # ficha de personagem (token) na estrada
    tcx, tcy = 1.5 * C, 5.0 * C
    ring = disk(tcx, tcy, 22)
    s.paint(ring, (176, 140, 60), bump=bevel(ring, 6) * 4, elev=4, cast=True)
    face = disk(tcx, tcy, 16)
    s.paint(face, lerp((150, 40, 36), (96, 22, 24), np.clip(np.hypot(xx - tcx + 5, yy - tcy + 5) / 22, 0, 1)), elev=4)
    s.token = (tcx, tcy)
    return s


# ---------------------------------------------------------------- iluminação
def shade(s: Scene, sun: float = 1.0, ambient: float = 0.45, shadow_len: float = 0.45, shadow_dark: float = 0.5):
    gy, gx = np.gradient(ndi.gaussian_filter(s.bump, 0.8))
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    lam = np.clip(n @ LIGHT, 0, 1)
    flat = LIGHT[2]
    diffuse = ambient + (1 - ambient) * (lam / flat) * sun

    shadow = np.zeros((PH, PW), np.float32)
    for m, e in s.casters:
        L = e * shadow_len
        sm = ndi.gaussian_filter(shift(m, SHADOW_DIR[0] * L, SHADOW_DIR[1] * L), 1.5 + L * 0.12)
        receives = (s.elev < e - 0.1).astype(np.float32)
        shadow = np.maximum(shadow, sm * receives)
    # oclusão ambiente junto das paredes e objetos
    ao = np.clip(ndi.gaussian_filter((s.elev > 3).astype(np.float32), 7) * 1.4, 0, 1) * (s.elev < 3)
    light = diffuse * (1 - shadow * shadow_dark) * (1 - ao * 0.28)
    return light


def point_lights(s: Scene, strength=1.0, color=(1.0, 0.72, 0.4)):
    acc = np.zeros((PH, PW), np.float32)
    for lx, ly, r in s.lights:
        d2 = ((xx - lx) ** 2 + (yy - ly) ** 2) / (r * r)
        acc += np.exp(-d2 * 2.2)
    # a luz das tochas fica dentro da sala (as paredes bloqueiam)
    inside = ndi.gaussian_filter(s.floor * (1 - s.wall) + s.wall * 0.6, 6)
    acc *= np.clip(inside * 1.15, 0, 1)
    return acc[..., None] * np.array(color, np.float32) * strength


def grid_overlay(img, color, alpha):
    g = np.zeros((PH, PW), np.float32)
    g[:, ::C] = 1
    g[::C, :] = 1
    g = ndi.gaussian_filter(g, 0.5) * 1.6
    return lerp(img, color, np.clip(g, 0, 1) * alpha)


def token_letter(img_u8: Image.Image, s: Scene, fg=(245, 235, 210)):
    from PIL import ImageDraw, ImageFont
    d = ImageDraw.Draw(img_u8)
    try:
        f = ImageFont.truetype("DejaVuSerif-Bold.ttf", 20)
    except OSError:
        f = ImageFont.load_default()
    d.text(s.token, "A", fill=fg, font=f, anchor="mm")


def saturate(img, k):
    gray = img.mean(-1, keepdims=True)
    return gray + (img - gray) * k


def vignette(img, k):
    d = np.hypot((xx - PW / 2) / (PW / 2), (yy - PH / 2) / (PH / 2))
    return img * (1 - k * np.clip(d - 0.35, 0, 1) ** 1.5)[..., None]


def finish(img, s: Scene):
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    token_letter(out, s)
    return out


# ---------------------------------------------------------------- estilos
def style_dia(s: Scene):
    light = shade(s, sun=1.0, ambient=0.5, shadow_len=0.42, shadow_dark=0.48)
    img = s.albedo * light[..., None]
    img += s.water_spec[..., None] * np.array([90, 100, 100])
    img = img + point_lights(s, 0.25) * img * 0.6
    img = img * np.array([1.04, 1.0, 0.94])
    img = grid_overlay(img, (20, 18, 14), 0.22)
    return finish(vignette(saturate(img, 1.08), 0.25), s)


def style_noite(s: Scene):
    light = shade(s, sun=0.5, ambient=0.35, shadow_len=0.3, shadow_dark=0.55)
    base = s.albedo * light[..., None]
    moon = np.array([0.40, 0.46, 0.64], np.float32)
    torch = point_lights(s, 2.1)
    lit = base * (moon + torch)
    lit += s.water_spec[..., None] * np.array([40, 60, 90])
    lit += ndi.gaussian_filter(s.emissive, (5, 5, 0)) * 1.6 + s.emissive
    lit = saturate(lit, 0.85)
    lit = grid_overlay(lit, (150, 170, 200), 0.12)
    return finish(vignette(lit, 0.75), s)


def style_pergaminho(s: Scene):
    light = shade(s, sun=0.8, ambient=0.6, shadow_len=0.35, shadow_dark=0.4)
    img = s.albedo * light[..., None]
    gray = img.mean(-1, keepdims=True)
    sepia = gray * np.array([1.07, 0.95, 0.78]) + np.array([18, 12, 0])
    img = img * 0.45 + sepia * 0.55
    # suaviza como aquarela e aplica papel
    img = ndi.median_filter(img, size=(3, 3, 1))
    paper = 0.86 + 0.14 * fbm(90, 5, 99) - 0.06 * fbm(3, 2, 98)
    img *= paper[..., None]
    ink = np.clip(s.outline * 1.4, 0, 1)
    ink = np.maximum(ink, np.clip(ndi.gaussian_filter(s.wall, 1) * 0, 0, 1))
    img = lerp(img, (44, 32, 22), ink * 0.85)
    # hachura em volta das paredes, como nos mapas desenhados à mão
    around = np.clip(ndi.gaussian_filter((ndi.distance_transform_edt(s.wall < 0.5) < 20).astype(np.float32), 1), 0, 1)
    around *= (1 - s.wall) * (1 - s.floor)
    hatch = (np.mod(xx + yy, 7) < 1.3).astype(np.float32)
    img = lerp(img, (52, 38, 26), around * hatch * 0.8)
    img = grid_overlay(img, (70, 52, 34), 0.28)
    border = 1 - rect_mask(10, 10, PW - 20, PH - 20, soft=3)
    img = lerp(img, (60, 44, 28), border * 0.7)
    return finish(vignette(img, 0.35), s)


STYLES = {
    "realista-1-dia": style_dia,
    "realista-2-masmorra-noite": style_noite,
    "realista-3-cartografia": style_pergaminho,
}

if __name__ == "__main__":
    dest = Path(__file__).resolve().parent.parent / "docs" / "estilos"
    dest.mkdir(parents=True, exist_ok=True)
    scene = build_scene()
    for name, fn in STYLES.items():
        fn(scene).save(dest / f"{name}.png", optimize=True)
        print("ok", name)
