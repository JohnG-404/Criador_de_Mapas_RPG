/** Coordenada de uma célula do grid (em unidades de célula, não pixels). */
export interface Cell {
  col: number;
  row: number;
}

/** Ponto no espaço do mundo (pixels do mapa, antes do zoom da câmera). */
export interface Point {
  x: number;
  y: number;
}

/** Retângulo no espaço do mundo. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellRange {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export type GridKind = 'square' | 'hex';

/**
 * Abstração do tipo de grid. As ferramentas do editor só conversam com esta
 * interface, então trocar grid quadrado por hexagonal não muda as ferramentas.
 */
export interface GridSystem {
  readonly kind: GridKind;
  /** Largura do mapa em células. */
  readonly cols: number;
  /** Altura do mapa em células. */
  readonly rows: number;
  /** Largura de uma célula em pixels do mundo (no hex: de lado plano a lado plano). */
  readonly cellSize: number;

  /** Tamanho total do mapa em pixels do mundo. */
  worldBounds(): Rect;
  /** Centro da célula em coordenadas do mundo. */
  cellToWorld(cell: Cell): Point;
  /** Célula que contém o ponto, ou null se estiver fora do mapa. */
  worldToCell(point: Point): Cell | null;
  /** Células (intervalo inclusivo) que podem cruzar o retângulo, limitado ao mapa. */
  cellRangeInRect(rect: Rect): CellRange | null;
  /** Vértices do contorno da célula, para desenho e destaque. */
  cellPolygon(cell: Cell): Point[];
  /** Vizinhos dentro do mapa (4 no quadrado, 6 no hex). */
  neighbors(cell: Cell): Cell[];
  /** Distância em células entre duas células. */
  distance(a: Cell, b: Cell): number;
  /** Células do pincel: `radius` 0 é só a célula central. */
  cellsInRadius(center: Cell, radius: number): Cell[];
}

export function inBounds(grid: { cols: number; rows: number }, c: Cell) {
  return c.col >= 0 && c.row >= 0 && c.col < grid.cols && c.row < grid.rows;
}

export function sameCell(a: Cell | null, b: Cell | null) {
  return a?.col === b?.col && a?.row === b?.row;
}
