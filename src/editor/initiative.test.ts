import { describe, expect, it } from 'vitest';
import { Editor } from './Editor';
import { parseMap, serializeDoc } from '../core/doc/serialize';
import { forPlayers } from '../online/protocol';
import { FOG_HIDDEN } from '../core/doc/MapDocument';

function setup() {
  const e = new Editor({ name: 't', gridKind: 'square', cols: 20, rows: 20, fill: 1, cellMeters: 1.5 });
  const put = (tpl: string, col: number) => {
    e.setTokenTemplate(tpl);
    e.pointerDown(e.doc.grid.cellToWorld({ col, row: 5 }));
    e.pointerUp();
    return e.getState().selection!.id;
  };
  return { e, guerreiro: put('guerreiro', 2), goblin: put('goblin', 15) };
}

describe('iniciativa no editor', () => {
  it('rola para quem tem ficha, com o bônus de cada um, e desfaz num passo', () => {
    const { e, guerreiro, goblin } = setup();
    const seen: string[] = [];
    const rolled = e.rollInitiative(undefined, (expr, t) => { seen.push(`${t.name}:${expr}`); return t.id === goblin ? 15 : 8; });
    expect(rolled).toHaveLength(2);
    expect(seen).toEqual(['Guerreiro:1d20+2', 'Goblin:1d20+2']);
    expect(e.doc.initiative.get().entries.map((x) => x.id)).toEqual([goblin, guerreiro]);
    // Já estão na lista: rolar de novo sem ids não faz nada.
    expect(e.rollInitiative(undefined, () => 1)).toHaveLength(0);
    e.nextTurn();
    expect(e.doc.initiative.get().turn).toBe(1);
    e.undo();
    expect(e.doc.initiative.get().turn).toBe(0);
    e.undo();
    expect(e.doc.initiative.get().entries).toHaveLength(0);
  });

  it('vai no arquivo e, para os jogadores, esconde os tokens sob a névoa', () => {
    const { e, guerreiro, goblin } = setup();
    e.rollInitiative(undefined, (_, t) => (t.id === goblin ? 15 : 8));
    const back = parseMap(JSON.parse(JSON.stringify(serializeDoc(e.doc))));
    expect(back.initiative.get().entries.map((x) => x.id)).toEqual([goblin, guerreiro]);
    // Goblin coberto pela névoa: some da lista dos jogadores, e a vez (dele) fica sem dono.
    e.doc.fog.set(15, 5, FOG_HIDDEN);
    const p = forPlayers(e.doc).initiative!;
    expect(p.entries.map((x) => x.id)).toEqual([guerreiro]);
    expect(p.turn).toBe(-1);
    expect(parseMap(forPlayers(e.doc)).initiative.get().turn).toBe(-1);
  });
});
