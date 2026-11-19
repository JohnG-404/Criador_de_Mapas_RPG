import { describe, expect, it } from 'vitest';
import { TerrainLayer } from '../doc/TerrainLayer';
import { HexGrid } from '../grid/HexGrid';
import { SquareGrid } from '../grid/SquareGrid';
import { floodFill } from './floodFill';
import { strokeCells } from './strokeCells';

describe('floodFill', () => {
  it('preenche só a região conectada (quadrado)', () => {
    const g = new SquareGrid(10, 10, 32);
    const l = new TerrainLayer(10, 10, 1);
    for (let r = 0; r < 10; r++) l.set(5, r, 2); // parede vertical
    expect(floodFill(g, l, { col: 0, row: 0 })).toHaveLength(50);
    expect(floodFill(g, l, { col: 5, row: 3 })).toHaveLength(10);
  });

  it('no quadrado a diagonal não conecta', () => {
    const g = new SquareGrid(3, 3, 32);
    const l = new TerrainLayer(3, 3, 1);
    l.set(1, 0, 2); l.set(0, 1, 2);
    expect(floodFill(g, l, { col: 0, row: 0 })).toHaveLength(1);
  });

  it('funciona no hex e cobre o mapa todo se uniforme', () => {
    const g = new HexGrid(12, 9, 32);
    const l = new TerrainLayer(12, 9, 1);
    expect(floodFill(g, l, { col: 3, row: 3 })).toHaveLength(108);
  });

  it('respeita o limite de células', () => {
    const g = new SquareGrid(100, 100, 32);
    const l = new TerrainLayer(100, 100, 1);
    expect(floodFill(g, l, { col: 0, row: 0 }, 500)).toHaveLength(500);
  });
});

describe('strokeCells', () => {
  it('um movimento rápido não deixa buracos', () => {
    const g = new SquareGrid(50, 10, 32);
    const cells = strokeCells(g, { x: 16, y: 16 }, { x: 40 * 32 + 16, y: 16 }, 0);
    expect(cells.map((c) => c.col).sort((a, b) => a - b)).toEqual(Array.from({ length: 41 }, (_, i) => i));
  });

  it('não repete células', () => {
    const g = new HexGrid(20, 20, 32);
    const cells = strokeCells(g, { x: 100, y: 100 }, { x: 300, y: 200 }, 2);
    const keys = cells.map((c) => `${c.col},${c.row}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
