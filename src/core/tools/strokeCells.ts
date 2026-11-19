import type { Cell, GridSystem, Point } from '../grid/GridSystem';

/**
 * Células cobertas por um traço de pincel entre dois pontos do mundo.
 * Amostra o segmento a cada meia célula, para não deixar buracos quando o
 * mouse se move rápido.
 */
export function strokeCells(grid: GridSystem, from: Point, to: Point, radius: number): Cell[] {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(dist / (grid.cellSize / 2)));
  const seen = new Set<number>();
  const out: Cell[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const center = grid.worldToCell({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    if (!center) continue;
    for (const c of grid.cellsInRadius(center, radius)) {
      const k = c.row * grid.cols + c.col;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}
