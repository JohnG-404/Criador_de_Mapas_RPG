import type { MapDocument } from '../core/doc/MapDocument';
import { isCustomAsset, objectAsset } from '../core/doc/objects';
import { wallStyleOf } from '../core/doc/walls';

/**
 * Descrição da cena 3D calculada a partir do documento, sem three.js.
 * Unidade: 1 = uma célula. Eixo x = colunas, z = linhas, y = altura.
 */

export const WALL_HEIGHTS = { baixa: 0.6, media: 1.2, alta: 2 } as const;
export type WallHeight = keyof typeof WALL_HEIGHTS;

export const WALL_THICKNESS = 0.26;
export const WATER_DEPTH = 0.28;
const WATER_TERRAIN = 3;

export interface Box {
  /** Centro no plano. */
  x: number;
  z: number;
  /** Comprimento (eixo local x), altura e espessura. */
  len: number;
  height: number;
  thick: number;
  /** Altura da base. */
  y0: number;
  /** Rotação em torno do eixo y (radianos, convenção do three.js). */
  rotY: number;
  kind: 'wall' | 'door' | 'jamb';
  style: string;
}

export interface Prop {
  id: string;
  asset: string;
  x: number;
  z: number;
  w: number;
  d: number;
  rotY: number;
  /** Altura do volume (0 = rente ao chão). */
  height: number;
  /** Altura onde o volume começa (copa da árvore fica no alto). */
  base: number;
  /** Tronco (só árvores). */
  trunk?: { radius: number; height: number };
}

export interface Mini {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  size: number;
}

export interface SceneData {
  cols: number;
  rows: number;
  /** Tamanho do mundo em células (hex é um pouco diferente de cols × rows). */
  width: number;
  depth: number;
  boxes: Box[];
  props: Prop[];
  minis: Mini[];
  hasWater: boolean;
}

/** Altura (em células) do volume de cada objeto do catálogo. Ausente = rente ao chão. */
export const PROP_HEIGHTS: Record<string, number> = {
  arbusto: 0.7, rochas: 0.6, barril: 0.65, bau: 0.45, mesa: 0.5, tocha: 1.1,
  caixote: 0.45, 'caixote-longo': 0.45, 'bau-ferro': 0.45, pedregulho: 0.85, pedra: 0.4,
  tronco: 0.25, 'mesa-redonda': 0.5, 'mesa-piquenique': 0.5, 'rochas-quebradas': 0.35,
  'rocha-grande': 0.95, 'pedra-vermelha': 0.25, 'rocha-escura': 0.45, 'galho-seco': 0.15,
  samambaia: 0.5, fogueira: 0.25, estatua: 1.4, 'mesa-pequena': 0.5, banco: 0.3,
  banquinho: 0.3, cadeira: 0.6, comoda: 0.6, balde: 0.3, cesto: 0.3, vaso: 0.45,
};

function segmentBox(ax: number, az: number, bx: number, bz: number, extra: number, base: Omit<Box, 'x' | 'z' | 'len' | 'rotY'>): Box | null {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return null;
  return { ...base, x: (ax + bx) / 2, z: (az + bz) / 2, len: len + extra, rotY: -Math.atan2(dz, dx) };
}

export function buildSceneData(doc: MapDocument, wallHeight: WallHeight = 'media'): SceneData {
  const cell = doc.grid.cellSize;
  const H = WALL_HEIGHTS[wallHeight];
  const bounds = doc.grid.worldBounds();
  const boxes: Box[] = [];

  for (const s of doc.walls.all()) {
    const ax = s.a.x / cell, az = s.a.y / cell, bx = s.b.x / cell, bz = s.b.y / cell;
    const style = wallStyleOf(s);
    if (s.kind === 'wall') {
      // Estende meia espessura em cada ponta para fechar os cantos.
      const b = segmentBox(ax, az, bx, bz, WALL_THICKNESS, { height: H, thick: WALL_THICKNESS, y0: 0, kind: 'wall', style });
      if (b) boxes.push(b);
      continue;
    }
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = -uz, nz = ux;
    const jamb = 0.12;
    const doorH = Math.min(H, 1.4) * 0.92;
    // Batentes nas duas pontas e verga por cima (quando a parede é mais alta que a porta).
    for (const [s0, s1] of [[0, jamb], [len - jamb, len]]) {
      const b = segmentBox(ax + ux * s0, az + uz * s0, ax + ux * s1, az + uz * s1, 0, { height: H, thick: WALL_THICKNESS * 1.1, y0: 0, kind: 'jamb', style });
      if (b) boxes.push(b);
    }
    if (H > doorH + 0.02) {
      const b = segmentBox(ax, az, bx, bz, 0, { height: H - doorH, thick: WALL_THICKNESS, y0: doorH, kind: 'wall', style });
      if (b) boxes.push(b);
    }
    // Folha: fechada fica no vão; aberta gira 80° em torno da dobradiça (lado "a"), para o lado +n, como no 2D.
    const L = len - jamb * 2;
    const hx = ax + ux * jamb, hz = az + uz * jamb;
    const ang = s.open ? (80 * Math.PI) / 180 : 0;
    const vx = ux * Math.cos(ang) + nx * Math.sin(ang);
    const vz = uz * Math.cos(ang) + nz * Math.sin(ang);
    const leaf = segmentBox(hx, hz, hx + vx * L, hz + vz * L, 0, { height: doorH, thick: 0.08, y0: 0, kind: 'door', style });
    if (leaf) boxes.push(leaf);
  }

  const props: Prop[] = [];
  for (const o of doc.objects.all()) {
    const a = objectAsset(o.asset);
    if (!a) continue;
    const w = a.w * o.scale, d = a.h * o.scale;
    const p: Prop = {
      id: o.id, asset: o.asset, x: o.x / cell, z: o.y / cell, w, d,
      rotY: (-o.rot * Math.PI) / 180, height: 0, base: 0,
    };
    if (o.asset === 'arvore') {
      p.base = 1.25 * o.scale;
      p.height = 1.25 * o.scale;
      p.trunk = { radius: 0.13 * o.scale, height: 1.5 * o.scale };
    } else if (!isCustomAsset(o.asset)) {
      p.height = (PROP_HEIGHTS[o.asset] ?? 0) * o.scale;
    }
    props.push(p);
  }

  const minis: Mini[] = doc.tokens.all().map((t) => ({
    id: t.id, name: t.name, color: t.color, x: t.x / cell, z: t.y / cell, size: t.size,
  }));

  let hasWater = false;
  const { cols, rows } = doc.grid;
  for (let r = 0; r < rows && !hasWater; r++) for (let c = 0; c < cols; c++) if (doc.terrain.get(c, r) === WATER_TERRAIN) { hasWater = true; break; }

  return { cols, rows, width: bounds.width / cell, depth: bounds.height / cell, boxes, props, minis, hasWater };
}

/**
 * Altura do chão nos vértices de uma malha (segX × segZ divisões sobre o mundo):
 * a água afunda, com borda suave.
 */
export function groundHeights(doc: MapDocument, segX: number, segZ: number): Float32Array {
  const cell = doc.grid.cellSize;
  const b = doc.grid.worldBounds();
  const wet = (px: number, py: number) => {
    const c = doc.grid.worldToCell({ x: px, y: py });
    return c ? doc.terrain.get(c.col, c.row) === WATER_TERRAIN : false;
  };
  const out = new Float32Array((segX + 1) * (segZ + 1));
  const r = cell * 0.35;
  for (let j = 0; j <= segZ; j++) {
    for (let i = 0; i <= segX; i++) {
      const px = b.x + (i / segX) * b.width;
      const py = b.y + (j / segZ) * b.height;
      // Fundo só onde o ponto e os vizinhos próximos são água: margem com rampa.
      let n = 0;
      for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (wet(px + ox, py + oy)) n++;
      out[j * (segX + 1) + i] = n ? -WATER_DEPTH * (n / 5) ** 1.5 : 0;
    }
  }
  return out;
}
