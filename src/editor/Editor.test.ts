import { describe, expect, it } from 'vitest';
import { EMPTY } from '../core/doc/terrain';
import { Editor } from './Editor';

function editor(kind: 'square' | 'hex' = 'square') {
  return new Editor({ name: 't', gridKind: kind, cols: 40, rows: 30, fill: 1, cellMeters: 1.5 });
}

describe('Editor', () => {
  it('pincel pinta um traço que vira um passo de desfazer', () => {
    const e = editor();
    e.setTerrain(3);
    e.setBrushSize(1);
    const g = e.doc.grid;
    e.pointerDown(g.cellToWorld({ col: 2, row: 2 }));
    e.pointerMove(g.cellToWorld({ col: 10, row: 2 }));
    e.pointerUp();
    for (let c = 2; c <= 10; c++) expect(e.doc.terrain.get(c, 2)).toBe(3);
    expect(e.getState().canUndo).toBe(true);
    e.undo();
    for (let c = 2; c <= 10; c++) expect(e.doc.terrain.get(c, 2)).toBe(1);
    expect(e.getState().canRedo).toBe(true);
  });

  it('borracha deixa vazio', () => {
    const e = editor();
    e.setTool('eraser');
    e.setBrushSize(1);
    const p = e.doc.grid.cellToWorld({ col: 5, row: 5 });
    e.pointerDown(p);
    e.pointerUp();
    expect(e.doc.terrain.get(5, 5)).toBe(EMPTY);
  });

  it('balde preenche a região e é desfeito de uma vez', () => {
    const e = editor('hex');
    e.setTool('bucket');
    e.setTerrain(2);
    e.pointerDown(e.doc.grid.cellToWorld({ col: 0, row: 0 }));
    expect(e.doc.terrain.get(39, 29)).toBe(2);
    e.undo();
    expect(e.doc.terrain.get(39, 29)).toBe(1);
  });

  it('limita o tamanho do pincel', () => {
    const e = editor();
    e.setBrushSize(99);
    expect(e.getState().brushSize).toBe(9);
    e.setBrushSize(0);
    expect(e.getState().brushSize).toBe(1);
  });

  it('mapa novo limpa o histórico e muda a versão', () => {
    const e = editor();
    e.pointerDown(e.doc.grid.cellToWorld({ col: 1, row: 1 }));
    e.pointerUp();
    const v = e.getState().docVersion;
    e.newMap({ name: 'n', gridKind: 'hex', cols: 10, rows: 10, fill: 4, cellMeters: 1.5 });
    expect(e.getState().canUndo).toBe(false);
    expect(e.getState().docVersion).toBe(v + 1);
    expect(e.doc.grid.kind).toBe('hex');
  });
});
