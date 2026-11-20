import { describe, expect, it } from 'vitest';
import { SquareGrid } from '../grid/SquareGrid';
import { visibleCells } from './vision';
import { crossesSegment, rectangleSegments, type WallSegment } from './walls';

const grid = new SquareGrid(30, 30, 32);
const at = (c: number, r: number) => ({ x: (c + 0.5) * 32, y: (r + 0.5) * 32 });
const wallsOf = (segs: [{ x: number; y: number }, { x: number; y: number }][], kind: 'wall' | 'door' = 'wall'): WallSegment[] =>
  segs.map(([a, b], i) => ({ id: `w${i}`, a, b, kind }));
const has = (cells: { col: number; row: number }[], c: number, r: number) => cells.some((x) => x.col === c && x.row === r);

describe('linha de visão', () => {
  it('cruzamento de segmentos', () => {
    expect(crossesSegment({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(crossesSegment({ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(false);
    expect(crossesSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });

  it('sem paredes, vê tudo no raio', () => {
    const cells = visibleCells(grid, at(15, 15), 3, []);
    expect(has(cells, 18, 15)).toBe(true);
    expect(has(cells, 19, 15)).toBe(false);
  });

  it('dentro de uma sala fechada, não vê fora', () => {
    const room = wallsOf(rectangleSegments({ x: 10 * 32, y: 10 * 32 }, { x: 15 * 32, y: 15 * 32 }));
    const cells = visibleCells(grid, at(12, 12), 8, room);
    expect(has(cells, 10, 10)).toBe(true);
    expect(has(cells, 14, 14)).toBe(true);
    expect(has(cells, 16, 12)).toBe(false);
    expect(has(cells, 9, 12)).toBe(false);
    expect(cells.length).toBe(25);
  });

  it('porta fechada bloqueia; aberta deixa ver', () => {
    const door: WallSegment = { id: 'd', a: { x: 10 * 32, y: 12 * 32 }, b: { x: 10 * 32, y: 13 * 32 }, kind: 'door' };
    // A parede é cortada onde fica a porta.
    const split = wallsOf([[{ x: 320, y: 0 }, { x: 320, y: 12 * 32 }], [{ x: 320, y: 13 * 32 }, { x: 320, y: 960 }]]);
    expect(has(visibleCells(grid, at(8, 12), 5, [...split, door]), 11, 12)).toBe(false);
    expect(has(visibleCells(grid, at(8, 12), 5, [...split, { ...door, open: true }]), 11, 12)).toBe(true);
  });
});
