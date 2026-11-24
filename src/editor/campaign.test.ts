import { describe, expect, it } from 'vitest';
import { Editor } from './Editor';
import { campaignToJson, docToJson, parseCampaign, serializeCampaign } from '../core/doc/serialize';
import { forPlayers } from '../online/protocol';
import type { NewMapOptions } from '../core/doc/MapDocument';

const opts = (name: string, cols = 20, rows = 14): NewMapOptions => ({ name, gridKind: 'square', cols, rows, fill: 1, cellMeters: 1.5 });
const center = (ed: Editor, col: number, row: number) => ed.doc.grid.cellToWorld({ col, row });

/** Masmorra com uma escada para o porão, criado pelo painel da passagem. */
function dungeon() {
  const ed = new Editor(opts('Masmorra'));
  const masmorra = ed.doc;
  ed.setTool('link');
  ed.pointerDown(center(ed, 3, 4));
  ed.pointerUp();
  const link = ed.selectedLink()!;
  const porao = ed.addMapForLink(opts('Porão', 30, 20))!;
  return { ed, masmorra, porao, linkId: link.id };
}

describe('mapas ligados', () => {
  it('a passagem nova aponta para o mapa criado, que ganha a passagem de volta', () => {
    const { ed, masmorra, porao, linkId } = dungeon();
    expect(ed.maps.map((m) => m.options.name)).toEqual(['Masmorra', 'Porão']);
    expect(ed.doc).toBe(porao);
    expect(masmorra.links.get(linkId)).toMatchObject({ target: porao.id, label: 'Porão' });
    const back = porao.links.all();
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ target: masmorra.id, label: 'Masmorra' });
    // Criar o mapa não leva os jogadores junto.
    expect(ed.playerDoc).toBe(masmorra);
  });

  it('atravessar leva o mestre, os jogadores e os personagens de jogador', () => {
    const { ed, masmorra, porao, linkId } = dungeon();
    ed.switchMap(masmorra.id);
    expect(ed.playerDoc).toBe(masmorra);
    ed.setTool('token');
    ed.pointerDown(center(ed, 5, 5)); ed.pointerUp();
    ed.pointerDown(center(ed, 6, 5)); ed.pointerUp();
    ed.pointerDown(center(ed, 8, 8)); ed.pointerUp();
    const [a, b] = masmorra.tokens.all();
    masmorra.assets.put('img-ana', { id: 'img-ana', key: 'img-ana', name: 'Ana', w: 1, h: 1, data: 'data:image/png;base64,iVBORw0KGgo=', token: true });
    masmorra.tokens.put(a.id, { ...a, pc: true, vision: 6, art: 'img-ana' });
    masmorra.tokens.put(b.id, { ...b, pc: true, vision: 6 });

    expect(ed.followLink(linkId)).toBe(true);
    expect(ed.doc).toBe(porao);
    expect(ed.playerDoc).toBe(porao);
    expect(masmorra.tokens.size).toBe(1);
    const arrived = porao.tokens.all();
    expect(arrived.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
    // O retrato próprio vai junto para o mapa de destino.
    expect(porao.assets.get('img-ana')?.token).toBe(true);
    // Perto da passagem de volta, sem ficar em cima dela nem um em cima do outro.
    const back = porao.links.all()[0];
    const cells = arrived.map((t) => porao.grid.worldToCell(t)!);
    const backCell = porao.grid.worldToCell(back)!;
    for (const c of cells) {
      expect(Math.max(Math.abs(c.col - backCell.col), Math.abs(c.row - backCell.row))).toBe(1);
    }
    expect(new Set(cells.map((c) => `${c.col},${c.row}`)).size).toBe(2);
    // A visualização enquadra a chegada uma vez.
    const focus = ed.takeFocus()!;
    expect(focus.x).toBeLessThan(back.x);
    expect(focus.x + focus.width).toBeGreaterThan(back.x);
    expect(ed.takeFocus()).toBeNull();

    // Volta pelo outro lado: os mesmos personagens, sem duplicar.
    ed.followLink(back.id);
    expect(ed.doc).toBe(masmorra);
    expect(masmorra.tokens.size).toBe(3);
    expect(porao.tokens.size).toBe(0);
  });

  it('trocar de mapa pela lista não move os jogadores; o botão leva', () => {
    const { ed, masmorra, porao } = dungeon();
    ed.switchMap(masmorra.id);
    ed.switchMap(porao.id);
    expect(ed.playerDoc).toBe(masmorra);
    ed.showMapToPlayers();
    expect(ed.playerDoc).toBe(porao);
  });

  it('atravessar sem levar os personagens deixa os tokens onde estão', () => {
    const { ed, masmorra, porao, linkId } = dungeon();
    ed.switchMap(masmorra.id);
    ed.setTool('token');
    ed.pointerDown(center(ed, 5, 5)); ed.pointerUp();
    const t = masmorra.tokens.all()[0];
    masmorra.tokens.put(t.id, { ...t, pc: true });
    ed.followLink(linkId, false);
    expect(ed.doc).toBe(porao);
    expect(masmorra.tokens.size).toBe(1);
    expect(porao.tokens.size).toBe(0);
  });

  it('apagar um mapa deixa as passagens para ele sem destino', () => {
    const { ed, masmorra, porao, linkId } = dungeon();
    ed.showMapToPlayers();
    ed.removeMap(porao.id);
    expect(ed.maps).toEqual([masmorra]);
    expect(ed.doc).toBe(masmorra);
    expect(ed.playerDoc).toBe(masmorra);
    expect(masmorra.links.get(linkId)!.target).toBe('');
    ed.removeMap(masmorra.id);
    expect(ed.maps).toHaveLength(1);
  });

  it('mover, renomear e apagar a passagem pela seleção', () => {
    const { ed, masmorra, linkId } = dungeon();
    ed.switchMap(masmorra.id);
    ed.setTool('select');
    const l = masmorra.links.get(linkId)!;
    ed.pointerDown({ x: l.x + 3, y: l.y + 3 });
    expect(ed.selectedLink()?.id).toBe(linkId);
    ed.pointerMove(center(ed, 10, 10));
    ed.pointerUp();
    expect(masmorra.links.get(linkId)).toMatchObject(center(ed, 10, 10));
    ed.setLinkLabel('Escada do porão');
    expect(masmorra.links.get(linkId)!.label).toBe('Escada do porão');
    ed.undo();
    expect(masmorra.links.get(linkId)!.label).toBe('Porão');
    ed.deleteSelection();
    expect(masmorra.links.size).toBe(0);
  });
});

describe('arquivo da campanha', () => {
  it('um mapa só continua salvando o .rpgmap de sempre', () => {
    const ed = new Editor(opts('Taverna'));
    const file = serializeCampaign(ed.campaign());
    expect(file.format).toBe('atlas-board-map');
    expect(campaignToJson(ed.campaign())).toBe(docToJson(ed.doc));
  });

  it('ida e volta com vários mapas, passagens, mapa aberto e mapa dos jogadores', () => {
    const { ed, masmorra, porao, linkId } = dungeon();
    ed.switchMap(masmorra.id);
    const back = parseCampaign(campaignToJson(ed.campaign()));
    expect(back.maps.map((m) => m.options.name)).toEqual(['Masmorra', 'Porão']);
    expect(back.maps.map((m) => m.id)).toEqual([masmorra.id, porao.id]);
    expect(back.active).toBe(masmorra.id);
    expect(back.players).toBe(masmorra.id);
    expect(back.maps[0].links.get(linkId)).toEqual(masmorra.links.get(linkId));

    const ed2 = new Editor();
    ed2.loadCampaign(back);
    expect(ed2.doc.id).toBe(masmorra.id);
    expect(ed2.followLink(linkId)).toBe(true);
    expect(ed2.doc.options.name).toBe('Porão');
  });

  it('arquivo antigo (sem id) abre e recebe um id', () => {
    const ed = new Editor(opts('Antigo'));
    const json = JSON.parse(docToJson(ed.doc));
    delete json.id;
    const c = parseCampaign(json);
    expect(c.maps).toHaveLength(1);
    expect(c.active).toBe(c.maps[0].id);
  });

  it('recusa campanha vazia e ignora mapas com id repetido', () => {
    expect(() => parseCampaign({ format: 'atlas-board-campaign', version: 1, active: '', players: '', maps: [] })).toThrow('nenhum mapa');
    const ed = new Editor(opts('A'));
    const m = JSON.parse(docToJson(ed.doc));
    const c = parseCampaign({ format: 'atlas-board-campaign', version: 1, active: 'x', players: 'x', maps: [m, m] });
    expect(c.maps).toHaveLength(1);
    expect(c.active).toBe(c.maps[0].id);
  });

  it('os jogadores da sala online não recebem as passagens', () => {
    const { porao } = dungeon();
    expect(porao.links.size).toBe(1);
    expect(forPlayers(porao).links).toEqual([]);
  });
});
