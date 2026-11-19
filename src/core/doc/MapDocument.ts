import { HexGrid } from '../grid/HexGrid';
import type { GridKind, GridSystem } from '../grid/GridSystem';
import { SquareGrid } from '../grid/SquareGrid';
import { ItemLayer } from './ItemLayer';
import type { MapObject, Token } from './objects';
import { TerrainLayer } from './TerrainLayer';
import type { WallSegment } from './walls';

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
  readonly walls = new ItemLayer<WallSegment>();
  readonly objects = new ItemLayer<MapObject>();
  readonly tokens = new ItemLayer<Token>();

  constructor(readonly options: NewMapOptions) {
    const { gridKind, cols, rows } = options;
    this.grid = gridKind === 'hex' ? new HexGrid(cols, rows, DEFAULT_CELL_PX) : new SquareGrid(cols, rows, DEFAULT_CELL_PX);
    this.terrain = new TerrainLayer(cols, rows, options.fill);
  }
}
