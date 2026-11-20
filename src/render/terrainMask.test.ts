import { describe, expect, it } from 'vitest';
import { TerrainLayer } from '../core/doc/TerrainLayer';
import { HexGrid } from '../core/grid/HexGrid';
import { SquareGrid } from '../core/grid/SquareGrid';
import { TERRAINS } from '../core/doc/terrain';
import { boxBlurRGBA, buildChunkMask, cellRangeRect, chooseSlots, MASK_LAYERS, MASK_PX_PER_CELL, MASK_SLOTS } from './terrainMask';
import { terrainFragment } from './terrainShader';

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
    expect(m.slots).toEqual([1, 3]); // grama no slot 0 (R), água no slot 1 (G)
    expect(at(5 * 32, 5 * 32)[0]).toBe(255); // grama pura
    expect(at(20 * 32, 5 * 32)[1]).toBe(255); // água pura
    const edge = at(10 * 32, 5 * 32);
    expect(edge[0]).toBeGreaterThan(40);
    expect(edge[1]).toBeGreaterThan(40);
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

  it('cada chunk usa só os terrenos dele, inclusive ids altos', () => {
    const g = new SquareGrid(8, 8, 32);
    const l = new TerrainLayer(8, 8, TERRAINS.length);
    const m = buildChunkMask(g, l, 0, 0);
    const layerSize = m.width * m.height * 4;
    const mid = Math.floor(m.height / 2) * m.width + Math.floor(m.width / 2);
    expect(m.data.length).toBe(layerSize * MASK_LAYERS);
    expect(m.slots).toEqual([TERRAINS.length]);
    expect(m.data[mid * 4]).toBe(255); // o último terreno do catálogo ocupa o slot 0
  });

  it('com mais terrenos que slots, ficam os mais comuns', () => {
    const ids = new Uint8Array(100);
    for (let i = 0; i < 100; i++) ids[i] = 1 + (i % (MASK_SLOTS + 2));
    ids[0] = ids[1] = ids[2] = 9; // o 9 fica mais comum
    const slots = chooseSlots(ids);
    expect(slots).toHaveLength(MASK_SLOTS);
    expect(slots).toContain(9);
    expect([...slots].sort((a, b) => a - b)).toEqual(slots);
  });

  it('o shader declara uma máscara a cada 4 slots e uma textura por slot', () => {
    const src = terrainFragment(MASK_SLOTS);
    expect(src).toContain(`uniform sampler2D uMask${MASK_LAYERS};`);
    expect(src).not.toContain(`uMask${MASK_LAYERS + 1}`);
    expect(src).toContain(`uniform sampler2D uTex${MASK_SLOTS};`);
    expect(src).not.toContain(`uTex${MASK_SLOTS + 1};`);
  });
});
