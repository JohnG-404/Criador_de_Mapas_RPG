import { describe, expect, it } from 'vitest';
import { EMPTY } from '../doc/terrain';
import { generate, type GeneratorKind, type GenParams } from './index';
import { createRng, seedFromText } from './rng';

const params = (seed: number, cols = 60, rows = 40): GenParams => ({
  cols, rows, cellSize: 32, seed, hex: false,
  center: (c, r) => ({ x: (c + 0.5) * 32, y: (r + 0.5) * 32 }),
});

/** Quantas regiões de células não vazias, ligadas pelos 4 lados. */
function regions(terrain: Uint8Array, cols: number, rows: number) {
  const seen = new Uint8Array(terrain.length);
  let count = 0;
  for (let s = 0; s < terrain.length; s++) {
    if (terrain[s] === EMPTY || seen[s]) continue;
    count++;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % cols, y = (i / cols) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (terrain[j] !== EMPTY && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
  }
  return count;
}

describe('gerador pseudoaleatório', () => {
  it('é reproduzível e converte texto em semente', () => {
    const a = createRng(42), b = createRng(42);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(seedFromText('123')).toBe(123);
    expect(seedFromText('dragão')).toBe(seedFromText('dragão'));
    expect(seedFromText('dragão')).not.toBe(seedFromText('dragao'));
  });
});

describe.each<GeneratorKind>(['dungeon', 'cave', 'region'])('gerador %s', (kind) => {
  it('mesma semente gera o mesmo mapa; semente diferente, outro', () => {
    const a = generate(kind, params(7));
    const b = generate(kind, params(7));
    const c = generate(kind, params(8));
    expect(b).toEqual(a);
    expect(c.terrain).not.toEqual(a.terrain);
  });

  it('o espaço caminhável é todo conectado', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = generate(kind, params(seed));
      if (kind === 'region') continue; // região não tem vazio
      expect(regions(r.terrain, 60, 40)).toBe(1);
    }
  });

  it('objetos ficam dentro do mapa', () => {
    const r = generate(kind, params(11));
    for (const o of r.objects) {
      expect(o.x).toBeGreaterThan(0);
      expect(o.y).toBeGreaterThan(0);
      expect(o.x).toBeLessThan(60 * 32);
      expect(o.y).toBeLessThan(40 * 32);
    }
  });
});

describe('masmorra', () => {
  it('tem paredes contornando o piso e portas entre duas células de piso', () => {
    const r = generate('dungeon', params(3));
    const floorAt = (x: number, y: number) => x >= 0 && y >= 0 && x < 60 && y < 40 && r.terrain[y * 60 + x] !== EMPTY;
    const doors = r.walls.filter((w) => w.kind === 'door');
    const walls = r.walls.filter((w) => w.kind === 'wall');
    expect(walls.length).toBeGreaterThan(10);
    expect(doors.length).toBeGreaterThan(0);
    for (const d of doors) {
      const horizontal = d.a.y === d.b.y;
      const x = Math.min(d.a.x, d.b.x) / 32, y = Math.min(d.a.y, d.b.y) / 32;
      if (horizontal) expect(floorAt(x, y - 1) && floorAt(x, y)).toBe(true);
      else expect(floorAt(x - 1, y) && floorAt(x, y)).toBe(true);
    }
    // Toda parede separa piso de rocha: no meio dela, um lado tem piso e o outro não.
    for (const w of walls) {
      const mx = (w.a.x + w.b.x) / 2 / 32, my = (w.a.y + w.b.y) / 2 / 32;
      const firstCell = w.a.y === w.b.y ? [Math.floor(mx), my - 1, Math.floor(mx), my] : [mx - 1, Math.floor(my), mx, Math.floor(my)];
      expect(floorAt(firstCell[0], firstCell[1])).not.toBe(floorAt(firstCell[2], firstCell[3]));
    }
  });

  it('funciona em mapas pequenos', () => {
    const r = generate('dungeon', params(1, 8, 8));
    expect(regions(r.terrain, 8, 8)).toBe(1);
  });
});
