import { describe, expect, it } from 'vitest';
import { MapDocument } from '../core/doc/MapDocument';
import { buildSceneData, groundHeights, WALL_HEIGHTS, WALL_THICKNESS, WATER_DEPTH } from './sceneData';

const opts = { name: 't', gridKind: 'square' as const, cols: 10, rows: 8, fill: 1, cellMeters: 1.5 };

describe('cena 3D', () => {
  it('parede vira caixa com cantos fechados e altura escolhida', () => {
    const doc = new MapDocument(opts);
    doc.walls.put('w', { id: 'w', a: { x: 32, y: 64 }, b: { x: 160, y: 64 }, kind: 'wall' });
    const s = buildSceneData(doc, 'alta');
    expect(s.boxes).toHaveLength(1);
    const b = s.boxes[0];
    expect(b).toMatchObject({ x: 3, z: 2, height: WALL_HEIGHTS.alta, kind: 'wall', style: 'pedra' });
    expect(b.len).toBeCloseTo(4 + WALL_THICKNESS);
    expect(b.rotY).toBeCloseTo(0);
  });

  it('porta fechada fica no vão e aberta gira na dobradiça', () => {
    const doc = new MapDocument(opts);
    doc.walls.put('d', { id: 'd', a: { x: 64, y: 64 }, b: { x: 64, y: 96 }, kind: 'door' });
    const leaf = () => buildSceneData(doc).boxes.find((b) => b.kind === 'door')!;
    const closed = leaf();
    expect(closed.x).toBeCloseTo(2);
    expect(closed.z).toBeCloseTo(2.5);
    expect(buildSceneData(doc).boxes.filter((b) => b.kind === 'jamb')).toHaveLength(2);
    doc.walls.put('d', { id: 'd', a: { x: 64, y: 64 }, b: { x: 64, y: 96 }, kind: 'door', open: true });
    const open = leaf();
    // A porta vertical (para baixo) abre para o lado -x (perpendicular +n = (-uy, ux)).
    expect(open.x).toBeLessThan(2 - 0.3);
    expect(Math.abs(open.rotY - closed.rotY)).toBeGreaterThan(1.2);
  });

  it('objetos ganham volume; tapete e imagens próprias ficam no chão; árvore tem tronco', () => {
    const doc = new MapDocument(opts);
    doc.objects.put('a', { id: 'a', asset: 'barril', x: 48, y: 48, rot: 90, scale: 2 });
    doc.objects.put('b', { id: 'b', asset: 'tapete', x: 100, y: 100, rot: 0, scale: 1 });
    doc.objects.put('c', { id: 'c', asset: 'arvore', x: 200, y: 100, rot: 0, scale: 1 });
    doc.assets.put('img-x', { id: 'img-x', key: 'img-x', name: 'x', w: 1, h: 1, data: 'data:image/png;base64,AA==' });
    doc.assets.emit();
    doc.objects.put('d', { id: 'd', asset: 'img-x', x: 100, y: 200, rot: 0, scale: 1 });
    const p = Object.fromEntries(buildSceneData(doc).props.map((x) => [x.id, x]));
    expect(p.a).toMatchObject({ x: 1.5, z: 1.5, w: 1.8, d: 1.8, height: 1.3 });
    expect(p.a.rotY).toBeCloseTo(-Math.PI / 2);
    expect(p.b.height).toBe(0);
    expect(p.d.height).toBe(0);
    expect(p.c.trunk).toBeDefined();
    expect(p.c.base).toBeGreaterThan(1);
  });

  it('tokens viram miniaturas', () => {
    const doc = new MapDocument(opts);
    doc.tokens.put('t', { id: 't', name: 'Ana', x: 80, y: 48, size: 2, color: '#b8322c' });
    expect(buildSceneData(doc).minis).toEqual([{ id: 't', name: 'Ana', color: '#b8322c', x: 2.5, z: 1.5, size: 2 }]);
  });

  it('água afunda o chão e o resto fica plano', () => {
    const doc = new MapDocument(opts);
    for (let r = 2; r < 6; r++) for (let c = 2; c < 6; c++) doc.terrain.set(c, r, 3);
    doc.terrain.flush();
    expect(buildSceneData(doc).hasWater).toBe(true);
    const h = groundHeights(doc, 10, 8);
    expect(h[4 * 11 + 4]).toBeCloseTo(-WATER_DEPTH);
    expect(h[0]).toBe(0);
    expect(h[7 * 11 + 9]).toBe(0);
  });

  it('funciona em grid hexagonal', () => {
    const doc = new MapDocument({ ...opts, gridKind: 'hex' });
    const s = buildSceneData(doc);
    expect(s.width).toBeGreaterThan(9);
    expect(groundHeights(doc, 8, 8).every((v) => v === 0)).toBe(true);
  });
});
