"""Gera as 3 propostas de estilo visual (SVG) a partir do mesmo mapa de exemplo.

Uso: python3 tools/gerar-estilos.py  →  escreve docs/estilos/*.svg
"""
import math
import random
from pathlib import Path

C = 40          # pixels por célula
W, H = 16, 10   # células

# Layout: G grama, F piso de pedra, W água, T árvore (sobre grama), R estrada de terra
LAYOUT = [
    "GGGGGGGGGGGGGGGG",
    "GTGGGGGGGGGGGTGG",
    "GGGFFFFFFFFGGGGG",
    "GGGFFFFFFFFGGWWG",
    "RRRFFFFFFFFGWWWW",
    "GGGFFFFFFFFGWWWW",
    "GGGFFFFFFFFGGWWG",
    "GTGGGGGGGGGGGGGG",
    "GGGGGTGGGGGGGTGG",
    "GGGGGGGGGGGGGGGG",
]
# Paredes da sala: retângulo de (3,2) a (11,7), porta na esquerda em y=4
ROOM = (3, 2, 11, 7)
DOOR = ((3, 4), (3, 5))
CHEST = (9.5, 3.5)
TORCHES = [(4.0, 2.0), (10.0, 2.0)]
TABLE = (6.2, 4.4, 2.6, 1.3)

STYLES = {
    "1-pergaminho": dict(
        nome="Pergaminho", bg="#e9dcc0", grass="#e2d4b2", floor="#efe6d2", water="#c9c3a8", road="#d8c39a",
        ink="#3b2f22", grid="#6b5a40", grid_alpha=0.35, wall="#3b2f22", tree="#b9a77f", tree_line="#3b2f22",
        hatch=True, texture="paper", chest="#8a6a3e", water_lines="#6b5a40",
    ),
    "2-aquarela": dict(
        nome="Aquarela", bg="#cfe3b4", grass="#a9cf8a", floor="#d8d2c4", water="#7fb7d8", road="#d6b98a",
        ink="#3d3a35", grid="#2f3b2a", grid_alpha=0.18, wall="#5a5048", tree="#5f9a4b", tree_line="#3f6b33",
        hatch=False, texture="wash", chest="#b07a3a", water_lines="#d8ecf7",
    ),
    "3-noturno": dict(
        nome="Noturno", bg="#121a2b", grass="#16233a", floor="#1d2c48", water="#0f2f4a", road="#1a2840",
        ink="#8fd3ff", grid="#5fb4e6", grid_alpha=0.28, wall="#8fd3ff", tree="#1a3550", tree_line="#5fb4e6",
        hatch=False, texture="glow", chest="#e0b354", water_lines="#5fb4e6",
    ),
}


def svg_for(key, s):
    rnd = random.Random(7)
    out = []
    a = out.append
    a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W*C} {H*C}" width="{W*C}" height="{H*C}">')
    a('<defs>')
    a('<filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3"/>'
      '<feDisplacementMap in="SourceGraphic" scale="3"/></filter>')
    a('<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="n"/>'
      '<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.10"/></feComponentTransfer>'
      '<feComposite in2="SourceGraphic" operator="in"/></filter>')
    a('<filter id="wash"><feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" seed="11"/>'
      '<feDisplacementMap in="SourceGraphic" scale="10"/><feGaussianBlur stdDeviation="0.6"/></filter>')
    a('<filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    a(f'<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
      f'<line x1="0" y1="0" x2="0" y2="6" stroke="{s["ink"]}" stroke-width="1" opacity="0.55"/></pattern>')
    a('</defs>')
    a(f'<rect width="100%" height="100%" fill="{s["bg"]}"/>')

    # Terreno: agrupa por tipo para o filtro de borda irregular
    fills = {"G": s["grass"], "T": s["grass"], "F": s["floor"], "W": s["water"], "R": s["road"]}
    terrain_filter = {"paper": "url(#rough)", "wash": "url(#wash)", "glow": "none"}[s["texture"]]
    for kind in ["G", "R", "W", "F"]:
        a(f'<g filter="{terrain_filter}">')
        for y, row in enumerate(LAYOUT):
            for x, ch in enumerate(row):
                k = "G" if ch == "T" else ch
                if k == kind:
                    a(f'<rect x="{x*C-0.5}" y="{y*C-0.5}" width="{C+1}" height="{C+1}" fill="{fills[kind]}"/>')
        a('</g>')

    # Detalhes de grama
    for y, row in enumerate(LAYOUT):
        for x, ch in enumerate(row):
            if ch in "GT" and rnd.random() < 0.5:
                gx, gy = x*C + rnd.uniform(6, 34), y*C + rnd.uniform(8, 34)
                col = s["tree_line"] if key != "1-pergaminho" else s["ink"]
                a(f'<path d="M{gx} {gy} l-2 -5 M{gx} {gy} l0 -6 M{gx} {gy} l2 -5" stroke="{col}" stroke-width="1" opacity="0.45" fill="none"/>')

    # Pedras do piso
    x0, y0, x1, y1 = ROOM
    for y in range(y0, y1):
        for x in range(x0, x1):
            ox = 0 if y % 2 == 0 else C/2
            a(f'<path d="M{x*C} {y*C+C} h{C} M{x*C+ox+C/4} {y*C} v{C}" stroke="{s["ink"]}" stroke-width="0.8" opacity="0.18"/>')

    # Água: ondas
    for y, row in enumerate(LAYOUT):
        for x, ch in enumerate(row):
            if ch == "W" and rnd.random() < 0.7:
                wx, wy = x*C + rnd.uniform(5, 20), y*C + rnd.uniform(10, 30)
                a(f'<path d="M{wx} {wy} q4 -4 8 0 t8 0" stroke="{s["water_lines"]}" stroke-width="1.3" fill="none" opacity="0.7"/>')

    # Hachura externa às paredes (estilo pergaminho)
    if s["hatch"]:
        a(f'<path d="M{x0*C-12} {y0*C-12} H{x1*C+12} V{y1*C+12} H{x0*C-12} Z M{x0*C} {y0*C} V{y1*C} H{x1*C} V{y0*C} Z" '
          f'fill="url(#hatch)" fill-rule="evenodd" filter="url(#rough)"/>')

    # Grid
    g = []
    for x in range(1, W):
        g.append(f'M{x*C} 0V{H*C}')
    for y in range(1, H):
        g.append(f'M0 {y*C}H{W*C}')
    a(f'<path d="{" ".join(g)}" stroke="{s["grid"]}" stroke-width="1" opacity="{s["grid_alpha"]}"/>')

    # Paredes (com abertura da porta)
    (dx, dy0), (_, dy1) = DOOR
    wall_filter = 'url(#glow)' if s["texture"] == "glow" else ('url(#rough)' if s["hatch"] else 'none')
    wall_d = (f'M{x0*C} {dy0*C} V{y0*C} H{x1*C} V{y1*C} H{x0*C} V{dy1*C}')
    a(f'<path d="{wall_d}" stroke="{s["wall"]}" stroke-width="7" fill="none" stroke-linejoin="round" filter="{wall_filter}"/>')
    # Porta
    a(f'<rect x="{dx*C-4}" y="{dy0*C+4}" width="8" height="{C-8}" fill="{s["chest"]}" stroke="{s["ink"]}" stroke-width="1.5"/>')

    # Mesa
    tx, ty, tw, th = TABLE
    a(f'<rect x="{tx*C}" y="{ty*C}" width="{tw*C}" height="{th*C}" rx="4" fill="{s["chest"]}" opacity="0.85" stroke="{s["ink"]}" stroke-width="1.5"/>')
    for i in range(3):
        cx = (tx + 0.45 + i*0.85) * C
        for cy in (ty*C - 9, (ty+th)*C + 9):
            a(f'<circle cx="{cx}" cy="{cy}" r="6" fill="{s["floor"]}" stroke="{s["ink"]}" stroke-width="1.3"/>')

    # Baú
    cx, cy = CHEST
    a(f'<rect x="{cx*C-12}" y="{cy*C-9}" width="24" height="18" rx="2" fill="{s["chest"]}" stroke="{s["ink"]}" stroke-width="1.5"/>'
      f'<line x1="{cx*C-12}" y1="{cy*C-2}" x2="{cx*C+12}" y2="{cy*C-2}" stroke="{s["ink"]}" stroke-width="1.2"/>'
      f'<rect x="{cx*C-2.5}" y="{cy*C-4}" width="5" height="5" fill="{s["ink"]}"/>')

    # Tochas (com luz)
    for tx, ty in TORCHES:
        a(f'<circle cx="{tx*C+C/2}" cy="{ty*C+10}" r="34" fill="#ffb347" opacity="{0.22 if key=="3-noturno" else 0.14}"/>')
        a(f'<circle cx="{tx*C+C/2}" cy="{ty*C+6}" r="4" fill="#ff8c2a" stroke="{s["ink"]}" stroke-width="1"/>')

    # Árvores
    for y, row in enumerate(LAYOUT):
        for x, ch in enumerate(row):
            if ch == "T":
                cx, cy = x*C + C/2, y*C + C/2
                pts = []
                for i in range(14):
                    ang = i / 14 * math.tau
                    r = 24 + (5 if i % 2 else 0) + rnd.uniform(-2, 2)
                    pts.append(f'{cx + r*math.cos(ang):.1f},{cy + r*math.sin(ang):.1f}')
                a(f'<ellipse cx="{cx+4}" cy="{cy+5}" rx="26" ry="24" fill="#000" opacity="0.18"/>')
                a(f'<polygon points="{" ".join(pts)}" fill="{s["tree"]}" stroke="{s["tree_line"]}" stroke-width="2" stroke-linejoin="round"/>')
                a(f'<circle cx="{cx-6}" cy="{cy-6}" r="7" fill="#fff" opacity="0.12"/>')

    # Token de exemplo
    a(f'<circle cx="{1.5*C}" cy="{4.5*C}" r="15" fill="#c8483c" stroke="#fff" stroke-width="3"/>'
      f'<text x="{1.5*C}" y="{4.5*C+5}" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#fff">A</text>')

    # Textura de papel / grão
    if s["texture"] == "paper":
        a(f'<rect width="100%" height="100%" fill="#7a5a2a" filter="url(#grain)" opacity="0.9"/>')
        a(f'<rect width="100%" height="100%" fill="none" stroke="{s["ink"]}" stroke-width="6" opacity="0.5"/>')

    # Rótulo
    label_bg = "#00000088" if key == "3-noturno" else "#ffffffcc"
    label_fg = "#e8f6ff" if key == "3-noturno" else "#222"
    a(f'<rect x="10" y="{H*C-38}" width="{len(s["nome"])*11+30}" height="28" rx="6" fill="{label_bg}"/>'
      f'<text x="24" y="{H*C-19}" font-family="sans-serif" font-size="16" font-weight="700" fill="{label_fg}">{s["nome"]}</text>')
    a('</svg>')
    return "\n".join(out)


if __name__ == "__main__":
    dest = Path(__file__).resolve().parent.parent / "docs" / "estilos"
    dest.mkdir(parents=True, exist_ok=True)
    for key, s in STYLES.items():
        (dest / f"{key}.svg").write_text(svg_for(key, s), encoding="utf-8")
        print("ok", key)
