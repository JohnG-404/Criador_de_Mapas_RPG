import { describe, expect, it } from 'vitest';
import { EMPTY } from '../core/doc/terrain';
import { Editor } from './Editor';

function setup() {
  const e = new Editor({ name: 't', gridKind: 'square', cols: 20, rows: 20, fill: 1, cellMeters: 1.5 });
  const at = (col: number, row: number) => e.doc.grid.cellToWorld({ col, row });
  e.setObjectAsset('barril');
  e.pointerDown(at(3, 3)); e.pointerUp();
  e.setTokenTemplate(null);
  e.pointerDown(at(4, 4)); e.pointerUp();
  e.pointerDown(at(12, 12)); e.pointerUp();
  e.setTool('select');
  return { e, at };
}

/** Arrasta uma caixa do canto superior esquerdo da célula a ao inferior direito da célula b. */
function box(e: Editor, a: [number, number], b: [number, number], shift = false) {
  const s = e.doc.grid.cellSize;
  e.pointerDown({ x: a[0] * s + 2, y: a[1] * s + 2 }, { shift });
  e.pointerMove({ x: (b[0] + 1) * s - 2, y: (b[1] + 1) * s - 2 });
  e.pointerUp();
}

describe('seleção em área', () => {
  it('a caixa pega células, objetos e tokens dentro dela', () => {
    const { e } = setup();
    box(e, [2, 2], [6, 5]);
    const area = e.getState().area!;
    expect(area.cells).toHaveLength(5 * 4);
    expect(area.objects).toHaveLength(1);
    expect(area.tokens).toHaveLength(1);
  });

  it('enquanto arrasta, a prévia mostra o que seria pego', () => {
    const { e } = setup();
    const s = e.doc.grid.cellSize;
    e.pointerDown({ x: 2 * s + 2, y: 2 * s + 2 });
    e.pointerMove({ x: 5 * s - 2, y: 5 * s - 2 });
    expect(e.overlay.marquee?.tokens).toHaveLength(1);
    e.pointerUp();
    expect(e.overlay.marquee).toBeNull();
  });

  it('Shift soma outra caixa e um clique no vazio limpa', () => {
    const { e, at } = setup();
    box(e, [2, 2], [5, 5]);
    box(e, [11, 11], [13, 13], true);
    expect(e.getState().area!.tokens).toHaveLength(2);
    e.pointerDown(at(18, 1)); e.pointerUp();
    expect(e.getState().area).toBeNull();
  });

  it('apagar respeita o filtro e é um passo só de desfazer', () => {
    const { e } = setup();
    box(e, [2, 2], [6, 5]);
    e.setAreaFilter('terrain', false);
    e.deleteSelection();
    expect(e.doc.objects.all()).toHaveLength(0);
    expect(e.doc.tokens.all()).toHaveLength(1);
    expect(e.doc.terrain.get(3, 3)).toBe(1);
    e.undo();
    expect(e.doc.objects.all()).toHaveLength(1);
    expect(e.doc.tokens.all()).toHaveLength(2);
  });

  it('arrastar dentro da caixa move itens e terreno juntos', () => {
    const { e, at } = setup();
    e.setTool('brush'); e.setTerrain(4); e.setBrushSize(1);
    e.pointerDown(at(3, 3)); e.pointerUp();
    e.setTool('select');
    box(e, [2, 2], [5, 5]);
    e.pointerDown(at(2, 2));
    e.pointerMove(at(7, 2));
    e.pointerUp();
    expect(e.doc.terrain.get(8, 3)).toBe(4);
    expect(e.doc.terrain.get(3, 3)).toBe(EMPTY);
    const tok = e.doc.tokens.all().find((t) => Math.abs(t.y - at(4, 4).y) < 1)!;
    expect(tok.x).toBeCloseTo(at(9, 4).x);
    e.undo();
    expect(e.doc.terrain.get(3, 3)).toBe(4);
  });
});
