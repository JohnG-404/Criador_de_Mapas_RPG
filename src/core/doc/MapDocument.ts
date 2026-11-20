import { HexGrid } from '../grid/HexGrid';
import type { GridKind, GridSystem } from '../grid/GridSystem';
import { SquareGrid } from '../grid/SquareGrid';
import { ItemLayer, newId } from './ItemLayer';
import { registerCustomAssets, type CustomAsset, type MapLink, type MapObject, type Note, type Token } from './objects';
import { TerrainLayer } from './TerrainLayer';
import { ELEV_ZERO } from './elevation';
import type { WallSegment } from './walls';
import { InitiativeStore } from './initiative';

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
export const FOG_CLEAR = 0;
export const FOG_HIDDEN = 1;

/** O mapa em edição: fonte da verdade, sem dependência de renderização. */
export class MapDocument {
  readonly grid: GridSystem;
  readonly terrain: TerrainLayer;
  readonly walls = new ItemLayer<WallSegment>();
  readonly objects = new ItemLayer<MapObject>();
  readonly tokens = new ItemLayer<Token>();
  readonly notes = new ItemLayer<Note>();
  /** Passagens para outros mapas da campanha. */
  readonly links = new ItemLayer<MapLink>();
  /** Id estável do mapa dentro da campanha (as passagens apontam para ele). */
  id = newId('m');
  /** Imagens importadas usadas pelos objetos deste mapa. */
  readonly assets = new ItemLayer<CustomAsset>();
  /** Névoa de guerra: 1 = escondido dos jogadores, 0 = visível. Começa toda visível. */
  readonly fog: TerrainLayer;
  /** Altura de cada célula (ver elevation.ts). Começa toda no nível 0. */
  readonly elevation: TerrainLayer;
  /** Ordem de iniciativa do combate (ver initiative.ts). */
  readonly initiative = new InitiativeStore();

  constructor(readonly options: NewMapOptions) {
    const { gridKind, cols, rows } = options;
    this.grid = gridKind === 'hex' ? new HexGrid(cols, rows, DEFAULT_CELL_PX) : new SquareGrid(cols, rows, DEFAULT_CELL_PX);
    this.terrain = new TerrainLayer(cols, rows, options.fill);
    this.fog = new TerrainLayer(cols, rows, FOG_CLEAR);
    this.elevation = new TerrainLayer(cols, rows, ELEV_ZERO);
    this.assets.onChange(() => registerCustomAssets(this.assets.all()));
  }
}
