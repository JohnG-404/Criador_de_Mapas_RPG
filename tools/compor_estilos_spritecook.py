"""Monta o mapa de exemplo do Atlas Board com as texturas e objetos gerados no SpriteCook.

Entradas (já no repositório, em assets/spritecook/):
    realista/    texturas contínuas (grama, terra, piso de pedra, água) + folha de objetos
    cartografia/ o mesmo conjunto desenhado a tinta e aquarela

Saídas: docs/estilos/spritecook-1-dia.png, -2-masmorra-noite.png, -3-cartografia.png
e os objetos recortados em assets/spritecook/<conjunto>/objetos/*.png.

Uso:
    pip install -r tools/requirements.txt
    python3 tools/compor_estilos_spritecook.py
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

RAIZ = Path(__file__).resolve().parent.parent
ASSETS = RAIZ / "assets" / "spritecook"
SAIDA = RAIZ / "docs" / "estilos"

C = 96                 # pixels por célula
W, H = 16, 10          # células
PW, PH = W * C, H * C
TEX_CELLS = 4          # uma textura cobre 4×4 células

# G grama, F piso, W água, R estrada (árvores, rochas e arbustos vêm de OBJETOS)
LAYOUT = [
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGFFFFFFFFGGGGG",
    "GGGFFFFFFFFGGWWG",
    "RRRFFFFFFFFGWWWW",
    "RRRFFFFFFFFGWWWW",
    "GGGFFFFFFFFGGWWG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
]
ROOM = (3, 2, 11, 7)       # células (x0, y0, x1, y1)
DOOR = (4, 6)              # linhas da abertura na parede esquerda
WALL_T = int(C * 0.36)

# ordem dos objetos na folha 3×3 gerada
NOMES = ["mesa", "tapete", "bau", "barril", "tocha", "porta", "arvore", "rochas", "arbusto"]

# (objeto, centro x, centro y em células, largura em células, rotação em graus)
OBJETOS = [
    ("tapete", 7.0, 4.5, 4.6, 0),
    ("mesa", 7.0, 4.5, 3.0, 0),
    ("bau", 9.9, 2.75, 1.3, 0),
    ("barril", 3.62, 2.62, 0.95, 0),
    ("barril", 4.5, 2.6, 0.9, 40),
    ("barril", 3.62, 6.38, 0.95, 110),
    ("rochas", 12.5, 7.5, 1.25, 0),
    ("arbusto", 14.5, 2.5, 1.0, 0),
    ("arbusto", 9.5, 8.5, 1.05, 70),
    ("arvore", 1.5, 1.4, 2.1, 0),
    ("arvore", 13.6, 1.0, 2.2, 140),
    ("arvore", 1.4, 7.7, 2.0, 220),
    ("arvore", 5.6, 8.6, 2.1, 300),
    ("arvore", 14.6, 8.4, 2.2, 60),
]
# tochas presas às paredes: (x, y em células, rotação: chama aponta para dentro da sala)
TOCHAS = [(5.5, 2.2, 180), (8.5, 2.2, 180), (10.8, 4.5, 90), (7.0, 6.8, 0)]

yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)


# ---------------------------------------------------------------- utilidades
def carregar(p: Path, modo="RGB") -> Image.Image:
    return Image.open(p).convert(modo)


def ladrilhar(tex: Image.Image, rot=0) -> np.ndarray:
    """Repete uma textura contínua por todo o mapa."""
    if rot:
        tex = tex.rotate(rot, expand=True)
    lado = C * TEX_CELLS
    t = np.asarray(tex.resize((lado, lado), Image.LANCZOS), np.float32)
    reps = (math.ceil(PH / lado), math.ceil(PW / lado), 1)
    return np.tile(t, reps)[:PH, :PW]


def ruido(escala: float, semente: int) -> np.ndarray:
    rng = np.random.default_rng(semente)
    out = np.zeros((PH, PW), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(4):
        s = escala / (2 ** o)
        gh, gw = int(PH / s) + 2, int(PW / s) + 2
        g = Image.fromarray(rng.random((gh, gw)).astype(np.float32), "F")
        g = g.resize((int(gw * s), int(gh * s)), Image.BICUBIC)
        out += np.asarray(g)[:PH, :PW] * amp
        tot += amp
        amp *= 0.5
    return out / tot


def mascara_layout(ch: str) -> np.ndarray:
    m = np.zeros((PH, PW), np.float32)
    for y, row in enumerate(LAYOUT):
        for x, c in enumerate(row):
            if c == ch:
                m[y * C:(y + 1) * C, x * C:(x + 1) * C] = 1
    return m


def organica(m: np.ndarray, blur: float, amp: float, semente: int) -> np.ndarray:
    """Arredonda uma máscara de células e dá uma borda natural."""
    b = ndi.gaussian_filter(m, blur)
    b = b + (ruido(C * 0.6, semente) - 0.5) * amp
    return np.clip((b - 0.5) * 6 + 0.5, 0, 1)


def mix(a, b, t):
    a, b = np.asarray(a, np.float32), np.asarray(b, np.float32)
    if t.ndim == 2 and max(a.ndim, b.ndim) == 3:
        t = t[..., None]
    return a * (1 - t) + b * t


def blur(m, s):
    return ndi.gaussian_filter(m, s)


# ---------------------------------------------------------------- objetos
def recortar_objetos(folha: Path, destino: Path) -> dict[str, Image.Image]:
    """Corta a folha 3×3 em objetos individuais pelo canal alfa."""
    im = carregar(folha, "RGBA")
    a = np.asarray(im)[..., 3]
    w3, h3 = im.width // 3, im.height // 3
    destino.mkdir(parents=True, exist_ok=True)
    out = {}
    for i, nome in enumerate(NOMES):
        cx, cy = (i % 3) * w3, (i // 3) * h3
        sub = a[cy:cy + h3, cx:cx + w3] > 16
        lab, n = ndi.label(sub)
        if n == 0:
            continue
        tamanhos = ndi.sum(sub, lab, range(1, n + 1))
        keep = np.isin(lab, [j + 1 for j, t in enumerate(tamanhos) if t > tamanhos.max() * 0.02])
        ys, xs = np.nonzero(keep)
        box = (cx + xs.min(), cy + ys.min(), cx + xs.max() + 1, cy + ys.max() + 1)
        obj = im.crop(box)
        obj.thumbnail((256, 256), Image.LANCZOS)
        obj.save(destino / f"{nome}.png", optimize=True)
        out[nome] = obj
    return out


class Cena:
    def __init__(self):
        self.rgb = np.zeros((PH, PW, 3), np.float32)
        self.sombra = np.zeros((PH, PW), np.float32)   # alfa das sombras projetadas
        self.ocupado = np.zeros((PH, PW), np.float32)  # alfa dos objetos (para contorno)

    def colar(self, obj: Image.Image, cx, cy, largura, rot=0, sombra=0.55, alcance=0.12, desfoque=0.06):
        o = obj
        esc = largura * C / o.width
        o = o.resize((max(1, int(o.width * esc)), max(1, int(o.height * esc))), Image.LANCZOS)
        if rot:
            o = o.rotate(rot, Image.BICUBIC, expand=True)
        arr = np.asarray(o, np.float32)
        x0, y0 = int(cx * C - o.width / 2), int(cy * C - o.height / 2)
        lay = np.zeros((PH, PW, 4), np.float32)
        sx0, sy0 = max(0, -x0), max(0, -y0)
        dx0, dy0 = max(0, x0), max(0, y0)
        w = min(o.width - sx0, PW - dx0)
        h = min(o.height - sy0, PH - dy0)
        lay[dy0:dy0 + h, dx0:dx0 + w] = arr[sy0:sy0 + h, sx0:sx0 + w]
        al = lay[..., 3] / 255
        if sombra:
            off = alcance * C * min(1.6, largura)
            sh = ndi.shift(al, (off * 0.8, off * 0.6), order=1)
            sh = blur(sh, desfoque * C * min(1.6, largura))
            self.aplicar_sombra(sh * sombra)
        self.rgb = mix(self.rgb, lay[..., :3], al)
        self.ocupado = np.maximum(self.ocupado, al)

    def aplicar_sombra(self, s):
        self.rgb *= (1 - np.clip(s, 0, 1))[..., None]
        self.sombra = np.maximum(self.sombra, s)


# ---------------------------------------------------------------- mapa base
def mascaras():
    agua = organica(mascara_layout("W"), C * 0.7, 0.5, 11)
    estrada = mascara_layout("R")
    estrada[4 * C:6 * C, 3 * C:3 * C + WALL_T] = 1  # entra na soleira da porta
    estrada = organica(estrada, C * 0.25, 0.45, 12)
    x0, y0, x1, y1 = (v * C for v in ROOM)
    piso = np.zeros((PH, PW), np.float32)
    piso[y0:y1, x0:x1] = 1
    t = WALL_T // 2
    parede = np.zeros((PH, PW), np.float32)
    parede[y0 - t:y1 + t, x0 - t:x1 + t] = 1
    parede[y0 + t:y1 - t, x0 + t:x1 - t] = 0
    porta = np.zeros((PH, PW), np.float32)
    porta[DOOR[0] * C + 6:DOOR[1] * C - 6, x0 - t:x0 + t] = 1
    parede *= 1 - porta
    return agua, estrada, piso, parede, porta


def compor(conj: str, ilustrado: bool) -> tuple[Cena, dict]:
    pasta = ASSETS / conj
    grama = ladrilhar(carregar(pasta / "grama.png"))
    terra = ladrilhar(carregar(pasta / "terra.png"), rot=0 if ilustrado else 90)
    pedra = ladrilhar(carregar(pasta / "piso-pedra.png"))
    agua_t = ladrilhar(carregar(pasta / "agua.png"))
    objs = recortar_objetos(pasta / "objetos.png", pasta / "objetos")
    agua, estrada, piso, parede, porta = mascaras()

    s = Cena()
    var = ruido(C * 2.5, 5)[..., None]
    s.rgb = grama * (0.88 + var * 0.24)
    # margem úmida e escura em volta do lago
    margem = np.clip(blur(agua, C * 0.18) * 1.6, 0, 1) * (1 - agua)
    s.rgb = mix(s.rgb, s.rgb * (0.55 if not ilustrado else 0.8), margem * 0.8)
    s.rgb = mix(s.rgb, terra, estrada)
    barranco = np.clip(blur(agua, C * 0.08) * 2.2, 0, 1) * (1 - agua)
    s.rgb = mix(s.rgb, terra * (0.7 if not ilustrado else 0.95), barranco * 0.85)
    # água mais funda no meio
    fundo = np.clip(ndi.distance_transform_edt(agua > 0.5) / (C * 1.2), 0, 1)
    agua_rgb = agua_t * (1 - fundo[..., None] * (0.25 if not ilustrado else 0.1))
    s.rgb = mix(s.rgb, agua_rgb, agua)
    s.rgb = mix(s.rgb, pedra, piso)
    meta = dict(agua=agua, estrada=estrada, piso=piso, parede=parede, porta=porta, objs=objs, pedra=pedra)

    # sombra das paredes e oclusão nos cantos internos
    sh = blur(ndi.shift(parede, (C * 0.12, C * 0.09), order=1), C * 0.08)
    s.aplicar_sombra(sh * (0.5 if not ilustrado else 0.3))
    ao = blur(parede, C * 0.3) * piso
    s.rgb *= (1 - ao * 0.45)[..., None]

    # topo das paredes: pedra mais miúda, escurecida, com chanfro de luz
    lado = int(C * 1.6)
    pedra_miuda = np.asarray(carregar(pasta / "piso-pedra.png").resize((lado, lado), Image.LANCZOS), np.float32)
    pedra_miuda = np.tile(pedra_miuda, (PH // lado + 1, PW // lado + 1, 1))[:PH, :PW]
    dist = ndi.distance_transform_edt(parede > 0.5)
    chanfro = np.clip(dist / (WALL_T * 0.35), 0, 1)
    gx, gy = np.gradient(blur(chanfro, 2))
    luz = np.clip(0.5 - (gx * 0.6 + gy * 0.8) * 6, 0, 1)
    topo = pedra_miuda * (0.62 if not ilustrado else 0.8) * (0.75 + luz[..., None] * 0.55)
    s.rgb = mix(s.rgb, topo, parede)
    aresta = parede * (1 - np.clip(dist / 3.0, 0, 1))
    s.rgb = mix(s.rgb, s.rgb * 0.35, aresta * 0.8)
    s.ocupado = np.maximum(s.ocupado, parede)

    # porta: tábuas da folha de objetos vistas de cima, deitadas na abertura
    p = objs["porta"]
    tab = p.crop((0, int(p.height * 0.3), p.width, p.height)).rotate(90, expand=True)
    tab = tab.resize((int(WALL_T * 0.95), int((DOOR[1] - DOOR[0]) * C - 12)), Image.LANCZOS)
    s.colar(tab, ROOM[0], (DOOR[0] + DOOR[1]) / 2, tab.width / C, sombra=0.4, alcance=0.05)

    for nome, cx, cy, larg, rot in OBJETOS:
        alto = nome == "arvore"
        s.colar(objs[nome], cx, cy, larg, rot,
                sombra=0.6 if alto else 0.5,
                alcance=0.22 if alto else (0.04 if nome == "tapete" else 0.1),
                desfoque=0.12 if alto else 0.05)
    for tx, ty, rot in TOCHAS:
        s.colar(objs["tocha"], tx, ty, 0.3, rot, sombra=0.4, alcance=0.06)
    return s, meta


def grade(img: np.ndarray, cor, alfa) -> np.ndarray:
    m = np.zeros((PH, PW), np.float32)
    m[::C, :] = 1
    m[:, ::C] = 1
    m[C - 1::C, :] = 1
    m[:, C - 1::C] = 1
    return mix(img, np.array(cor, np.float32), m * alfa)


def vinheta(img, k):
    d = np.hypot((xx - PW / 2) / (PW / 2), (yy - PH / 2) / (PH / 2))
    return img * (1 - np.clip(d - 0.55, 0, 1) * k)[..., None]


def salvar(img: np.ndarray, nome: str):
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(SAIDA / nome, optimize=True)


# ---------------------------------------------------------------- estilos
def luz_tochas(fator_raio=3.4):
    luz = np.zeros((PH, PW), np.float32)
    for tx, ty, rot in TOCHAS:
        dx, dy = -math.sin(math.radians(rot)) * 0.25, math.cos(math.radians(rot)) * -0.25
        lx, ly = (tx + dx) * C, (ty - dy) * C
        d = np.hypot(xx - lx, yy - ly) / (fator_raio * C)
        luz += np.clip(1 - d, 0, 1) ** 1.8
    luz += np.clip(1 - np.hypot(xx - 7 * C, yy - 4.5 * C) / (1.8 * C), 0, 1) ** 2 * 0.5  # vela na mesa
    return luz


def estilo_dia():
    s, m = compor("realista", False)
    img = s.rgb * np.array([1.04, 1.0, 0.94])
    img = grade(img, (20, 18, 14), 0.3)
    salvar(vinheta(img, 0.35), "spritecook-1-dia.png")


def estilo_noite():
    s, m = compor("realista", False)
    base = s.rgb
    lum = base.mean(axis=2, keepdims=True)
    lua = mix(base, lum, np.full((PH, PW), 0.55)) * np.array([0.32, 0.42, 0.62])
    # dentro da sala só entra a luz das tochas; o luar não chega
    dentro = blur(np.clip(m["piso"] + m["parede"] * 0.5, 0, 1), C * 0.15)
    ambiente = mix(lua, lua * 0.45, dentro)
    luz = luz_tochas() * mix(np.full((PH, PW), 0.25), np.ones((PH, PW)), dentro)
    quente = base * np.array([1.25, 0.86, 0.55]) * np.clip(luz, 0, 1.3)[..., None]
    img = ambiente + quente
    # brilho do luar na água
    img += (m["agua"] * np.clip(ruido(C * 0.15, 9) - 0.6, 0, 1) * 90)[..., None] * np.array([0.6, 0.75, 1.0])
    # halo das chamas
    halo = np.zeros((PH, PW), np.float32)
    for tx, ty, rot in TOCHAS:
        dx, dy = -math.sin(math.radians(rot)) * 0.14, -math.cos(math.radians(rot)) * 0.14
        halo += np.clip(1 - np.hypot(xx - (tx + dx) * C, yy - (ty + dy) * C) / (0.5 * C), 0, 1) ** 2
    img += halo[..., None] * np.array([255, 170, 80]) * 0.8
    img = grade(img, (150, 170, 210), 0.14)
    salvar(vinheta(img, 0.6), "spritecook-2-masmorra-noite.png")


def estilo_cartografia():
    s, m = compor("cartografia", True)
    img = s.rgb
    # contorno a tinta em volta de paredes, água e piso
    def borda(mask, larg):
        b = mask > 0.5
        return (ndi.binary_dilation(b, iterations=larg) & ~ndi.binary_erosion(b, iterations=larg)).astype(np.float32)
    tinta = np.array([38, 26, 18], np.float32)
    img = mix(img, tinta, blur(borda(m["parede"], 2), 0.8) * 0.95)
    img = mix(img, tinta, blur(borda(m["agua"], 1), 0.8) * 0.7)
    # hachura diagonal sobre as paredes
    hach = ((xx + yy) % 9 < 1.6).astype(np.float32) * m["parede"]
    img = mix(img, tinta, hach * 0.55)
    # papel envelhecido unificando as cores
    papel = 0.86 + ruido(C * 1.5, 21) * 0.16 + ruido(C * 0.08, 22) * 0.05
    manchas = np.clip(ruido(C * 4, 23) - 0.6, 0, 1) * 0.5
    sepia = np.array([1.0, 0.93, 0.8])
    img = mix(img, img.mean(axis=2, keepdims=True) * sepia * 1.05, np.full((PH, PW), 0.22))
    img = img * papel[..., None] * (1 - manchas[..., None] * np.array([0.1, 0.2, 0.35]))
    img = grade(img, (70, 50, 32), 0.3)
    # moldura
    mold = np.zeros((PH, PW), np.float32)
    mold[:6, :] = mold[-6:, :] = 1
    mold[:, :6] = mold[:, -6:] = 1
    mold[12:14, 12:-12] = mold[-14:-12, 12:-12] = 1
    mold[12:-12, 12:14] = mold[12:-12, -14:-12] = 1
    img = mix(img, tinta, mold * 0.9)
    salvar(vinheta(img, 0.3), "spritecook-3-cartografia.png")


if __name__ == "__main__":
    SAIDA.mkdir(parents=True, exist_ok=True)
    estilo_dia()
    estilo_noite()
    estilo_cartografia()
    print("ok:", sorted(p.name for p in SAIDA.glob("spritecook-*.png")))
