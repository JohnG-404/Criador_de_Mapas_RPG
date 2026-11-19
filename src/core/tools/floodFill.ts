import type { TerrainLayer } from '../doc/TerrainLayer';
import type { Cell, GridSystem } from '../grid/GridSystem';

/**
 * Preenchimento (balde): todas as células conectadas com o mesmo terreno da
 * célula inicial. Usa os vizinhos do grid (4 no quadrado, 6 no hex).
 */
export function floodFill(grid: GridSystem, layer: TerrainLayer, start: Cell, maxCells = Infinity): Cell[] {
  const target = layer.getCell(start);
  const seen = new Uint8Array(grid.cols * grid.rows);
  const out: Cell[] = [];
  const stack: Cell[] = [start];
  seen[start.row * grid.cols + start.col] = 1;
  while (stack.length && out.length < maxCells) {
    const c = stack.pop()!;
    out.push(c);
    for (const n of grid.neighbors(c)) {
      const i = n.row * grid.cols + n.col;
      if (seen[i] || layer.getCell(n) !== target) continue;
      seen[i] = 1;
      stack.push(n);
    }
  }
  return out;
}
