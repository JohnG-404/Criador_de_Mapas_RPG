import { describe, expect, it } from 'vitest';
import { HexGrid } from '../grid/HexGrid';
import { SquareGrid } from '../grid/SquareGrid';
import { ItemLayer, ItemsCommand } from './ItemLayer';
import { hitObject, type MapObject } from './objects';
import { nearestEdge, rectangleSegments, snapToVertex, subtractCollinear, type WallSegment } from './walls';

describe('paredes', () => {
  it('encaixa no canto mais próximo (quadrado)', () => {
    const g = new SquareGrid(10, 10, 32);
    expect(snapToVertex(g, { x: 70, y: 20 })).toEqual({ x: 64, y: 32 });
    expect(snapToVertex(g, { x: -50, y: 9999 })).toEqual({ x: 0, y: 320 });
  });

  it('encaixa num vértice de hexágono', () => {
    const g = new HexGrid(10, 10, 32);
    const cell = { col: 4, row: 4 };
    const v = g.cellPolygon(cell)[4];
    const s = snapToVertex(g, { x: v.x + 2, y: v.y + 3 });
    expect(s.x).toBeCloseTo(v.x, 2);
    expect(s.y).toBeCloseTo(v.y, 2);
  });

  it('acha a aresta mais próxima', () => {
    const g = new SquareGrid(10, 10, 32);
    expect(nearestEdge(g, { x: 40, y: 34 })).toEqual({ a: { x: 32, y: 32 }, b: { x: 64, y: 32 } });
  });

  it('retângulo vira 4 paredes; linha vira 1', () => {
    expect(rectangleSegments({ x: 0, y: 0 }, { x: 64, y: 32 })).toHaveLength(4);
    expect(rectangleSegments({ x: 0, y: 0 }, { x: 64, y: 0 })).toHaveLength(1);
  });

  it('porta corta a parede colinear em duas partes', () => {
    const parts = subtractCollinear({ a: { x: 0, y: 0 }, b: { x: 160, y: 0 } }, { x: 64, y: 0 }, { x: 96, y: 0 });
    expect(parts).toEqual([[{ x: 0, y: 0 }, { x: 64, y: 0 }], [{ x: 96, y: 0 }, { x: 160, y: 0 }]]);
  });

  it('porta na ponta deixa uma parte; fora da parede não corta', () => {
    expect(subtractCollinear({ a: { x: 0, y: 0 }, b: { x: 64, y: 0 } }, { x: 0, y: 0 }, { x: 32, y: 0 })).toHaveLength(1);
    expect(subtractCollinear({ a: { x: 0, y: 0 }, b: { x: 64, y: 0 } }, { x: 0, y: 32 }, { x: 32, y: 32 })).toBeNull();
    expect(subtractCollinear({ a: { x: 0, y: 0 }, b: { x: 64, y: 0 } }, { x: 64, y: 0 }, { x: 96, y: 0 })).toBeNull();
  });
});

describe('ItemsCommand', () => {
  it('desfaz e refaz criação, mudança e remoção', () => {
    const layer = new ItemLayer<WallSegment>();
    const seg = (id: string, x: number): WallSegment => ({ id, a: { x: 0, y: 0 }, b: { x, y: 0 }, kind: 'wall' });
    const c1 = new ItemsCommand(layer, 'Parede');
    c1.set('a', seg('a', 32));
    c1.set('b', seg('b', 64));
    const c2 = new ItemsCommand(layer, 'Mudar');
    c2.set('a', seg('a', 96));
    c2.set('b', null);
    expect(layer.size).toBe(1);
    c2.revert();
    expect(layer.get('a')!.b.x).toBe(32);
    expect(layer.size).toBe(2);
    c1.revert();
    expect(layer.size).toBe(0);
    c1.apply(); c2.apply();
    expect(layer.get('a')!.b.x).toBe(96);
    expect(layer.get('b')).toBeUndefined();
  });
});

describe('objetos', () => {
  it('acerta o retângulo girado', () => {
    const o: MapObject = { id: 'o', asset: 'mesa', x: 100, y: 100, rot: 90, scale: 1 };
    // mesa 2,6 × 1,6 células; girada 90°, fica alta
    expect(hitObject(o, 32, { x: 100, y: 100 + 1.2 * 32 })).toBe(true);
    expect(hitObject(o, 32, { x: 100 + 1.2 * 32, y: 100 })).toBe(false);
  });
});
