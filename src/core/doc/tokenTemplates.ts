/**
 * Modelos prontos de personagens e inimigos. A arte fica em
 * render/tokenArt.ts (assets/tokens/<chave>.webp).
 *
 * D&D: valores das criaturas do SRD 5.1 (CC-BY-4.0, ver assets/tokens/CREDITOS.md);
 * personagens de jogador com valores típicos de 1º nível.
 * Horror investigativo: arquétipos genéricos e originais, com ficha de PV,
 * Defesa e Sanidade, no estilo dos RPGs de investigação paranormal.
 */
export type TokenSystem = 'dnd' | 'horror';

export interface TokenSheet {
  hp: number;
  hpMax: number;
  /** Classe de Armadura (D&D) ou Defesa (horror). */
  def: number;
  /** Sanidade (só horror). */
  san?: number;
  sanMax?: number;
  /** Deslocamento em metros. */
  move: number;
  /** Nível de desafio (inimigos de D&D). */
  cr?: string;
}

export interface TokenTemplate {
  key: string;
  name: string;
  system: TokenSystem;
  kind: 'pc' | 'enemy';
  size: number;
  color: string;
  sheet: TokenSheet;
}

export const SYSTEMS: Record<TokenSystem, { name: string; def: string; san: boolean }> = {
  dnd: { name: 'D&D 5e', def: 'CA', san: false },
  horror: { name: 'Horror investigativo', def: 'Defesa', san: true },
};

const BLUE = '#2e6fb5', GREEN = '#3c8a3e', GOLD = '#c28b1e', PURPLE = '#7b4bb0', RED = '#b8322c', GRAY = '#5c5c5c';

const pc = (key: string, name: string, hp: number, def: number, color = BLUE, move = 9): TokenTemplate =>
  ({ key, name, system: 'dnd', kind: 'pc', size: 1, color, sheet: { hp, hpMax: hp, def, move } });
const mon = (key: string, name: string, hp: number, def: number, move: number, cr: string, size = 1, color = RED): TokenTemplate =>
  ({ key, name, system: 'dnd', kind: 'enemy', size, color, sheet: { hp, hpMax: hp, def, move, cr } });
const inv = (key: string, name: string, hp: number, def: number, san: number, color = GREEN): TokenTemplate =>
  ({ key, name, system: 'horror', kind: 'pc', size: 1, color, sheet: { hp, hpMax: hp, def, san, sanMax: san, move: 9 } });
const thr = (key: string, name: string, hp: number, def: number, move = 9, size = 1, color = RED): TokenTemplate =>
  ({ key, name, system: 'horror', kind: 'enemy', size, color, sheet: { hp, hpMax: hp, def, move } });

export const TOKEN_TEMPLATES: readonly TokenTemplate[] = [
  pc('guerreiro', 'Guerreiro', 12, 16),
  pc('patrulheiro', 'Patrulheiro', 12, 14, GREEN),
  pc('mago', 'Mago', 8, 12, PURPLE),
  pc('ladino', 'Ladino', 10, 14, GRAY),
  pc('clerigo', 'Clérigo', 10, 16, GOLD),
  pc('barbaro', 'Bárbaro', 15, 14),
  pc('bardo', 'Bardo', 9, 13, PURPLE),
  pc('anao-guerreiro', 'Anão guerreiro', 13, 16, GOLD, 7.5),
  mon('goblin', 'Goblin', 7, 15, 9, '1/4'),
  mon('kobold', 'Kobold', 5, 12, 9, '1/8'),
  mon('esqueleto', 'Esqueleto', 13, 13, 9, '1/4', 1, GRAY),
  mon('zumbi', 'Zumbi', 22, 8, 6, '1/4', 1, GRAY),
  mon('orc', 'Orc', 15, 13, 9, '1/2'),
  mon('lobo', 'Lobo', 11, 13, 12, '1/4', 1, GRAY),
  mon('cultista-medieval', 'Cultista', 9, 12, 9, '1/8'),
  mon('aranha-gigante', 'Aranha gigante', 26, 14, 9, '1', 2),
  mon('ogro', 'Ogro', 59, 11, 12, '2', 2),
  mon('dragao-jovem', 'Dragão vermelho jovem', 178, 18, 12, '10', 2),
  inv('investigador', 'Investigador', 20, 12, 18),
  inv('atirador', 'Atirador', 24, 14, 12, BLUE),
  inv('medico', 'Médica', 18, 11, 16, GOLD),
  inv('ocultista', 'Ocultista', 16, 11, 24, PURPLE),
  inv('jornalista', 'Jornalista', 18, 11, 16),
  inv('policial', 'Policial', 24, 14, 14, BLUE),
  inv('estudante', 'Estudante', 16, 11, 18, GOLD),
  thr('cultista', 'Cultista mascarado', 12, 12),
  thr('possuido', 'Possuído', 30, 13),
  thr('morto-vivo', 'Morto-vivo', 25, 10, 6, 1, GRAY),
  thr('espectro', 'Espectro', 35, 16, 12, 1, PURPLE),
  thr('cao-sombrio', 'Cão sombrio', 20, 14, 15, 1, GRAY),
  thr('sombra', 'Sombra', 40, 17, 12, 1, GRAY),
  thr('aberracao', 'Aberração', 60, 15, 9, 2),
];

export function tokenTemplate(key: string | undefined): TokenTemplate | undefined {
  return key ? TOKEN_TEMPLATES.find((t) => t.key === key) : undefined;
}

/** Ficha vinda de um arquivo: só números válidos, com limites. */
export function cleanSheet(s: unknown): TokenSheet | undefined {
  if (!s || typeof s !== 'object') return undefined;
  const o = s as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-max, Math.min(max, Math.round(v * 10) / 10)) : undefined);
  const hpMax = num(o.hpMax, 9999), hp = num(o.hp, 9999), def = num(o.def, 99), move = num(o.move, 999);
  if (hpMax === undefined || hp === undefined || def === undefined) return undefined;
  const out: TokenSheet = { hp, hpMax: Math.max(1, hpMax), def, move: move ?? 9 };
  const san = num(o.san, 999), sanMax = num(o.sanMax, 999);
  if (san !== undefined && sanMax !== undefined) { out.san = san; out.sanMax = Math.max(1, sanMax); }
  if (typeof o.cr === 'string' && /^[\d/]{1,5}$/.test(o.cr)) out.cr = o.cr;
  return out;
}
