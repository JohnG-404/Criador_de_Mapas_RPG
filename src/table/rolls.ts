import { highlight, MAX_LADOS, rollExpression, type RollResult, type RolledTerm } from '../core/dice/dice';

export type Papel = 'mestre' | 'jogador';

/** Uma rolagem na crônica da mesa (mesmo formato do rolador de dados). */
export interface Rolagem extends RollResult {
  id: string;
  autor: string;
  papel: Papel;
  /** Rolagem oculta do mestre: nunca sai do navegador dele (até ser revelada). */
  oculta: boolean;
  rotulo: string;
  skin: string | null;
  hora: number;
  revelada?: boolean;
  horaRevelada?: number;
}

export const SKINS = ['classico', 'obsidiana', 'runica', 'osso', 'dragao', 'brasa', 'cristal', 'elfica', 'gelo', 'vampiro'] as const;
export const SKIN_NAMES: Record<string, string> = {
  classico: 'Resina Clássica', obsidiana: 'Obsidiana Real', runica: 'Pedra Rúnica', osso: 'Osso Ancestral',
  dragao: 'Ouro do Dragão', brasa: 'Brasa Infernal', cristal: 'Cristal Arcano', elfica: 'Madeira Élfica',
  gelo: 'Gelo Eterno', vampiro: 'Sangue de Vampiro',
};
const skinOk = (s: unknown): string | null => (typeof s === 'string' && (SKINS as readonly string[]).includes(s) ? s : null);

export function cleanName(nome: unknown): string {
  return typeof nome === 'string' ? nome.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) : '';
}

function newRollId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Rola e monta a entrada da crônica. Lança DiceError se a expressão não servir. */
export function makeRoll(expr: string, who: { autor: string; papel: Papel; skin: string | null }, opts: { rotulo?: string; oculta?: boolean } = {}): Rolagem {
  return {
    id: newRollId(),
    autor: cleanName(who.autor) || (who.papel === 'mestre' ? 'Mestre' : 'Jogador'),
    papel: who.papel,
    oculta: who.papel === 'mestre' && !!opts.oculta,
    rotulo: (opts.rotulo ?? '').trim().slice(0, 40),
    skin: skinOk(who.skin),
    hora: Date.now(),
    ...rollExpression(expr),
  };
}

/**
 * Rolagem que chegou pela rede: confere a estrutura e recalcula total e
 * destaque a partir dos dados, para uma mensagem malformada não quebrar a tela.
 */
export function cleanRoll(raw: unknown): Rolagem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !/^[a-z0-9]{4,32}$/.test(o.id) || !Array.isArray(o.termos) || o.termos.length < 1 || o.termos.length > 10) return null;
  const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  const termos: RolledTerm[] = [];
  let total = 0;
  let dados = 0;
  for (const t of o.termos as Record<string, unknown>[]) {
    const sinal = t?.sinal === -1 ? -1 : 1;
    if (t?.tipo === 'mod' && int(t.valor, 0, 1000)) {
      termos.push({ tipo: 'mod', sinal, valor: t.valor as number });
      total += sinal * (t.valor as number);
      continue;
    }
    if (t?.tipo !== 'dado' || !int(t.lados, 2, MAX_LADOS) || !Array.isArray(t.valores) || !Array.isArray(t.mantidos)) return null;
    const lados = t.lados as number;
    const valores = t.valores as unknown[];
    if (valores.length < 1 || valores.length > 100 || valores.length !== (t.mantidos as unknown[]).length || !valores.every((v) => int(v, 1, lados))) return null;
    dados += valores.length;
    if (dados > 200) return null;
    const mantidos = (t.mantidos as unknown[]).map((m) => m === true);
    const vals = valores as number[];
    const subtotal = vals.reduce((s, v, i) => s + (mantidos[i] ? v : 0), 0);
    const manter = typeof t.manter === 'string' && /^k[hl]\d{1,3}$/.test(t.manter) ? t.manter : null;
    termos.push({ tipo: 'dado', sinal, qtd: vals.length, lados, manter, valores: vals, mantidos, subtotal });
    total += sinal * subtotal;
  }
  if (!termos.some((t) => t.tipo === 'dado')) return null;
  const papel: Papel = o.papel === 'mestre' ? 'mestre' : 'jogador';
  return {
    id: o.id,
    autor: cleanName(o.autor) || 'Jogador',
    papel,
    oculta: false,
    rotulo: typeof o.rotulo === 'string' ? o.rotulo.trim().slice(0, 40) : '',
    skin: skinOk(o.skin),
    hora: int(o.hora, 0, 8.64e15) ? (o.hora as number) : Date.now(),
    expressao: typeof o.expressao === 'string' ? o.expressao.slice(0, 60) : '',
    termos,
    total,
    destaque: highlight(termos),
    ...(o.revelada === true ? { revelada: true, horaRevelada: int(o.horaRevelada, 0, 8.64e15) ? (o.horaRevelada as number) : Date.now() } : {}),
  };
}

const MAX_HISTORY = 300;

/** Crônica das rolagens (mais recente por último). */
export class RollLog {
  private list: Rolagem[] = [];
  private listeners = new Set<() => void>();

  all = () => this.list;

  /** Põe ou substitui (uma revelação substitui a oculta). Devolve false se já tinha igual. */
  upsert(r: Rolagem): boolean {
    const i = this.list.findIndex((x) => x.id === r.id);
    if (i >= 0 && !(this.list[i].oculta && !r.oculta)) return false;
    const rest = i >= 0 ? this.list.filter((_, j) => j !== i) : this.list;
    this.list = [...rest, r].slice(-MAX_HISTORY);
    this.listeners.forEach((fn) => fn());
    return true;
  }

  /** O que os jogadores podem ver (sem as ocultas). */
  publicHistory(n = 50) { return this.list.filter((r) => !r.oculta).slice(-n); }

  get(id: string) { return this.list.find((r) => r.id === id); }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
}

/** Cor de cada jogador, calculada pelo nome (a mesma em todas as telas). */
const CORES = ['#9b2c2c', '#2f6b3f', '#2c4f8a', '#6b3a87', '#1f6f6f', '#a8541b', '#5f6b1f', '#8a2c5f', '#3d5a6b', '#7d4a2a'];
export const GM_COLOR = '#c99a3b';
export function playerColor(nome: string, papel: Papel): string {
  if (papel === 'mestre') return GM_COLOR;
  let h = 5381;
  for (const ch of nome.toLowerCase()) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return CORES[h % CORES.length];
}
