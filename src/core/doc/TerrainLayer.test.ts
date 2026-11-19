import { describe, expect, it, vi } from 'vitest';
import { CHUNK_SIZE, TerrainLayer } from './TerrainLayer';

describe('TerrainLayer', () => {
  it('começa com o terreno inicial e não aloca chunks até pintar', () => {
    const l = new TerrainLayer(100, 70, 1);
    expect(l.get(99, 69)).toBe(1);
    expect(l.chunksX).toBe(Math.ceil(100 / CHUNK_SIZE));
  });

  it('set retorna o valor anterior e get lê o novo', () => {
    const l = new TerrainLayer(64, 64, 1);
    expect(l.set(40, 33, 3)).toBe(1);
    expect(l.get(40, 33)).toBe(3);
    expect(l.get(39, 33)).toBe(1);
  });

  it('ignora células fora do mapa', () => {
    const l = new TerrainLayer(10, 10, 1);
    expect(l.set(10, 0, 3)).toBe(0);
    expect(l.get(-1, 0)).toBe(0);
  });

  it('flush avisa só os chunks alterados', () => {
    const l = new TerrainLayer(100, 100, 1);
    const fn = vi.fn();
    l.onChange(fn);
    l.set(1, 1, 2);
    l.set(33, 70, 2);
    l.set(5, 5, 1); // sem mudança real
    l.flush();
    expect(fn).toHaveBeenCalledOnce();
    expect([...fn.mock.calls[0][0]].sort()).toEqual(['0,0', '1,2']);
    l.flush();
    expect(fn).toHaveBeenCalledOnce();
  });
});
