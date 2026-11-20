import type { Item } from './ItemLayer';
import type { Point } from '../grid/GridSystem';

/** Objeto colocado no mapa (árvore, mesa, baú...). Posição = centro, em pixels do mundo. */
export interface MapObject extends Item {
  asset: string;
  x: number;
  y: number;
  /** Graus, sentido horário. */
  rot: number;
  scale: number;
}

/** Ficha de personagem ou criatura. */
export interface Token extends Item {
  name: string;
  x: number;
  y: number;
  /** Diâmetro em células (1 = médio, 2 = grande...). */
  size: number;
  color: string;
  /** Personagem de jogador: a visão dele revela a névoa. */
  pc?: boolean;
  /** Alcance da visão em células (só para personagens de jogador). */
  vision?: number;
}

export const DEFAULT_VISION = 12;

/** Anotação do mestre presa no mapa (não aparece para os jogadores). */
export interface Note extends Item {
  x: number;
  y: number;
  text: string;
}

export function hitNote(n: Note, cellSize: number, p: Point): boolean {
  return Math.abs(p.x - n.x) <= cellSize * 0.4 && Math.abs(p.y - n.y) <= cellSize * 0.4;
}

export interface ObjectAsset {
  key: string;
  name: string;
  /** Tamanho padrão em células (largura × altura) com escala 1. */
  w: number;
  h: number;
}

/** Catálogo do estilo realista diurno (arte do SpriteCook). As imagens ficam em render/objectTextures.ts. */
export const OBJECT_ASSETS: readonly ObjectAsset[] = [
  { key: 'arvore', name: 'Árvore', w: 2.6, h: 2.4 },
  { key: 'arbusto', name: 'Arbusto', w: 1.3, h: 1.24 },
  { key: 'rochas', name: 'Rochas', w: 1.6, h: 1.6 },
  { key: 'barril', name: 'Barril', w: 0.9, h: 0.9 },
  { key: 'bau', name: 'Baú', w: 1.2, h: 0.85 },
  { key: 'mesa', name: 'Mesa', w: 2.6, h: 1.6 },
  { key: 'tapete', name: 'Tapete', w: 3, h: 2.38 },
  { key: 'tocha', name: 'Tocha', w: 0.4, h: 1.25 },
];

export function objectAsset(key: string) {
  return OBJECT_ASSETS.find((a) => a.key === key);
}

export const TOKEN_COLORS = ['#b8322c', '#2e6fb5', '#3c8a3e', '#c28b1e', '#7b4bb0', '#5c5c5c'];

/** O ponto está dentro do retângulo girado do objeto? */
export function hitObject(o: MapObject, cellSize: number, p: Point): boolean {
  const a = objectAsset(o.asset);
  if (!a) return false;
  const rad = (-o.rot * Math.PI) / 180;
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= (a.w * cellSize * o.scale) / 2 && Math.abs(ly) <= (a.h * cellSize * o.scale) / 2;
}

export function hitToken(t: Token, cellSize: number, p: Point): boolean {
  return Math.hypot(p.x - t.x, p.y - t.y) <= (t.size * cellSize) / 2;
}
