import type { Cell, GridSystem, Point } from '../grid/GridSystem';
import type { TerrainLayer } from './TerrainLayer';

/**
 * Elevação por célula, guardada numa TerrainLayer (Uint8) com deslocamento:
 * valor = nível + ELEV_ZERO. Cada nível vale 1/4 de célula de altura.
 */
export const ELEV_ZERO = 64;
export const ELEV_MIN = -24;
export const ELEV_MAX = 96;
export const LEVEL_HEIGHT = 0.25;

export type ElevMode = 'raise' | 'lower' | 'flatten' | 'smooth';

export function levelOf(layer: TerrainLayer, col: number, row: number) {
  return layer.get(col, row) - ELEV_ZERO;
}

export function clampLevel(level: number) {
  return Math.max(ELEV_MIN, Math.min(ELEV_MAX, Math.round(level)));
}

export function hasRelief(layer: TerrainLayer) {
  for (let r = 0; r < layer.rows; r++) for (let c = 0; c < layer.cols; c++) if (layer.get(c, r) !== ELEV_ZERO) return true;
  return false;
}

/** Distância (em células) do centro da célula ao segmento a–b do pincel. */
export function distanceToStroke(grid: GridSystem, cell: Cell, a: Point, b: Point): number {
  const p = grid.cellToWorld(cell);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) / grid.cellSize;
}

/**
 * Quanto subir/baixar uma célula: forte no centro do pincel e suave na borda,
 * para os morros saírem arredondados. Sempre pelo menos 1 nível dentro do pincel.
 */
export function brushAmount(strength: number, dist: number, radius: number) {
  const d = Math.min(1, dist / (radius + 0.75));
  return Math.max(1, Math.round(strength * (1 - d * d)));
}

/** Média dos níveis da célula e das vizinhas (pincel Suavizar). */
export function smoothedLevel(grid: GridSystem, layer: TerrainLayer, cell: Cell) {
  const ns = grid.neighbors(cell);
  let sum = levelOf(layer, cell.col, cell.row) * 2;
  for (const n of ns) sum += levelOf(layer, n.col, n.row);
  return Math.round(sum / (ns.length + 2));
}
