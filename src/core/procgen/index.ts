import { generateCave } from './cave';
import { generateDungeon } from './dungeon';
import { generateRegion } from './region';
import type { GeneratorKind, GenParams, GenResult } from './types';

export type { GeneratorKind, GenParams, GenResult } from './types';

export const GENERATORS: { kind: GeneratorKind; name: string; description: string; squareOnly: boolean }[] = [
  { kind: 'dungeon', name: 'Masmorra', description: 'Salas ligadas por corredores, com paredes, portas e mobília.', squareOnly: true },
  { kind: 'cave', name: 'Caverna', description: 'Túneis irregulares de terra com poças d’água e rochas.', squareOnly: false },
  { kind: 'region', name: 'Região', description: 'Campo aberto com lagos, matas e uma estrada.', squareOnly: false },
];

export function generate(kind: GeneratorKind, p: GenParams): GenResult {
  if (kind === 'dungeon') return generateDungeon(p);
  if (kind === 'cave') return generateCave(p);
  return generateRegion(p);
}
