import type { Item } from './ItemLayer';
import type { Point } from '../grid/GridSystem';
import type { TokenSheet } from './tokenTemplates';

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
  /** Modelo de origem (arte e sistema), ver tokenTemplates.ts. */
  template?: string;
  /** Imagem própria do token: id de uma imagem em doc.assets (vale mais que a arte do modelo). */
  art?: string;
  /** Ficha básica (PV, defesa, sanidade...). */
  sheet?: TokenSheet;
}

export const DEFAULT_VISION = 12;

/** Anotação do mestre presa no mapa (não aparece para os jogadores). */
export interface Note extends Item {
  x: number;
  y: number;
  text: string;
}

/**
 * Passagem para outro mapa da campanha (escada, porta, portal...).
 * Fica no centro de uma célula e só o mestre vê o marcador.
 */
export interface MapLink extends Item {
  x: number;
  y: number;
  /** Id do mapa de destino ('' = sem destino ainda). */
  target: string;
  label: string;
}

export function hitLink(l: MapLink, cellSize: number, p: Point): boolean {
  return Math.hypot(p.x - l.x, p.y - l.y) <= cellSize * 0.45;
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

/** Catálogo do estilo realista diurno (SpriteCook + Poly Haven/Blender). As imagens ficam em render/objectTextures.ts. */
export const OBJECT_ASSETS: readonly ObjectAsset[] = [
  { key: 'arvore', name: 'Árvore', w: 2.6, h: 2.4 },
  { key: 'arbusto', name: 'Arbusto', w: 1.3, h: 1.24 },
  { key: 'rochas', name: 'Rochas', w: 1.6, h: 1.6 },
  { key: 'barril', name: 'Barril', w: 0.9, h: 0.9 },
  { key: 'bau', name: 'Baú', w: 1.2, h: 0.85 },
  { key: 'mesa', name: 'Mesa', w: 2.6, h: 1.6 },
  { key: 'tapete', name: 'Tapete', w: 3, h: 2.38 },
  { key: 'tocha', name: 'Tocha', w: 0.4, h: 1.25 },
  // Modelos CC0 do Poly Haven renderizados no Blender.
  { key: 'caixote', name: 'Caixote', w: 1.2, h: 0.6 },
  { key: 'caixote-longo', name: 'Caixote longo', w: 1.6, h: 0.68 },
  { key: 'bau-ferro', name: 'Baú de ferro', w: 1.3, h: 0.71 },
  { key: 'pedregulho', name: 'Pedregulho', w: 1, h: 1.43 },
  { key: 'pedra', name: 'Pedra', w: 0.7, h: 1.05 },
  { key: 'tronco', name: 'Tronco caído', w: 2.6, h: 0.25 },
  { key: 'mesa-redonda', name: 'Mesa redonda', w: 1.4, h: 1.4 },
  { key: 'mesa-piquenique', name: 'Mesa de piquenique', w: 2.4, h: 1.78 },
  { key: 'rochas-quebradas', name: 'Rochas quebradas', w: 1.8, h: 0.88 },
  { key: 'rocha-grande', name: 'Rocha grande', w: 1.7, h: 1.68 },
  { key: 'pedra-vermelha', name: 'Pedra avermelhada', w: 0.8, h: 0.49 },
  { key: 'rocha-escura', name: 'Rocha escura', w: 0.55, h: 1.04 },
  { key: 'galho-seco', name: 'Galho seco', w: 2.4, h: 0.64 },
  { key: 'samambaia', name: 'Samambaia', w: 1, h: 0.9 },
  { key: 'fogueira', name: 'Fogueira de pedra', w: 1.3, h: 1.29 },
  { key: 'estatua', name: 'Estátua', w: 1.4, h: 1.47 },
  { key: 'mesa-pequena', name: 'Mesa pequena', w: 1.2, h: 0.75 },
  { key: 'banco', name: 'Banco', w: 1.2, h: 0.52 },
  { key: 'banquinho', name: 'Banquinho', w: 0.5, h: 0.52 },
  { key: 'cadeira', name: 'Cadeira', w: 0.55, h: 0.69 },
  { key: 'comoda', name: 'Cômoda', w: 1.2, h: 0.52 },
  { key: 'balde', name: 'Balde', w: 0.45, h: 0.42 },
  { key: 'cesto', name: 'Cesto', w: 0.55, h: 0.42 },
  { key: 'vaso', name: 'Vaso de cerâmica', w: 0.4, h: 0.4 },
];

/** Imagem importada pelo usuário e guardada dentro do mapa (data URL). */
export interface CustomAsset extends Item, ObjectAsset {
  /** data:image/...;base64,... */
  data: string;
  /** Retrato de token (não aparece na paleta de objetos). */
  token?: boolean;
}

export const CUSTOM_ASSET_PREFIX = 'img-';

/**
 * Imagens importadas conhecidas nesta janela. Os ids são únicos, então
 * basta acumular (um mapa aberto depois não apaga as de outro).
 */
const customAssets = new Map<string, CustomAsset>();

export function registerCustomAssets(list: CustomAsset[]) {
  for (const a of list) customAssets.set(a.key, a);
}

export function isCustomAsset(key: string) {
  return key.startsWith(CUSTOM_ASSET_PREFIX);
}

export function objectAsset(key: string): ObjectAsset | CustomAsset | undefined {
  return customAssets.get(key) ?? OBJECT_ASSETS.find((a) => a.key === key);
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
