import type { Cell, GridSystem, Point, Rect } from './GridSystem';

export class SquareGrid implements GridSystem {
  readonly kind = 'square' as const;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cellSize: number,
  ) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
      throw new Error(`Tamanho de grid inválido: ${cols}×${rows}`);
    }
    if (!(cellSize > 0)) throw new Error(`Tamanho de célula inválido: ${cellSize}`);
  }

  worldBounds(): Rect {
    return { x: 0, y: 0, width: this.cols * this.cellSize, height: this.rows * this.cellSize };
  }

  cellToWorld({ col, row }: Cell): Point {
    return { x: (col + 0.5) * this.cellSize, y: (row + 0.5) * this.cellSize };
  }

  worldToCell({ x, y }: Point): Cell | null {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return { col, row };
  }

  cellRangeInRect(rect: Rect) {
    const s = this.cellSize;
    const minCol = Math.max(0, Math.floor(rect.x / s));
    const minRow = Math.max(0, Math.floor(rect.y / s));
    const maxCol = Math.min(this.cols - 1, Math.ceil((rect.x + rect.width) / s) - 1);
    const maxRow = Math.min(this.rows - 1, Math.ceil((rect.y + rect.height) / s) - 1);
    if (minCol > maxCol || minRow > maxRow) return null;
    return { minCol, maxCol, minRow, maxRow };
  }

  cellPolygon({ col, row }: Cell): Point[] {
    const s = this.cellSize;
    const x = col * s;
    const y = row * s;
    return [
      { x, y },
      { x: x + s, y },
      { x: x + s, y: y + s },
      { x, y: y + s },
    ];
  }
}
