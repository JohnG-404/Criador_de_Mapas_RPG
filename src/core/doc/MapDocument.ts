import { HexGrid } from '../grid/HexGrid';
import type { GridKind, GridSystem } from '../grid/GridSystem';
import { SquareGrid } from '../grid/SquareGrid';
import { TerrainLayer } from './TerrainLayer';

export interface NewMapOptions {
  name: string;
  gridKind: GridKind;
  cols: number;
  rows: number;
  /** Terreno inicial (id). */
  fill: number;
  /** Metros por célula (só informativo por enquanto). */
  cellMeters: number;
}

export const DEFAULT_CELL_PX = 32;

/** O mapa em edição: fonte da verdade, sem dependência de renderização. */
export class MapDocument {
  readonly grid: GridSystem;
  readonly terrain: TerrainLayer;

  constructor(readonly options: NewMapOptions) {
    const { gridKind, cols, rows } = options;
    this.grid = gridKind === 'hex' ? new HexGrid(cols, rows, DEFAULT_CELL_PX) : new SquareGrid(cols, rows, DEFAULT_CELL_PX);
    this.terrain = new TerrainLayer(cols, rows, options.fill);
  }
}
