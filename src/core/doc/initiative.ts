import type { Command } from '../history/History';

/** Um token na ordem de iniciativa (o nome e a ficha vêm do próprio token). */
export interface InitiativeEntry { id: string; value: number; /** Desempate (Destreza/Agilidade). */ tie?: number }

/** Ordem de combate: lista ordenada, de quem é a vez e a rodada. */
export interface Initiative {
  entries: InitiativeEntry[];
  /** Índice em entries de quem age agora (-1 na tela dos jogadores quando é um token escondido). */
  turn: number;
  round: number;
}

export const EMPTY_INITIATIVE: Initiative = { entries: [], turn: 0, round: 1 };

const byValue = (a: InitiativeEntry, b: InitiativeEntry) => b.value - a.value || (b.tie ?? 0) - (a.tie ?? 0);

/** Põe (ou atualiza) entradas e reordena, mantendo a vez com quem estava. */
export function upsertEntries(ini: Initiative, add: InitiativeEntry[]): Initiative {
  const current = ini.entries[ini.turn]?.id;
  const map = new Map(ini.entries.map((e) => [e.id, e]));
  for (const e of add) map.set(e.id, e);
  const entries = [...map.values()].sort(byValue);
  const turn = current ? Math.max(0, entries.findIndex((e) => e.id === current)) : 0;
  return { ...ini, entries, turn };
}

export function removeEntry(ini: Initiative, id: string): Initiative {
  const i = ini.entries.findIndex((e) => e.id === id);
  if (i < 0) return ini;
  const entries = ini.entries.filter((e) => e.id !== id);
  let turn = ini.turn;
  if (i < turn) turn--;
  if (turn >= entries.length) turn = 0;
  return { ...ini, entries, turn };
}

/** Próxima vez; ao voltar ao primeiro, começa uma nova rodada. */
export function nextTurn(ini: Initiative): Initiative {
  if (!ini.entries.length) return ini;
  const turn = ini.turn + 1;
  return turn >= ini.entries.length ? { ...ini, turn: 0, round: ini.round + 1 } : { ...ini, turn };
}

export function prevTurn(ini: Initiative): Initiative {
  if (!ini.entries.length) return ini;
  if (ini.turn > 0) return { ...ini, turn: ini.turn - 1 };
  if (ini.round <= 1) return ini;
  return { ...ini, turn: ini.entries.length - 1, round: ini.round - 1 };
}

/** Tira da lista os tokens que não existem mais. */
export function pruneEntries(ini: Initiative, exists: (id: string) => boolean): Initiative {
  let out = ini;
  for (const e of ini.entries) if (!exists(e.id)) out = removeEntry(out, e.id);
  return out;
}

/** Iniciativa vinda de um arquivo ou da rede: só entradas válidas de tokens existentes. */
export function cleanInitiative(raw: unknown, exists: (id: string) => boolean): Initiative {
  if (!raw || typeof raw !== 'object') return EMPTY_INITIATIVE;
  const o = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const entries: InitiativeEntry[] = [];
  for (const e of Array.isArray(o.entries) ? o.entries.slice(0, 200) : []) {
    if (!e || typeof e.id !== 'string' || seen.has(e.id) || !exists(e.id) || typeof e.value !== 'number' || !Number.isFinite(e.value)) continue;
    seen.add(e.id);
    const value = Math.max(-999, Math.min(999, Math.round(e.value)));
    entries.push(typeof e.tie === 'number' && Number.isFinite(e.tie) ? { id: e.id, value, tie: Math.round(e.tie) } : { id: e.id, value });
  }
  const int = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : d);
  return { entries, turn: int(o.turn, -1, Math.max(0, entries.length - 1), 0), round: int(o.round, 1, 9999, 1) };
}

/** Guarda a iniciativa do documento e avisa quem desenha a lista. */
export class InitiativeStore {
  private value: Initiative = EMPTY_INITIATIVE;
  private listeners = new Set<() => void>();
  get(): Initiative { return this.value; }
  set(v: Initiative) {
    this.value = v;
    this.listeners.forEach((fn) => fn());
  }
  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

/** Troca a iniciativa inteira (desfazer volta a anterior). */
export class InitiativeCommand implements Command {
  constructor(readonly label: string, private store: InitiativeStore, private before: Initiative, private after: Initiative) {}
  apply() { this.store.set(this.after); }
  revert() { this.store.set(this.before); }
  isEmpty() { return JSON.stringify(this.before) === JSON.stringify(this.after); }
}
