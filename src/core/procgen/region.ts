import { createNoise } from './noise';
import { createRng } from './rng';
import type { GenObject, GenParams, GenResult } from './types';

const GRASS = 1;
const DIRT = 2;
const WATER = 3;

/**
 * Região ao ar livre: ruído de relevo define lagos (baixo), margens de terra e
 * campo; um segundo ruído decide onde há mata. Uma estrada de terra cruza o
 * mapa de uma borda à outra desviando da água.
 */
export function generateRegion(p: GenParams): GenResult {
  const rng = createRng(p.seed);
  const { cols, rows } = p;
  const height = createNoise(rng);
  const forest = createNoise(rng);
  const scale = 1 / 14;
  const terrain = new Uint8Array(cols * rows);
  const elev = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const e = height.fbm(x * scale, y * scale, 4);
    elev[y * cols + x] = e;
    terrain[y * cols + x] = e < -0.22 ? WATER : e < -0.16 ? DIRT : GRASS;
  }

  // Estrada: da borda esquerda à direita, cada passo escolhe a próxima linha
  // pelo menor custo (água cara, mudanças bruscas caras).
  const road: number[] = [];
  let ry = rng.int(Math.floor(rows * 0.25), Math.ceil(rows * 0.75) - 1);
  for (let x = 0; x < cols; x++) {
    let best = ry;
    let bestCost = Infinity;
    for (const dy of [-1, 0, 1]) {
      const y = ry + dy;
      if (y < 1 || y >= rows - 1) continue;
      const cost = (elev[y * cols + x] < -0.2 ? 50 : 0) + Math.abs(dy) * 0.6 + rng.next() * 0.9 + Math.abs(y - rows / 2) * 0.01;
      if (cost < bestCost) { bestCost = cost; best = y; }
    }
    ry = best;
    road.push(ry);
    for (const y of [ry, ry + 1]) if (y < rows) terrain[y * cols + x] = DIRT;
  }

  const objects: GenObject[] = [];
  const s = p.cellSize;
  const onRoad = (x: number, y: number) => Math.abs(y - road[x]) <= 2;
  for (let y = 1; y < rows - 1; y += 1) for (let x = 1; x < cols - 1; x += 1) {
    if (terrain[y * cols + x] !== GRASS || onRoad(x, y)) continue;
    const f = forest.fbm(x / 10, y / 10, 3);
    const jitter = () => (rng.next() - 0.5) * 0.6;
    if (f > 0.12 && rng.chance(0.22)) {
      objects.push({ asset: 'arvore', ...offset(p.center(x, y), jitter() * s, jitter() * s), rot: rng.int(0, 359), scale: 0.8 + rng.next() * 0.5 });
    } else if (f > 0 && rng.chance(0.05)) {
      objects.push({ asset: 'arbusto', ...offset(p.center(x, y), jitter() * s, jitter() * s), rot: rng.int(0, 359), scale: 0.8 + rng.next() * 0.4 });
    } else if (rng.chance(0.006)) {
      objects.push({ asset: 'rochas', ...p.center(x, y), rot: rng.int(0, 359), scale: 0.7 + rng.next() * 0.5 });
    }
  }
  return { terrain, walls: [], objects };
}

function offset(c: { x: number; y: number }, dx: number, dy: number) {
  return { x: c.x + dx, y: c.y + dy };
}
