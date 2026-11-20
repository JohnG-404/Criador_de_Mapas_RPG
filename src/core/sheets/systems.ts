/**
 * Regras das fichas completas dos dois sistemas: atributos, perícias,
 * condições e como montar cada teste em notação de dados.
 *
 * D&D 5e: termos de jogo do SRD 5.1 (CC-BY-4.0), traduzidos.
 * Horror investigativo: regras genéricas e originais no estilo dos RPGs de
 * investigação paranormal (atributo = quantidade de d20, fica o maior).
 */
import { bonus } from '../dice/dice';
import type { TokenSheet, TokenSystem } from '../doc/tokenTemplates';

export interface AttrDef { key: string; short: string; name: string }
export interface SkillDef { key: string; name: string; attr: number }

export interface SystemRules {
  attrs: AttrDef[];
  /** Valor inicial de um atributo numa ficha nova. */
  attrDefault: number;
  attrMin: number;
  attrMax: number;
  skills: SkillDef[];
  /** Níveis de treino de uma perícia (valor guardado na ficha → rótulo). */
  skillLevels: { value: number; label: string }[];
  conditions: string[];
}

export const DND: SystemRules = {
  attrs: [
    { key: 'for', short: 'FOR', name: 'Força' },
    { key: 'des', short: 'DES', name: 'Destreza' },
    { key: 'con', short: 'CON', name: 'Constituição' },
    { key: 'int', short: 'INT', name: 'Inteligência' },
    { key: 'sab', short: 'SAB', name: 'Sabedoria' },
    { key: 'car', short: 'CAR', name: 'Carisma' },
  ],
  attrDefault: 10,
  attrMin: 1,
  attrMax: 30,
  skills: [
    { key: 'acrobacia', name: 'Acrobacia', attr: 1 },
    { key: 'adestrar', name: 'Lidar com animais', attr: 4 },
    { key: 'arcanismo', name: 'Arcanismo', attr: 3 },
    { key: 'atletismo', name: 'Atletismo', attr: 0 },
    { key: 'atuacao', name: 'Atuação', attr: 5 },
    { key: 'enganacao', name: 'Enganação', attr: 5 },
    { key: 'furtividade', name: 'Furtividade', attr: 1 },
    { key: 'historia', name: 'História', attr: 3 },
    { key: 'intimidacao', name: 'Intimidação', attr: 5 },
    { key: 'intuicao', name: 'Intuição', attr: 4 },
    { key: 'investigacao', name: 'Investigação', attr: 3 },
    { key: 'medicina', name: 'Medicina', attr: 4 },
    { key: 'natureza', name: 'Natureza', attr: 3 },
    { key: 'percepcao', name: 'Percepção', attr: 4 },
    { key: 'persuasao', name: 'Persuasão', attr: 5 },
    { key: 'prestidigitacao', name: 'Prestidigitação', attr: 1 },
    { key: 'religiao', name: 'Religião', attr: 3 },
    { key: 'sobrevivencia', name: 'Sobrevivência', attr: 4 },
  ],
  skillLevels: [
    { value: 0, label: '—' },
    { value: 1, label: 'Proficiente' },
    { value: 2, label: 'Especialista' },
  ],
  conditions: [
    'Agarrado', 'Amedrontado', 'Atordoado', 'Caído', 'Cego', 'Contido', 'Enfeitiçado', 'Envenenado',
    'Exausto', 'Incapacitado', 'Inconsciente', 'Invisível', 'Paralisado', 'Petrificado', 'Surdo',
  ],
};

export const HORROR: SystemRules = {
  attrs: [
    { key: 'agi', short: 'AGI', name: 'Agilidade' },
    { key: 'for', short: 'FOR', name: 'Força' },
    { key: 'int', short: 'INT', name: 'Intelecto' },
    { key: 'pre', short: 'PRE', name: 'Presença' },
    { key: 'vig', short: 'VIG', name: 'Vigor' },
  ],
  attrDefault: 1,
  attrMin: 0,
  attrMax: 6,
  skills: [
    { key: 'atletismo', name: 'Atletismo', attr: 1 },
    { key: 'diplomacia', name: 'Diplomacia', attr: 3 },
    { key: 'fortitude', name: 'Fortitude', attr: 4 },
    { key: 'furtividade', name: 'Furtividade', attr: 0 },
    { key: 'iniciativa', name: 'Iniciativa', attr: 0 },
    { key: 'intimidacao', name: 'Intimidação', attr: 3 },
    { key: 'intuicao', name: 'Intuição', attr: 3 },
    { key: 'investigacao', name: 'Investigação', attr: 2 },
    { key: 'luta', name: 'Luta', attr: 1 },
    { key: 'medicina', name: 'Medicina', attr: 2 },
    { key: 'ocultismo', name: 'Ocultismo', attr: 2 },
    { key: 'percepcao', name: 'Percepção', attr: 3 },
    { key: 'pontaria', name: 'Pontaria', attr: 0 },
    { key: 'reflexos', name: 'Reflexos', attr: 0 },
    { key: 'sobrevivencia', name: 'Sobrevivência', attr: 2 },
    { key: 'tecnologia', name: 'Tecnologia', attr: 2 },
    { key: 'vontade', name: 'Vontade', attr: 3 },
  ],
  skillLevels: [
    { value: 0, label: '—' },
    { value: 5, label: '+5' },
    { value: 10, label: '+10' },
    { value: 15, label: '+15' },
  ],
  conditions: [
    'Abalado', 'Apavorado', 'Atordoado', 'Caído', 'Cego', 'Enlouquecendo', 'Fraco', 'Inconsciente',
    'Lento', 'Machucado', 'Morrendo', 'Paralisado', 'Sangrando', 'Surdo',
  ],
};

export const RULES: Record<TokenSystem, SystemRules> = { dnd: DND, horror: HORROR };

export const sheetSystem = (s: TokenSheet | undefined, fallback: TokenSystem = 'dnd'): TokenSystem => s?.sys ?? fallback;

/** Modificador de D&D: 10–11 → 0, 14 → +2, 8 → −1. */
export const dndMod = (score: number) => Math.floor((score - 10) / 2);

export function attrValue(s: TokenSheet, i: number): number {
  return s.attrs?.[i] ?? RULES[sheetSystem(s)].attrDefault;
}

/** Bônus de proficiência de D&D: o da ficha, ou pelo nível (1–4 → +2, 5–8 → +3...). */
export function profBonus(s: TokenSheet): number {
  return s.prof ?? 2 + Math.floor((Math.max(1, s.level ?? 1) - 1) / 4);
}

/** Dados de um teste de horror: atributo 0 rola 2d20 e fica o menor. */
function horrorDice(attr: number) {
  if (attr <= 0) return '2d20kl1';
  if (attr === 1) return '1d20';
  return `${attr}d20kh1`;
}

/** Teste de atributo puro. */
export function attrCheck(s: TokenSheet, i: number): string {
  const v = attrValue(s, i);
  return sheetSystem(s) === 'dnd' ? `1d20${bonus(dndMod(v))}` : horrorDice(v);
}

/** Bônus total de uma perícia de D&D (modificador + proficiência). */
export function dndSkillBonus(s: TokenSheet, skill: SkillDef): number {
  const lvl = s.skills?.[skill.key] ?? 0;
  return dndMod(attrValue(s, skill.attr)) + lvl * profBonus(s);
}

export function skillCheck(s: TokenSheet, skill: SkillDef): string {
  if (sheetSystem(s) === 'dnd') return `1d20${bonus(dndSkillBonus(s, skill))}`;
  return `${horrorDice(attrValue(s, skill.attr))}${bonus(s.skills?.[skill.key] ?? 0)}`;
}

/** Salvaguarda de D&D (proficiente soma o bônus de proficiência). */
export function saveBonus(s: TokenSheet, i: number): number {
  return dndMod(attrValue(s, i)) + (s.saves?.includes(i) ? profBonus(s) : 0);
}

/** Rolagem de iniciativa do token. */
export function initiativeExpr(s: TokenSheet | undefined): string {
  if (!s) return '1d20';
  const extra = s.initBonus ?? 0;
  if (sheetSystem(s) === 'dnd') return `1d20${bonus(dndMod(attrValue(s, 1)) + extra)}`;
  return `${horrorDice(attrValue(s, 0))}${bonus((s.skills?.iniciativa ?? 0) + extra)}`;
}

/** Desempate da iniciativa: quem tem mais Destreza/Agilidade age antes. */
export function initiativeTiebreak(s: TokenSheet | undefined): number {
  if (!s) return 0;
  return sheetSystem(s) === 'dnd' ? dndMod(attrValue(s, 1)) + (s.initBonus ?? 0) : attrValue(s, 0) * 100 + (s.skills?.iniciativa ?? 0);
}

/** Campos que a ficha completa ganha ao ser aberta pela primeira vez. */
export function sheetDefaults(sys: TokenSystem): Partial<TokenSheet> {
  const r = RULES[sys];
  return {
    sys,
    level: 1,
    attrs: r.attrs.map(() => r.attrDefault),
    ...(sys === 'horror' ? { san: 12, sanMax: 12, energy: 2, energyMax: 2 } : {}),
  };
}
