import type { MapFile } from '../core/doc/serialize';
import { serializeDoc } from '../core/doc/serialize';
import { FOG_HIDDEN, type MapDocument } from '../core/doc/MapDocument';
import type { ViewRect } from '../editor/playerSync';

/** Mensagens da sala online (Supabase Realtime, canal broadcast). */
export type RoomMessage =
  | { type: 'hello' }
  | { type: 'chunk'; v: number; i: number; n: number; data: string }
  | { type: 'view'; rect: ViewRect }
  /** Rolagem de dados pública (as ocultas do mestre nunca são enviadas). */
  | { type: 'roll'; roll: unknown }
  /** Crônica recente, para quem acabou de entrar. */
  | { type: 'rolls'; list: unknown };

/** Cada mensagem do Realtime tem limite de tamanho; o mapa vai em pedaços. */
export const CHUNK_CHARS = 180_000;

export function toChunks(json: string, v: number, size = CHUNK_CHARS): RoomMessage[] {
  const n = Math.max(1, Math.ceil(json.length / size));
  return Array.from({ length: n }, (_, i) => ({ type: 'chunk' as const, v, i, n, data: json.slice(i * size, (i + 1) * size) }));
}

/** Junta os pedaços de cada versão; devolve o texto quando a versão chega completa. */
export class ChunkAssembler {
  private parts = new Map<number, { n: number; got: string[]; count: number }>();
  private done = -1;

  push(m: Extract<RoomMessage, { type: 'chunk' }>): string | null {
    if (m.v <= this.done || m.n < 1 || m.n > 500 || m.i < 0 || m.i >= m.n || typeof m.data !== 'string') return null;
    let p = this.parts.get(m.v);
    if (!p || p.n !== m.n) {
      p = { n: m.n, got: new Array(m.n), count: 0 };
      this.parts.set(m.v, p);
    }
    if (p.got[m.i] === undefined) { p.got[m.i] = m.data; p.count++; }
    if (p.count < p.n) return null;
    this.done = m.v;
    for (const k of this.parts.keys()) if (k <= m.v) this.parts.delete(k);
    return p.got.join('');
  }
}

/** Código de sala difícil de adivinhar (só quem tem o link entra). */
export function newRoomCode(): string {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export function validRoomCode(code: string | null): code is string {
  return !!code && /^[a-z0-9]{8,32}$/.test(code);
}

/**
 * O que os jogadores recebem: sem as notas do mestre, sem as passagens e sem os tokens que
 * não são de jogador escondidos pela névoa.
 */
export function forPlayers(doc: MapDocument): MapFile {
  const map = serializeDoc(doc);
  const hidden = (x: number, y: number) => {
    const c = doc.grid.worldToCell({ x, y });
    return !!c && doc.fog.get(c.col, c.row) === FOG_HIDDEN;
  };
  const tokens = map.tokens.filter((t) => t.pc || !hidden(t.x, t.y));
  const out: MapFile = { ...map, notes: [], links: [], tokens };
  if (map.initiative) {
    const visible = new Set(tokens.map((t) => t.id));
    const current = map.initiative.entries[map.initiative.turn]?.id;
    const entries = map.initiative.entries.filter((e) => visible.has(e.id));
    out.initiative = { ...map.initiative, entries, turn: current && visible.has(current) ? entries.findIndex((e) => e.id === current) : -1 };
  }
  return out;
}
