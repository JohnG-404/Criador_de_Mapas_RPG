/** Tipos de terreno. O id é o que vai salvo no arquivo; 0 é "vazio". */
export interface TerrainType {
  id: number;
  key: string;
  name: string;
  /** Cor média, usada em miniaturas e enquanto a textura carrega. */
  color: number;
}

export const EMPTY = 0;
/** Água: o renderizador clareia a margem. */
export const WATER_ID = 3;

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
  { id: 13, key: 'chao-caverna', name: 'Chão de caverna', color: 0x43392f },
  { id: 14, key: 'rocha-lisa', name: 'Rocha lisa', color: 0x8b8275 },
  { id: 15, key: 'pedras-soltas', name: 'Pedras soltas', color: 0x797060 },
  { id: 16, key: 'seixos', name: 'Seixos', color: 0x4d4135 },
  { id: 17, key: 'rocha-musgo', name: 'Rocha com musgo', color: 0x6d6a50 },
  { id: 18, key: 'folhas-secas', name: 'Folhas secas', color: 0x946f2b },
  { id: 19, key: 'terra-rachada', name: 'Terra rachada', color: 0xc79f75 },
  { id: 20, key: 'terra-queimada', name: 'Terra queimada', color: 0x635344 },
  { id: 21, key: 'trilha', name: 'Trilha', color: 0x887851 },
];

export function terrainById(id: number): TerrainType | undefined {
  return TERRAINS.find((t) => t.id === id);
}
