import { describe, expect, it } from 'vitest';
import { TerrainLayer } from '../doc/TerrainLayer';
import { History } from './History';
import { PaintCommand } from './PaintCommand';

function stroke(layer: TerrainLayer, cells: [number, number][], value: number) {
  const cmd = new PaintCommand(layer, 'Pincel');
  for (const [c, r] of cells) cmd.paint(c, r, value);
  layer.flush();
  return cmd;
}

describe('History + PaintCommand', () => {
  it('um traço inteiro é desfeito e refeito de uma vez', () => {
    const layer = new TerrainLayer(20, 20, 1);
    const h = new History();
    h.push(stroke(layer, [[1, 1], [2, 1], [3, 1]], 4));
    expect(layer.get(2, 1)).toBe(4);
    h.undo();
    expect([layer.get(1, 1), layer.get(2, 1), layer.get(3, 1)]).toEqual([1, 1, 1]);
    h.redo();
    expect(layer.get(3, 1)).toBe(4);
  });

  it('pintar a mesma célula duas vezes no traço guarda o valor original', () => {
    const layer = new TerrainLayer(5, 5, 1);
    const h = new History();
    const cmd = new PaintCommand(layer, 'Pincel');
    cmd.paint(0, 0, 2);
    cmd.paint(0, 0, 3);
    h.push(cmd);
    h.undo();
    expect(layer.get(0, 0)).toBe(1);
    h.redo();
    expect(layer.get(0, 0)).toBe(3);
  });

  it('traço sem mudança não entra no histórico', () => {
    const layer = new TerrainLayer(5, 5, 1);
    const h = new History();
    h.push(stroke(layer, [[0, 0]], 1));
    expect(h.canUndo).toBe(false);
  });

  it('nova ação apaga o refazer', () => {
    const layer = new TerrainLayer(5, 5, 1);
    const h = new History();
    h.push(stroke(layer, [[0, 0]], 2));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(stroke(layer, [[1, 0]], 3));
    expect(h.canRedo).toBe(false);
  });

  it('desfazer em sequência volta ao estado inicial', () => {
    const layer = new TerrainLayer(10, 10, 1);
    const h = new History();
    h.push(stroke(layer, [[0, 0], [1, 1]], 2));
    h.push(stroke(layer, [[1, 1], [2, 2]], 3));
    h.push(stroke(layer, [[0, 0]], 4));
    h.undo(); h.undo(); h.undo();
    for (const [c, r] of [[0, 0], [1, 1], [2, 2]]) expect(layer.get(c, r)).toBe(1);
  });
});
