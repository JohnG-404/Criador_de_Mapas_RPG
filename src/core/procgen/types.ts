import type { Point } from '../grid/GridSystem';

export type GeneratorKind = 'dungeon' | 'cave' | 'region';

export interface GenObject { asset: string; x: number; y: number; rot: number; scale: number }

/** Resultado de um gerador: o documento é substituído por isto num único passo do histórico. */
export interface GenResult {
  /** Terreno de cada célula, linha a linha (cols × rows). */
  terrain: Uint8Array;
  walls: { a: Point; b: Point; kind: 'wall' | 'door' }[];
  objects: GenObject[];
}

export interface GenParams {
  cols: number;
  rows: number;
  cellSize: number;
  seed: number;
  /** Só masmorras precisam de grid quadrado (paredes nas bordas das células). */
  hex: boolean;
  /** Centro da célula no mundo (o grid hexagonal desloca as linhas). */
  center(col: number, row: number): Point;
}
