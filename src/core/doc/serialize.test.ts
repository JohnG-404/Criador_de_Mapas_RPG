import { describe, expect, it } from 'vitest';
import { FOG_HIDDEN, MapDocument } from './MapDocument';
import { decodeLayer, docToJson, encodeLayer, mapFileName, parseMap } from './serialize';

const opts = { name: 'Taverna', gridKind: 'square' as const, cols: 40, rows: 30, fill: 1, cellMeters: 1.5 };

describe('camadas comprimidas', () => {
  it('ida e volta com repetições longas e curtas', () => {
    const data = new Uint8Array(70_000);
    data.fill(3, 100, 50_000);
    data[60_000] = 2;
    const text = encodeLayer(data);
    expect(text.length).toBeLessThan(40);
    expect(decodeLayer(text, data.length)).toEqual(data);
  });

  it('recusa camada com tamanho errado', () => {
    expect(() => decodeLayer(encodeLayer(new Uint8Array(10)), 11)).toThrow('corrompida');
  });
});

describe('arquivo .rpgmap', () => {
  it('salva e abre o mapa com terreno, névoa, paredes, objetos e tokens', () => {
    const doc = new MapDocument(opts);
    doc.terrain.set(5, 6, 3);
    doc.terrain.flush();
    doc.fog.set(1, 1, FOG_HIDDEN);
    doc.walls.put('w1', { id: 'w1', a: { x: 0, y: 0 }, b: { x: 64, y: 0 }, kind: 'wall' });
    doc.walls.put('d1', { id: 'd1', a: { x: 64, y: 0 }, b: { x: 96, y: 0 }, kind: 'door' });
    doc.objects.put('o1', { id: 'o1', asset: 'mesa', x: 100, y: 120, rot: 15, scale: 1.2 });
    doc.tokens.put('t1', { id: 't1', name: 'Guerreira', x: 48, y: 48, size: 1, color: '#c0392b' });

    const back = parseMap(docToJson(doc));
    expect(back.options).toEqual(opts);
    expect(back.terrain.get(5, 6)).toBe(3);
    expect(back.terrain.get(0, 0)).toBe(1);
    expect(back.fog.get(1, 1)).toBe(FOG_HIDDEN);
    expect(back.fog.get(2, 1)).toBe(0);
    expect(back.walls.all()).toEqual(doc.walls.all());
    expect(back.objects.all()).toEqual(doc.objects.all());
    expect(back.tokens.all()).toEqual(doc.tokens.all());
  });

  it('dá mensagens claras para arquivos inválidos', () => {
    expect(() => parseMap('não é json')).toThrow('JSON inválido');
    expect(() => parseMap('{"format":"outro"}')).toThrow('não é um mapa');
    const f = JSON.parse(docToJson(new MapDocument(opts)));
    expect(() => parseMap({ ...f, version: 99 })).toThrow('versão mais nova');
    expect(() => parseMap({ ...f, options: { ...f.options, cols: 5000 } })).toThrow('tamanho');
  });

  it('ignora itens malformados sem quebrar o mapa', () => {
    const f = JSON.parse(docToJson(new MapDocument(opts)));
    f.objects = [{ id: 'x', asset: 'inexistente', x: 1, y: 1 }, null];
    f.tokens = [{ id: 't', x: 'a' }];
    const doc = parseMap(f);
    expect(doc.objects.size).toBe(0);
    expect(doc.tokens.size).toBe(0);
  });

  it('gera nome de arquivo sem acentos', () => {
    expect(mapFileName('Taverna do Dragão!')).toBe('taverna-do-dragao.rpgmap');
    expect(mapFileName('   ')).toBe('mapa.rpgmap');
  });
});
