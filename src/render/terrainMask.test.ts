import { describe, expect, it } from 'vitest';
import { TerrainLayer } from '../core/doc/TerrainLayer';
import { HexGrid } from '../core/grid/HexGrid';
import { SquareGrid } from '../core/grid/SquareGrid';
import { boxBlurRGBA, buildChunkMask, cellRangeRect, MASK_PX_PER_CELL } from './terrainMask';

describe('máscara de terreno', () => {
  it('o desfoque preserva uma área uniforme', () => {
    const d = new Uint8Array(10 * 10 * 4).fill(255);
    boxBlurRGBA(d, 10, 10, 2);
    expect([...d].every((v) => v === 255)).toBe(true);
  });

  it('marca o canal do terreno no meio de uma célula e mistura na borda', () => {
    const g = new SquareGrid(64, 64, 32);
    const l = new TerrainLayer(64, 64, 1);
    for (let r = 0; r < 64; r++) for (let c = 10; c < 64; c++) l.set(c, r, 3);
    const m = buildChunkMask(g, l, 0, 0);
    const at = (wx: number, wy: number) => {
      const i = Math.floor((wx - m.maskRect.x) / (32 / MASK_PX_PER_CELL));
      const j = Math.floor((wy - m.maskRect.y) / (32 / MASK_PX_PER_CELL));
      const k = (j * m.width + i) * 4;
      return [m.data[k], m.data[k + 1], m.data[k + 2], m.data[k + 3]];
    };
    expect(at(5 * 32, 5 * 32)[0]).toBe(255); // grama pura
    expect(at(20 * 32, 5 * 32)[2]).toBe(255); // água pura
    const edge = at(10 * 32, 5 * 32);
    expect(edge[0]).toBeGreaterThan(40);
    expect(edge[2]).toBeGreaterThan(40);
  });

  it('células fora do mapa ficam zeradas', () => {
    const g = new SquareGrid(8, 8, 32);
    const l = new TerrainLayer(8, 8, 1);
    const m = buildChunkMask(g, l, 0, 0);
    expect(m.data[0]).toBe(0); // canto da margem, fora do mapa
  });

  it('o retângulo do hex cobre todas as células do intervalo', () => {
    const g = new HexGrid(40, 40, 32);
    const r = cellRangeRect(g, 0, 31, 0, 31);
    for (const cell of [{ col: 0, row: 1 }, { col: 31, row: 1 }, { col: 31, row: 31 }]) {
      for (const p of g.cellPolygon(cell)) {
        expect(p.x).toBeGreaterThanOrEqual(r.x - 1e-6);
        expect(p.x).toBeLessThanOrEqual(r.x + r.width + 1e-6);
        expect(p.y).toBeLessThanOrEqual(r.y + r.height + 1e-6);
      }
    }
  });
});
