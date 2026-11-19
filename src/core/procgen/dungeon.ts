import { EMPTY } from '../doc/terrain';
import { createRng, type Rng } from './rng';
import type { GenObject, GenParams, GenResult } from './types';

const FLOOR = 4; // piso de pedra

interface Room { x: number; y: number; w: number; h: number }

/**
 * Masmorra: salas retangulares sem sobreposição ligadas por corredores em L
 * (cada sala à mais próxima já conectada, formando uma árvore, mais alguns
 * atalhos). Paredes contornam todo o piso; onde um corredor entra numa sala,
 * às vezes há uma porta.
 */
export function generateDungeon(p: GenParams): GenResult {
  const rng = createRng(p.seed);
  const { cols, rows } = p;
  const floor = new Uint8Array(cols * rows); // 0 = rocha, 1 = sala, 2 = corredor
  const roomId = new Int32Array(cols * rows).fill(-1);
  const rooms = placeRooms(rng, cols, rows);
  rooms.forEach((r, id) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      floor[y * cols + x] = 1;
      roomId[y * cols + x] = id;
    }
  });

  // Árvore de corredores (tipo Prim) e alguns atalhos para ter ciclos.
  const center = (r: Room) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
  const connected = [0];
  const pending = rooms.map((_, i) => i).slice(1);
  const links: [number, number][] = [];
  while (pending.length) {
    let best: [number, number, number] | null = null;
    for (const a of connected) for (const b of pending) {
      const ca = center(rooms[a]), cb = center(rooms[b]);
      const d = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
      if (!best || d < best[2]) best = [a, b, d];
    }
    const [a, b] = best!;
    links.push([a, b]);
    connected.push(b);
    pending.splice(pending.indexOf(b), 1);
  }
  const extra = Math.floor(rooms.length / 4);
  for (let i = 0; i < extra && rooms.length > 2; i++) {
    const a = rng.int(0, rooms.length - 1);
    const b = rng.int(0, rooms.length - 1);
    if (a !== b) links.push([a, b]);
  }
  const carve = (x: number, y: number) => { if (!floor[y * cols + x]) floor[y * cols + x] = 2; };
  for (const [a, b] of links) {
    const ca = center(rooms[a]), cb = center(rooms[b]);
    const horizontalFirst = rng.chance(0.5);
    const corner = horizontalFirst ? { x: cb.x, y: ca.y } : { x: ca.x, y: cb.y };
    line(ca, corner, carve);
    line(corner, cb, carve);
  }

  const terrain = new Uint8Array(cols * rows);
  for (let i = 0; i < floor.length; i++) terrain[i] = floor[i] ? FLOOR : EMPTY;

  const walls = buildWalls(floor, roomId, cols, rows, p.cellSize, rng);
  const objects = furnish(rooms, rng, p.cellSize);
  return { terrain, walls, objects };
}

function placeRooms(rng: Rng, cols: number, rows: number): Room[] {
  const rooms: Room[] = [];
  const target = Math.max(3, Math.min(30, Math.round((cols * rows) / 160)));
  const maxW = Math.max(4, Math.min(12, Math.floor(cols / 3)));
  const maxH = Math.max(4, Math.min(10, Math.floor(rows / 3)));
  for (let tries = 0; tries < target * 30 && rooms.length < target; tries++) {
    const w = rng.int(4, maxW);
    const h = rng.int(4, maxH);
    if (w > cols - 2 || h > rows - 2) continue;
    const x = rng.int(1, cols - w - 1);
    const y = rng.int(1, rows - h - 1);
    // Duas células de folga entre salas, para os corredores terem paredes dos dois lados.
    const clash = rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y);
    if (!clash) rooms.push({ x, y, w, h });
  }
  if (!rooms.length) rooms.push({ x: 1, y: 1, w: Math.max(1, cols - 2), h: Math.max(1, rows - 2) });
  return rooms;
}

function line(a: { x: number; y: number }, b: { x: number; y: number }, fn: (x: number, y: number) => void) {
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  let x = a.x, y = a.y;
  fn(x, y);
  while (x !== b.x || y !== b.y) {
    if (x !== b.x) x += dx; else y += dy;
    fn(x, y);
  }
}

/**
 * Uma aresta de parede entre cada célula de piso e uma de rocha (ou a borda);
 * arestas alinhadas viram um segmento só. Entre sala e corredor, porta.
 */
function buildWalls(floor: Uint8Array, roomId: Int32Array, cols: number, rows: number, s: number, rng: Rng) {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? 0 : floor[y * cols + x]);
  const room = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? -1 : roomId[y * cols + x]);
  const walls: GenResult['walls'] = [];
  const doorEdges: GenResult['walls'] = [];
  const doorChance = 0.65;
  // Arestas horizontais: entre (x, y-1) e (x, y), para y = 0..rows
  for (let y = 0; y <= rows; y++) {
    let start = -1;
    for (let x = 0; x <= cols; x++) {
      const up = at(x, y - 1), down = at(x, y);
      const wall = x < cols && (up ? 1 : 0) !== (down ? 1 : 0);
      if (wall && start < 0) start = x;
      if (!wall && start >= 0) {
        walls.push({ a: { x: start * s, y: y * s }, b: { x: x * s, y: y * s }, kind: 'wall' });
        start = -1;
      }
      // Porta: corredor de largura 1 entrando numa sala por cima/baixo.
      if (x < cols && up && down && (room(x, y - 1) >= 0) !== (room(x, y) >= 0) && !at(x - 1, room(x, y - 1) >= 0 ? y : y - 1) && !at(x + 1, room(x, y - 1) >= 0 ? y : y - 1) && rng.chance(doorChance)) {
        doorEdges.push({ a: { x: x * s, y: y * s }, b: { x: (x + 1) * s, y: y * s }, kind: 'door' });
      }
    }
  }
  // Arestas verticais: entre (x-1, y) e (x, y)
  for (let x = 0; x <= cols; x++) {
    let start = -1;
    for (let y = 0; y <= rows; y++) {
      const left = at(x - 1, y), right = at(x, y);
      const wall = y < rows && (left ? 1 : 0) !== (right ? 1 : 0);
      if (wall && start < 0) start = y;
      if (!wall && start >= 0) {
        walls.push({ a: { x: x * s, y: start * s }, b: { x: x * s, y: y * s }, kind: 'wall' });
        start = -1;
      }
      if (y < rows && left && right && (room(x - 1, y) >= 0) !== (room(x, y) >= 0)) {
        const corridorX = room(x - 1, y) >= 0 ? x : x - 1;
        if (!at(corridorX, y - 1) && !at(corridorX, y + 1) && rng.chance(doorChance)) {
          doorEdges.push({ a: { x: x * s, y: y * s }, b: { x: x * s, y: (y + 1) * s }, kind: 'door' });
        }
      }
    }
  }
  return [...walls, ...doorEdges];
}

function furnish(rooms: Room[], rng: Rng, s: number): GenObject[] {
  const out: GenObject[] = [];
  const put = (asset: string, x: number, y: number, rot = 0) => out.push({ asset, x: x * s, y: y * s, rot, scale: 1 });
  rooms.forEach((r, i) => {
    // Tochas nas paredes de cima.
    if (r.w >= 5) { put('tocha', r.x + 0.5, r.y + 0.6); put('tocha', r.x + r.w - 0.5, r.y + 0.6); }
    const big = r.w >= 7 && r.h >= 5;
    if (big && rng.chance(0.6)) {
      put('tapete', r.x + r.w / 2, r.y + r.h / 2);
      put('mesa', r.x + r.w / 2, r.y + r.h / 2);
    }
    if (rng.chance(0.5)) {
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) put('barril', r.x + 0.6 + k * 0.95, r.y + r.h - 0.6);
    }
    // Um baú no canto de algumas salas, garantido na última (o "tesouro").
    if (i === rooms.length - 1 || rng.chance(0.25)) put('bau', r.x + r.w - 1, r.y + r.h - 0.7);
    if (!big && rng.chance(0.3)) put('rochas', r.x + rng.int(1, Math.max(1, r.w - 2)) + 0.5, r.y + rng.int(1, Math.max(1, r.h - 2)) + 0.5, rng.int(0, 3) * 90);
  });
  return out;
}
