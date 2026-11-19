import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM } from './Camera';

function cam() {
  const c = new Camera();
  c.setViewSize(800, 600);
  return c;
}

describe('Camera', () => {
  it('converte tela ↔ mundo de forma inversa', () => {
    const c = cam();
    c.x = 120; c.y = -40; c.zoom = 2.5;
    const p = { x: 333, y: 71 };
    const back = c.worldToScreen(c.screenToWorld(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('zoom mantém fixo o ponto sob o cursor', () => {
    const c = cam();
    const cursor = { x: 200, y: 150 };
    const before = c.screenToWorld(cursor);
    c.zoomAt(cursor, 1.7);
    const after = c.screenToWorld(cursor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('limita o zoom', () => {
    const c = cam();
    c.zoomAt({ x: 0, y: 0 }, 1000);
    expect(c.zoom).toBe(MAX_ZOOM);
    c.zoomAt({ x: 0, y: 0 }, 0.00001);
    expect(c.zoom).toBe(MIN_ZOOM);
  });

  it('pan move na direção oposta ao arraste, escalado pelo zoom', () => {
    const c = cam();
    c.zoom = 2;
    c.panBy(100, -50);
    expect(c.x).toBe(-50);
    expect(c.y).toBe(25);
  });

  it('fit enquadra e centraliza o retângulo', () => {
    const c = cam();
    c.fit({ x: 0, y: 0, width: 1000, height: 1000 }, 0);
    expect(c.zoom).toBeCloseTo(0.6);
    const center = c.screenToWorld({ x: 400, y: 300 });
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(500);
  });

  it('clampTo mantém parte do mapa visível', () => {
    const c = cam();
    c.x = 99999; c.y = -99999;
    c.clampTo({ x: 0, y: 0, width: 1000, height: 1000 }, 64);
    expect(c.x).toBe(1000 - 64);
    expect(c.y).toBe(-600 + 64);
  });
});
