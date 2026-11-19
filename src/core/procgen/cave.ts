import { EMPTY } from '../doc/terrain';
import { createRng } from './rng';
import type { GenObject, GenParams, GenResult } from './types';

const DIRT = 2;
const WATER = 3;

/**
 * Caverna por autômato celular: começa com rocha aleatória (~45%), suaviza
 * algumas vezes (célula vira rocha com 5+ vizinhos de rocha), mantém só a maior
 * região conectada e coloca poças d'água e rochas soltas.
 */
export function generateCave(p: GenParams): GenResult {
  const rng = createRng(p.seed);
  const { cols, rows } = p;
  let rock = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
    rock[y * cols + x] = border || rng.chance(0.45) ? 1 : 0;
  }
  const rockAt = (g: Uint8Array, x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? 1 : g[y * cols + x]);
  for (let step = 0; step < 5; step++) {
    const next = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += rockAt(rock, x + dx, y + dy);
      next[y * cols + x] = n >= 5 || (step < 2 && n <= 1) ? 1 : 0;
    }
    rock = next;
  }
  keepLargestOpen(rock, cols, rows);

  const terrain = new Uint8Array(cols * rows);
  for (let i = 0; i < terrain.length; i++) terrain[i] = rock[i] ? EMPTY : DIRT;

  // Poças: crescem a partir de alguns pontos abertos longe das paredes.
  const pools = Math.max(1, Math.round((cols * rows) / 900));
  for (let k = 0; k < pools; k++) {
    for (let tries = 0; tries < 50; tries++) {
      const x = rng.int(2, cols - 3), y = rng.int(2, rows - 3);
      if (openRadius(rock, cols, rows, x, y) < 3) continue;
      const r = rng.int(2, 3);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + rng.int(-1, 1)) continue;
        const i = (y + dy) * cols + (x + dx);
        if (!rock[i]) terrain[i] = WATER;
      }
      break;
    }
  }

  const objects: GenObject[] = [];
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
    const i = y * cols + x;
    if (rock[i] || terrain[i] === WATER) continue;
    const nearWall = rock[i - 1] || rock[i + 1] || rock[i - cols] || rock[i + cols];
    if (nearWall && rng.chance(0.06)) {
      objects.push({ asset: 'rochas', ...p.center(x, y), rot: rng.int(0, 359), scale: 0.6 + rng.next() * 0.6 });
    }
  }
  return { terrain, walls: [], objects };
}

function openRadius(rock: Uint8Array, cols: number, rows: number, x: number, y: number) {
  for (let r = 1; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows || rock[yy * cols + xx]) return r - 1;
    }
  }
  return 6;
}

/** Enche de rocha todas as regiões abertas menos a maior (para a caverna ser toda alcançável). */
function keepLargestOpen(rock: Uint8Array, cols: number, rows: number) {
  const label = new Int32Array(cols * rows).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < rock.length; start++) {
    if (rock[start] || label[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % cols, y = (i / cols) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (!rock[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  if (!sizes.length) return;
  const biggest = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < rock.length; i++) if (!rock[i] && label[i] !== biggest) rock[i] = 1;
}
