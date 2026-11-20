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
  // Texturas CC0 do Poly Haven.
  { id: 5, key: 'areia', name: 'Areia', color: 0x8e7651 },
  { id: 6, key: 'neve', name: 'Neve', color: 0xadadad },
  { id: 7, key: 'lama', name: 'Lama', color: 0x524534 },
  { id: 8, key: 'cascalho', name: 'Cascalho', color: 0x906e4c },
  { id: 9, key: 'chao-floresta', name: 'Chão de floresta', color: 0x705836 },
  { id: 10, key: 'calcamento', name: 'Calçamento', color: 0x928066 },
  { id: 11, key: 'calcamento-musgo', name: 'Calçamento com musgo', color: 0x7c6b3f },
  { id: 12, key: 'piso-madeira', name: 'Piso de madeira', color: 0x644f3e },
];

export function terrainById(id: number): TerrainType | undefined {
  return TERRAINS.find((t) => t.id === id);
}
