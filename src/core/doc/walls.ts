import type { Cell, GridSystem, Point } from '../grid/GridSystem';
import type { Item } from './ItemLayer';

export type WallKind = 'wall' | 'door';

/** Segmento de parede ou porta, com as pontas nos vértices do grid (coordenadas do mundo). */
export interface WallSegment extends Item {
  a: Point;
  b: Point;
  kind: WallKind;
  /** Só portas: aberta não bloqueia a visão. */
  open?: boolean;
  /** Só paredes: tema da textura (ver WALL_STYLES). Ausente = DEFAULT_WALL_STYLE. */
  style?: string;
}

export interface WallStyle {
  key: string;
  name: string;
}

/** Temas de parede do estilo realista. As texturas ficam em render/objectTextures.ts. */
export const WALL_STYLES: readonly WallStyle[] = [
  { key: 'pedra', name: 'Pedra' },
  { key: 'pedra-antiga', name: 'Pedra antiga' },
  { key: 'pedra-musgo', name: 'Pedra com musgo' },
  { key: 'tijolo', name: 'Tijolo' },
  { key: 'madeira', name: 'Madeira' },
  { key: 'caverna', name: 'Rocha de caverna' },
];

export const DEFAULT_WALL_STYLE = 'pedra';

export function wallStyleOf(s: WallSegment): string {
  return s.style && WALL_STYLES.some((w) => w.key === s.style) ? s.style : DEFAULT_WALL_STYLE;
}

/** Campo `style` para gravar numa parede (omitido no tema padrão, para arquivos antigos continuarem iguais). */
export function styleField(style: string | undefined): { style?: string } {
  return style && style !== DEFAULT_WALL_STYLE && WALL_STYLES.some((w) => w.key === style) ? { style } : {};
}

/** A parede (ou porta fechada) bloqueia a visão? */
export function blocksSight(s: WallSegment) {
  return s.kind === 'wall' || !s.open;
}

/**
 * O segmento p→q cruza o segmento a→b? Encostar na parede (inclusive nas
 * pontas dela) conta como cruzar; as pontas de p→q não contam.
 */
export function crossesSegment(p: Point, q: Point, a: Point, b: Point) {
  const rx = q.x - p.x, ry = q.y - p.y;
  const sx = b.x - a.x, sy = b.y - a.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return false; // paralelos
  const qpx = a.x - p.x, qpy = a.y - p.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  return t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6;
}

const EPS = 1e-3;

/** Vértice do grid mais próximo do ponto (canto de célula). */
export function snapToVertex(grid: GridSystem, p: Point): Point {
  if (grid.kind === 'square') {
    const s = grid.cellSize;
    const b = grid.worldBounds();
    return {
      x: Math.min(b.width, Math.max(0, Math.round(p.x / s) * s)),
      y: Math.min(b.height, Math.max(0, Math.round(p.y / s) * s)),
    };
  }
  const b = grid.worldBounds();
  const clamped = { x: Math.min(b.width - 1, Math.max(1, p.x)), y: Math.min(b.height - 1, Math.max(1, p.y)) };
  const cell = grid.worldToCell(clamped) ?? nearestCellFallback(grid, clamped);
  let best = p;
  let bestD = Infinity;
  for (const c of [cell, ...grid.neighbors(cell)]) {
    for (const v of grid.cellPolygon(c)) {
      const d = (v.x - p.x) ** 2 + (v.y - p.y) ** 2;
      if (d < bestD) { bestD = d; best = v; }
    }
  }
  return round(best);
}

function nearestCellFallback(grid: GridSystem, p: Point): Cell {
  const col = Math.min(grid.cols - 1, Math.max(0, Math.floor(p.x / grid.cellSize)));
  const row = Math.min(grid.rows - 1, Math.max(0, Math.round(p.y / grid.cellSize)));
  return { col, row };
}

function round(p: Point): Point {
  return { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 };
}

/** Aresta de célula mais próxima do ponto (para colocar portas). */
export function nearestEdge(grid: GridSystem, p: Point): { a: Point; b: Point } | null {
  const cell = grid.worldToCell(p);
  if (!cell) return null;
  const poly = grid.cellPolygon(cell);
  let best: { a: Point; b: Point } | null = null;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = distToSegment(p, a, b);
    if (d < bestD) { bestD = d; best = { a: round(a), b: round(b) }; }
  }
  return best;
}

export function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Segmento mais próximo do ponto, dentro da distância máxima. */
export function hitSegment<T extends WallSegment>(segments: T[], p: Point, maxDist: number): T | null {
  let best: T | null = null;
  let bestD = maxDist;
  for (const s of segments) {
    const d = distToSegment(p, s.a, s.b);
    if (d <= bestD) { bestD = d; best = s; }
  }
  return best;
}

/** As quatro paredes de um retângulo entre dois vértices. */
export function rectangleSegments(a: Point, b: Point): [Point, Point][] {
  const tl = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const br = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const tr = { x: br.x, y: tl.y };
  const bl = { x: tl.x, y: br.y };
  if (tl.x === br.x || tl.y === br.y) return [[a, b]];
  return [[tl, tr], [tr, br], [br, bl], [bl, tl]];
}

/**
 * Partes de `seg` que sobram depois de tirar o trecho [cutA, cutB], se o
 * corte for colinear e sobreposto. Retorna null se não houver sobreposição.
 */
export function subtractCollinear(seg: { a: Point; b: Point }, cutA: Point, cutB: Point): [Point, Point][] | null {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  const cross = (p: Point) => ((p.x - seg.a.x) * dy - (p.y - seg.a.y) * dx) / len;
  if (Math.abs(cross(cutA)) > EPS || Math.abs(cross(cutB)) > EPS) return null;
  const t = (p: Point) => ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / (len * len);
  let t0 = t(cutA);
  let t1 = t(cutB);
  if (t0 > t1) [t0, t1] = [t1, t0];
  if (t1 <= EPS || t0 >= 1 - EPS) return null;
  const at = (k: number): Point => round({ x: seg.a.x + dx * k, y: seg.a.y + dy * k });
  const out: [Point, Point][] = [];
  if (t0 > EPS) out.push([seg.a, at(t0)]);
  if (t1 < 1 - EPS) out.push([at(t1), seg.b]);
  return out;
}

export function samePoint(a: Point, b: Point) {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}
