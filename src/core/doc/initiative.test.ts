import { describe, expect, it } from 'vitest';
import { cleanInitiative, EMPTY_INITIATIVE, nextTurn, prevTurn, pruneEntries, removeEntry, upsertEntries } from './initiative';

const ini = upsertEntries(EMPTY_INITIATIVE, [
  { id: 'a', value: 12 }, { id: 'b', value: 18 }, { id: 'c', value: 12, tie: 3 },
]);

describe('iniciativa', () => {
  it('ordena do maior para o menor, com desempate', () => {
    expect(ini.entries.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('passa a vez e conta rodadas', () => {
    let s = nextTurn(ini);
    expect(s.turn).toBe(1);
    s = nextTurn(nextTurn(s));
    expect([s.turn, s.round]).toEqual([0, 2]);
    s = prevTurn(s);
    expect([s.turn, s.round]).toEqual([2, 1]);
    expect(prevTurn(ini)).toEqual(ini);
  });

  it('quem entra no meio não rouba a vez', () => {
    const s = upsertEntries({ ...ini, turn: 1 }, [{ id: 'd', value: 20 }]);
    expect(s.entries[s.turn].id).toBe('c');
  });

  it('remover ajusta a vez', () => {
    const s = removeEntry({ ...ini, turn: 2 }, 'b');
    expect(s.entries[s.turn].id).toBe('a');
    expect(removeEntry({ ...ini, turn: 2 }, 'a').turn).toBe(0);
    expect(pruneEntries(ini, (id) => id !== 'c').entries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('limpa dados de fora', () => {
    const s = cleanInitiative({ entries: [{ id: 'a', value: 5.4 }, { id: 'x', value: 3 }, { id: 'a', value: 1 }, { id: 'b' }], turn: 9, round: -2 }, (id) => id !== 'x');
    expect(s).toEqual({ entries: [{ id: 'a', value: 5 }], turn: 0, round: 1 });
    expect(cleanInitiative('lixo', () => true)).toEqual(EMPTY_INITIATIVE);
  });
});
