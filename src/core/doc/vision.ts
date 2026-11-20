import type { Cell, GridSystem, Point } from '../grid/GridSystem';
import { blocksSight, crossesSegment, type WallSegment } from './walls';

/**
 * Células que um personagem vê de `origin`, até `radius` células, com as
 * paredes e portas fechadas bloqueando. Uma célula conta como vista se o
 * centro ou algum ponto perto dos cantos estiver à vista (assim o canto de
 * uma sala aparece mesmo olhando de lado).
 */
export function visibleCells(grid: GridSystem, origin: Point, radius: number, walls: WallSegment[]): Cell[] {
  const start = grid.worldToCell(origin);
  if (!start) return [];
  const blockers = walls.filter(blocksSight);
  const reach = (radius + 0.5) * grid.cellSize;
  // Só as paredes que podem estar no caminho.
  const near = blockers.filter((w) => distPointBox(origin, w) <= reach);
  const out: Cell[] = [];
  for (const cell of grid.cellsInRadius(start, radius)) {
    const c = grid.cellToWorld(cell);
    const samples: Point[] = [c, ...grid.cellPolygon(cell).map((v) => ({ x: c.x + (v.x - c.x) * 0.7, y: c.y + (v.y - c.y) * 0.7 }))];
    if (samples.some((s) => near.every((w) => !crossesSegment(origin, s, w.a, w.b)))) out.push(cell);
  }
  return out;
}

function distPointBox(p: Point, w: WallSegment) {
  const minX = Math.min(w.a.x, w.b.x), maxX = Math.max(w.a.x, w.b.x);
  const minY = Math.min(w.a.y, w.b.y), maxY = Math.max(w.a.y, w.b.y);
  const dx = Math.max(minX - p.x, 0, p.x - maxX);
  const dy = Math.max(minY - p.y, 0, p.y - maxY);
  return Math.hypot(dx, dy);
}
