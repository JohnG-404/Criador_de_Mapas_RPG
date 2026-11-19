/** Tipos de terreno. O id é o que vai salvo no arquivo; 0 é "vazio". */
export interface TerrainType {
  id: number;
  key: string;
  name: string;
  /** Cor média, usada em miniaturas e enquanto a textura carrega. */
  color: number;
}

export const EMPTY = 0;

export const TERRAINS: readonly TerrainType[] = [
  { id: 1, key: 'grama', name: 'Grama', color: 0x5b7f2c },
  { id: 2, key: 'terra', name: 'Terra', color: 0x9a7246 },
  { id: 3, key: 'agua', name: 'Água', color: 0x1f5f5a },
  { id: 4, key: 'piso-pedra', name: 'Piso de pedra', color: 0x5f5d58 },
];

export function terrainById(id: number): TerrainType | undefined {
  return TERRAINS.find((t) => t.id === id);
}
