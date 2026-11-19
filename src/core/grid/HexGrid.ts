import { inBounds, type Cell, type CellRange, type GridSystem, type Point, type Rect } from './GridSystem';

const SQRT3 = Math.sqrt(3);

interface Cube { q: number; r: number; s: number }

/**
 * Grid hexagonal "pointy-top" (vértice para cima), armazenado em coordenadas
 * de deslocamento "odd-r": linhas ímpares ficam meia célula para a direita.
 * `cellSize` é a largura do hexágono (de lado plano a lado plano).
 * Matemática baseada em coordenadas cúbicas/axiais.
 */
export class HexGrid implements GridSystem {
  readonly kind = 'hex' as const;
  /** Raio (centro até vértice). */
  readonly radius: number;
  /** Distância vertical entre centros de linhas vizinhas. */
  readonly rowStep: number;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cellSize: number,
  ) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
      throw new Error(`Tamanho de grid inválido: ${cols}×${rows}`);
    }
    if (!(cellSize > 0)) throw new Error(`Tamanho de célula inválido: ${cellSize}`);
    this.radius = cellSize / SQRT3;
    this.rowStep = this.radius * 1.5;
  }

  worldBounds(): Rect {
    const width = this.cellSize * this.cols + (this.rows > 1 ? this.cellSize / 2 : 0);
    const height = this.rowStep * (this.rows - 1) + this.radius * 2;
    return { x: 0, y: 0, width, height };
  }

  cellToWorld({ col, row }: Cell): Point {
    return {
      x: this.cellSize * (col + 0.5 * (row & 1)) + this.cellSize / 2,
      y: this.radius + row * this.rowStep,
    };
  }

  worldToCell({ x, y }: Point): Cell | null {
    const px = x - this.cellSize / 2;
    const py = y - this.radius;
    const q = ((SQRT3 / 3) * px - py / 3) / this.radius;
    const r = ((2 / 3) * py) / this.radius;
    const cube = cubeRound({ q, r, s: -q - r });
    const cell = cubeToOffset(cube);
    return inBounds(this, cell) ? cell : null;
  }

  cellRangeInRect(rect: Rect): CellRange | null {
    const minRow = Math.max(0, Math.floor((rect.y - this.radius * 2) / this.rowStep));
    const maxRow = Math.min(this.rows - 1, Math.ceil((rect.y + rect.height) / this.rowStep));
    const minCol = Math.max(0, Math.floor(rect.x / this.cellSize) - 1);
    const maxCol = Math.min(this.cols - 1, Math.ceil((rect.x + rect.width) / this.cellSize));
    if (minCol > maxCol || minRow > maxRow) return null;
    return { minCol, maxCol, minRow, maxRow };
  }

  /** Vértices em sentido horário a partir do inferior direito (30°, com y para baixo). */
  cellPolygon(cell: Cell): Point[] {
    const c = this.cellToWorld(cell);
    const pts: Point[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (30 + 60 * i);
      pts.push({ x: c.x + this.radius * Math.cos(a), y: c.y + this.radius * Math.sin(a) });
    }
    return pts;
  }

  neighbors({ col, row }: Cell): Cell[] {
    const dirs = row & 1 ? ODD_ROW_DIRS : EVEN_ROW_DIRS;
    return dirs.map(([dc, dr]) => ({ col: col + dc, row: row + dr })).filter((c) => inBounds(this, c));
  }

  distance(a: Cell, b: Cell): number {
    const ca = offsetToCube(a);
    const cb = offsetToCube(b);
    return Math.max(Math.abs(ca.q - cb.q), Math.abs(ca.r - cb.r), Math.abs(ca.s - cb.s));
  }

  cellsInRadius(center: Cell, radius: number): Cell[] {
    const r = Math.max(0, Math.floor(radius));
    const out: Cell[] = [];
    for (let row = center.row - r; row <= center.row + r; row++) {
      for (let col = center.col - r - 1; col <= center.col + r + 1; col++) {
        const c = { col, row };
        if (inBounds(this, c) && this.distance(center, c) <= r) out.push(c);
      }
    }
    return out;
  }
}

const EVEN_ROW_DIRS = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]] as const;
const ODD_ROW_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] as const;

function offsetToCube({ col, row }: Cell): Cube {
  const q = col - (row - (row & 1)) / 2;
  return { q, r: row, s: -q - row };
}

function cubeToOffset({ q, r }: Cube): Cell {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

function cubeRound(c: Cube): Cube {
  let q = Math.round(c.q);
  let r = Math.round(c.r);
  let s = Math.round(c.s);
  const dq = Math.abs(q - c.q);
  const dr = Math.abs(r - c.r);
  const ds = Math.abs(s - c.s);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  else s = -q - r;
  return { q: q + 0, r: r + 0, s: s + 0 };
}
