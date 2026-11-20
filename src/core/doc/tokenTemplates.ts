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
  // ---- ficha completa (ver core/sheets/systems.ts)
  /** Sistema da ficha (sem ele, vale o do modelo ou D&D). */
  sys?: TokenSystem;
  level?: number;
  /** Bônus de proficiência (D&D). Sem ele, calculado pelo nível. */
  prof?: number;
  /** Atributos na ordem do sistema (D&D: FOR DES CON INT SAB CAR; horror: AGI FOR INT PRE VIG). */
  attrs?: number[];
  /** Perícias treinadas: D&D 1 = proficiente, 2 = especialista; horror = bônus (+5, +10, +15). */
  skills?: Record<string, number>;
  /** Salvaguardas proficientes (D&D), por índice de atributo. */
  saves?: number[];
  /** Bônus extra de iniciativa. */
  initBonus?: number;
  /** Energia para habilidades (horror). */
  energy?: number;
  energyMax?: number;
  attacks?: Attack[];
  /** Condições ativas (Caído, Cego...). */
  conds?: string[];
  notes?: string;
}

/** Ataque da ficha: teste e dano em notação de dados (1d20+5, 1d8+3). */
export interface Attack { name: string; roll: string; dmg: string }

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

const ATK = (name: string, roll: string, dmg: string): Attack => ({ name, roll, dmg });
const SK = (o: Record<string, number>) => o;

/** Ficha completa dos modelos: atributos, perícias e ataques. */
const EXTRAS: Record<string, Partial<TokenSheet>> = {
  // D&D — personagens de 1º nível (arranjo padrão de atributos)
  guerreiro: { level: 1, attrs: [16, 14, 14, 10, 12, 8], saves: [0, 2], skills: SK({ atletismo: 1, percepcao: 1 }), attacks: [ATK('Espada longa', '1d20+5', '1d8+3'), ATK('Arco curto', '1d20+4', '1d6+2')] },
  patrulheiro: { level: 1, attrs: [12, 16, 14, 10, 14, 8], saves: [0, 1], skills: SK({ furtividade: 1, sobrevivencia: 1, percepcao: 1 }), attacks: [ATK('Arco longo', '1d20+5', '1d8+3'), ATK('Espada curta', '1d20+5', '1d6+3')] },
  mago: { level: 1, attrs: [8, 14, 14, 16, 12, 10], saves: [3, 4], skills: SK({ arcanismo: 1, historia: 1 }), attacks: [ATK('Raio de fogo', '1d20+5', '1d10'), ATK('Bordão', '1d20+1', '1d6-1')] },
  ladino: { level: 1, attrs: [10, 16, 14, 14, 12, 10], saves: [1, 3], skills: SK({ furtividade: 2, prestidigitacao: 2, acrobacia: 1, enganacao: 1 }), attacks: [ATK('Rapieira', '1d20+5', '1d8+3'), ATK('Ataque furtivo', '', '1d6')] },
  clerigo: { level: 1, attrs: [14, 10, 14, 10, 16, 12], saves: [4, 5], skills: SK({ medicina: 1, religiao: 1 }), attacks: [ATK('Maça', '1d20+4', '1d6+2'), ATK('Chama sagrada', '', '1d8')] },
  barbaro: { level: 1, attrs: [16, 14, 16, 8, 12, 8], saves: [0, 2], skills: SK({ atletismo: 1, intimidacao: 1 }), attacks: [ATK('Machado grande', '1d20+5', '1d12+3'), ATK('Azagaia', '1d20+5', '1d6+3')] },
  bardo: { level: 1, attrs: [8, 14, 12, 12, 10, 16], saves: [1, 5], skills: SK({ atuacao: 1, persuasao: 1, enganacao: 1 }), attacks: [ATK('Rapieira', '1d20+4', '1d8+2'), ATK('Zombaria cruel', '', '1d4')] },
  'anao-guerreiro': { level: 1, attrs: [16, 12, 16, 10, 12, 8], saves: [0, 2], skills: SK({ atletismo: 1, historia: 1 }), attacks: [ATK('Machado de batalha', '1d20+5', '1d8+3'), ATK('Machadinha', '1d20+5', '1d6+3')] },
  // D&D — criaturas do SRD 5.1
  goblin: { attrs: [8, 14, 10, 10, 8, 8], skills: SK({ furtividade: 2 }), attacks: [ATK('Cimitarra', '1d20+4', '1d6+2'), ATK('Arco curto', '1d20+4', '1d6+2')] },
  kobold: { attrs: [7, 15, 9, 8, 7, 8], attacks: [ATK('Adaga', '1d20+4', '1d4+2'), ATK('Funda', '1d20+4', '1d4+2')] },
  esqueleto: { attrs: [10, 14, 15, 6, 8, 5], attacks: [ATK('Espada curta', '1d20+4', '1d6+2'), ATK('Arco curto', '1d20+4', '1d6+2')] },
  zumbi: { attrs: [13, 6, 16, 3, 6, 5], saves: [4], attacks: [ATK('Pancada', '1d20+3', '1d6+1')] },
  orc: { attrs: [16, 12, 16, 7, 11, 10], skills: SK({ intimidacao: 1 }), attacks: [ATK('Machado grande', '1d20+5', '1d12+3'), ATK('Azagaia', '1d20+5', '1d6+3')] },
  lobo: { attrs: [12, 15, 12, 3, 12, 6], skills: SK({ percepcao: 1, furtividade: 1 }), attacks: [ATK('Mordida', '1d20+4', '2d4+2')] },
  'cultista-medieval': { attrs: [11, 12, 10, 10, 11, 10], skills: SK({ enganacao: 1, religiao: 1 }), attacks: [ATK('Cimitarra', '1d20+3', '1d6+1')] },
  'aranha-gigante': { attrs: [14, 16, 12, 2, 11, 4], skills: SK({ furtividade: 2 }), attacks: [ATK('Mordida', '1d20+5', '1d8+3'), ATK('Veneno (CD 11 CON)', '', '2d8')] },
  ogro: { attrs: [19, 8, 16, 5, 7, 7], attacks: [ATK('Clava grande', '1d20+6', '2d8+4'), ATK('Azagaia', '1d20+6', '2d6+4')] },
  'dragao-jovem': { prof: 4, attrs: [23, 10, 21, 14, 11, 19], saves: [1, 2, 4, 5], skills: SK({ percepcao: 2, furtividade: 1 }), attacks: [ATK('Mordida', '1d20+10', '2d10+6+1d6'), ATK('Garra', '1d20+10', '2d6+6'), ATK('Sopro de fogo (CD 17 DES)', '', '16d6')] },
  // Horror — investigadores
  investigador: { level: 1, attrs: [1, 1, 3, 2, 1], energy: 3, energyMax: 3, skills: SK({ investigacao: 10, percepcao: 5, ocultismo: 5, pontaria: 5 }), attacks: [ATK('Revólver', '1d20+5', '2d6')] },
  atirador: { level: 1, attrs: [3, 1, 1, 1, 2], energy: 2, energyMax: 2, skills: SK({ pontaria: 10, reflexos: 5, iniciativa: 5 }), attacks: [ATK('Fuzil', '3d20kh1+10', '2d10'), ATK('Faca', '1d20', '1d4+1')] },
  medico: { level: 1, attrs: [1, 1, 3, 2, 1], energy: 3, energyMax: 3, skills: SK({ medicina: 10, intuicao: 5, vontade: 5 }), attacks: [ATK('Bisturi', '1d20', '1d4')] },
  ocultista: { level: 1, attrs: [1, 0, 3, 3, 1], energy: 6, energyMax: 6, skills: SK({ ocultismo: 15, vontade: 5, investigacao: 5 }), attacks: [ATK('Adaga ritual', '2d20kl1', '1d4')] },
  jornalista: { level: 1, attrs: [2, 1, 2, 3, 1], energy: 3, energyMax: 3, skills: SK({ diplomacia: 10, investigacao: 5, percepcao: 5 }), attacks: [ATK('Pistola', '2d20kh1', '1d12')] },
  policial: { level: 1, attrs: [2, 2, 1, 1, 3], energy: 2, energyMax: 2, skills: SK({ pontaria: 10, luta: 5, percepcao: 5 }), attacks: [ATK('Pistola', '2d20kh1+10', '1d12'), ATK('Cassetete', '2d20kh1+5', '1d6+2')] },
  estudante: { level: 1, attrs: [2, 1, 2, 2, 1], energy: 3, energyMax: 3, skills: SK({ tecnologia: 10, atletismo: 5, furtividade: 5 }), attacks: [ATK('Taco', '1d20', '1d6+1')] },
  // Horror — ameaças
  cultista: { attrs: [2, 1, 1, 2, 1], skills: SK({ luta: 5, ocultismo: 5 }), attacks: [ATK('Faca ritual', '1d20+5', '1d4+1')] },
  possuido: { attrs: [1, 3, 0, 3, 3], skills: SK({ luta: 5 }), attacks: [ATK('Garras', '3d20kh1+5', '2d6+3')] },
  'morto-vivo': { attrs: [0, 3, 0, 0, 3], attacks: [ATK('Mordida', '3d20kh1', '1d8+3')] },
  espectro: { attrs: [3, 0, 2, 4, 2], skills: SK({ luta: 10, furtividade: 10 }), attacks: [ATK('Toque gélido', '3d20kh1+10', '2d8'), ATK('Lamento (Sanidade)', '', '2d6')] },
  'cao-sombrio': { attrs: [3, 2, 0, 1, 2], skills: SK({ luta: 5, percepcao: 10 }), attacks: [ATK('Mordida', '2d20kh1+5', '2d6+2')] },
  sombra: { attrs: [4, 1, 2, 3, 2], skills: SK({ luta: 10, furtividade: 15 }), attacks: [ATK('Garras sombrias', '1d20+10', '3d6')] },
  aberracao: { attrs: [1, 4, 1, 3, 4], skills: SK({ luta: 10, fortitude: 10 }), attacks: [ATK('Tentáculos', '4d20kh1+10', '3d8+4'), ATK('Visão impossível (Sanidade)', '', '3d6')] },
};

for (const t of TOKEN_TEMPLATES as TokenTemplate[]) Object.assign(t.sheet, { sys: t.system }, EXTRAS[t.key]);

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
  if (o.sys === 'dnd' || o.sys === 'horror') out.sys = o.sys;
  const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : undefined);
  const level = int(o.level, 0, 99), prof = int(o.prof, 0, 20), initBonus = int(o.initBonus, -99, 99);
  if (level !== undefined) out.level = level;
  if (prof !== undefined) out.prof = prof;
  if (initBonus !== undefined && initBonus !== 0) out.initBonus = initBonus;
  if (Array.isArray(o.attrs) && o.attrs.length <= 6) {
    const attrs = o.attrs.map((v) => int(v, 0, 30) ?? 0);
    if (attrs.length) out.attrs = attrs;
  }
  if (o.skills && typeof o.skills === 'object' && !Array.isArray(o.skills)) {
    const skills: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.skills as Record<string, unknown>).slice(0, 40)) {
      const n = int(v, 0, 99);
      if (/^[a-z]{2,20}$/.test(k) && n) skills[k] = n;
    }
    if (Object.keys(skills).length) out.skills = skills;
  }
  if (Array.isArray(o.saves)) {
    const saves = [...new Set(o.saves.map((v) => int(v, 0, 5)).filter((v): v is number => v !== undefined))].sort();
    if (saves.length) out.saves = saves;
  }
  const energy = num(o.energy, 999), energyMax = num(o.energyMax, 999);
  if (energy !== undefined && energyMax !== undefined) { out.energy = energy; out.energyMax = Math.max(0, energyMax); }
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  if (Array.isArray(o.attacks)) {
    const attacks = o.attacks.slice(0, 12).filter((a) => a && typeof a === 'object')
      .map((a) => ({ name: str(a.name, 40), roll: str(a.roll, 40), dmg: str(a.dmg, 40) }));
    if (attacks.length) out.attacks = attacks;
  }
  if (Array.isArray(o.conds)) {
    const conds = [...new Set(o.conds.filter((c): c is string => typeof c === 'string' && c.length > 0).map((c) => c.slice(0, 24)))].slice(0, 20);
    if (conds.length) out.conds = conds;
  }
  if (typeof o.notes === 'string' && o.notes) out.notes = o.notes.slice(0, 4000);
  return out;
}
