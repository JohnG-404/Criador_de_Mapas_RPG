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

/**
 * Abstração do tipo de grid. As ferramentas do editor só conversam com esta
 * interface, então trocar grid quadrado por hexagonal não muda as ferramentas.
 */
export interface GridSystem {
  readonly kind: 'square' | 'hex';
  /** Largura do mapa em células. */
  readonly cols: number;
  /** Altura do mapa em células. */
  readonly rows: number;
  /** Tamanho de uma célula em pixels do mundo. */
  readonly cellSize: number;

  /** Tamanho total do mapa em pixels do mundo. */
  worldBounds(): Rect;
  /** Centro da célula em coordenadas do mundo. */
  cellToWorld(cell: Cell): Point;
  /** Célula que contém o ponto, ou null se estiver fora do mapa. */
  worldToCell(point: Point): Cell | null;
  /** Células (intervalo inclusivo) que cruzam o retângulo, limitado ao mapa. */
  cellRangeInRect(rect: Rect): { minCol: number; maxCol: number; minRow: number; maxRow: number } | null;
  /** Vértices do contorno da célula, para desenho e destaque. */
  cellPolygon(cell: Cell): Point[];
}
