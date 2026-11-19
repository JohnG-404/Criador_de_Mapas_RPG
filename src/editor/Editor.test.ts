import { describe, expect, it } from 'vitest';
import { EMPTY } from '../core/doc/terrain';
import { TOKEN_COLORS } from '../core/doc/objects';
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

describe('Editor: paredes, portas, objetos e tokens', () => {
  it('arrastar com Parede cria um segmento encaixado; Shift cria uma sala', () => {
    const e = editor();
    e.setTool('wall');
    e.pointerDown({ x: 34, y: 30 });
    e.pointerMove({ x: 160, y: 33 });
    e.pointerUp();
    const [w] = e.doc.walls.all();
    expect(w.a).toEqual({ x: 32, y: 32 });
    expect(w.b).toEqual({ x: 160, y: 32 });
    e.pointerDown({ x: 320, y: 320 }, { shift: true });
    e.pointerMove({ x: 480, y: 416 }, { shift: true });
    e.pointerUp();
    expect(e.doc.walls.size).toBe(5);
    e.undo();
    expect(e.doc.walls.size).toBe(1);
  });

  it('porta corta a parede e clicar de novo volta a ser parede', () => {
    const e = editor();
    e.setTool('wall');
    e.pointerDown({ x: 0, y: 64 });
    e.pointerMove({ x: 192, y: 64 });
    e.pointerUp();
    e.setTool('door');
    e.pointerDown({ x: 80, y: 66 }); // aresta (64,64)-(96,64)
    const kinds = e.doc.walls.all().map((w) => w.kind).sort();
    expect(kinds).toEqual(['door', 'wall', 'wall']);
    e.pointerDown({ x: 80, y: 66 });
    expect(e.doc.walls.all().filter((w) => w.kind === 'door')).toHaveLength(0);
    e.undo(); e.undo();
    expect(e.doc.walls.size).toBe(1);
  });

  it('Alt+clique apaga a parede', () => {
    const e = editor();
    e.setTool('wall');
    e.pointerDown({ x: 0, y: 64 });
    e.pointerMove({ x: 96, y: 64 });
    e.pointerUp();
    e.pointerDown({ x: 50, y: 70 }, { alt: true });
    expect(e.doc.walls.size).toBe(0);
  });

  it('coloca, seleciona, move, gira, escala e apaga objetos', () => {
    const e = editor();
    e.setObjectAsset('barril');
    e.pointerDown({ x: 100, y: 100 });
    const [o] = e.doc.objects.all();
    expect(o).toMatchObject({ asset: 'barril', x: 96, y: 96 });
    e.setTool('select');
    e.pointerDown({ x: 98, y: 98 });
    expect(e.getState().selection).toEqual({ layer: 'objects', id: o.id });
    e.pointerMove({ x: 200, y: 160 });
    e.pointerUp();
    expect(e.doc.objects.get(o.id)).toMatchObject({ x: 192, y: 160 });
    e.rotateSelection(45);
    e.resizeSelection(1);
    expect(e.doc.objects.get(o.id)!.rot).toBe(45);
    expect(e.doc.objects.get(o.id)!.scale).toBeGreaterThan(1);
    e.undo(); e.undo(); e.undo();
    expect(e.doc.objects.get(o.id)).toMatchObject({ x: 96, y: 96, rot: 0, scale: 1 });
    e.deleteSelection();
    expect(e.doc.objects.size).toBe(0);
  });

  it('tokens recebem nomes A, B... e ficam no centro da célula', () => {
    const e = editor();
    e.setTool('token');
    e.pointerDown({ x: 40, y: 40 });
    e.pointerDown({ x: 100, y: 40 });
    const names = e.doc.tokens.all().map((t) => t.name);
    expect(names).toEqual(['A', 'B']);
    expect(e.doc.tokens.all()[0]).toMatchObject({ x: 48, y: 48 });
  });

  it('camada travada não aceita edição e a seleção ignora camada oculta', () => {
    const e = editor();
    e.setLayer('walls', { locked: true });
    e.setTool('wall');
    e.pointerDown({ x: 0, y: 0 });
    e.pointerMove({ x: 96, y: 0 });
    e.pointerUp();
    expect(e.doc.walls.size).toBe(0);
    e.setTool('token');
    e.pointerDown({ x: 40, y: 40 });
    e.setLayer('tokens', { visible: false });
    e.setTool('select');
    e.pointerDown({ x: 48, y: 48 });
    expect(e.getState().selection).toBeNull();
  });

  it('desfazer a criação de um item selecionado limpa a seleção', () => {
    const e = editor();
    e.setTool('token');
    e.pointerDown({ x: 40, y: 40 });
    expect(e.getState().selection).not.toBeNull();
    e.undo();
    expect(e.getState().selection).toBeNull();
  });
});

describe('cor do token', () => {
  it('com a ferramenta Token a cor vale para o próximo; em Selecionar recolore o selecionado', () => {
    const ed = new Editor();
    ed.setTool('token');
    ed.setTokenColor(TOKEN_COLORS[1]);
    ed.pointerDown({ x: 48, y: 48 }); ed.pointerUp();
    ed.setTokenColor(TOKEN_COLORS[2]);
    const first = ed.doc.tokens.all()[0];
    expect(first.color).toBe(TOKEN_COLORS[1]);
    ed.setTool('select');
    ed.pointerDown({ x: 48, y: 48 }); ed.pointerUp();
    ed.setTokenColor(TOKEN_COLORS[3]);
    expect(ed.doc.tokens.get(first.id)!.color).toBe(TOKEN_COLORS[3]);
  });
});

describe('névoa de guerra', () => {
  it('cobre e revela com o pincel; Alt inverte; cada traço é um passo', () => {
    const ed = new Editor();
    ed.setFogMode('hide');
    ed.setBrushSize(1);
    ed.pointerDown({ x: 16, y: 16 }); ed.pointerMove({ x: 80, y: 16 }); ed.pointerUp();
    expect([0, 1, 2].map((c) => ed.doc.fog.get(c, 0))).toEqual([1, 1, 1]);
    ed.pointerDown({ x: 48, y: 16 }, { alt: true }); ed.pointerUp();
    expect(ed.doc.fog.get(1, 0)).toBe(0);
    ed.undo();
    expect(ed.doc.fog.get(1, 0)).toBe(1);
    ed.undo();
    expect(ed.doc.fog.get(0, 0)).toBe(0);
  });

  it('cobrir tudo e revelar tudo', () => {
    const ed = new Editor({ name: 'x', gridKind: 'square', cols: 10, rows: 8, fill: 1, cellMeters: 1.5 });
    ed.fogAll(true);
    expect(ed.doc.fog.toArray().every((v) => v === 1)).toBe(true);
    ed.setFogMode('reveal');
    ed.setBrushSize(1);
    ed.pointerDown({ x: 16, y: 16 }); ed.pointerUp();
    expect(ed.doc.fog.get(0, 0)).toBe(0);
    ed.fogAll(false);
    expect(ed.doc.fog.toArray().every((v) => v === 0)).toBe(true);
  });

  it('camada de névoa travada não aceita pintura', () => {
    const ed = new Editor();
    ed.setLayer('fog', { locked: true });
    ed.setFogMode('hide');
    ed.pointerDown({ x: 16, y: 16 }); ed.pointerUp();
    expect(ed.doc.fog.get(0, 0)).toBe(0);
  });
});

describe('gerar mapa', () => {
  it('substitui terreno, paredes e objetos num passo só e mantém os tokens', () => {
    const ed = new Editor();
    ed.setTool('token');
    ed.pointerDown({ x: 48, y: 48 }); ed.pointerUp();
    ed.generate('dungeon', 5);
    expect(ed.doc.walls.size).toBeGreaterThan(0);
    expect(ed.doc.objects.size).toBeGreaterThan(0);
    expect(ed.doc.tokens.size).toBe(1);
    ed.undo();
    expect(ed.doc.walls.size).toBe(0);
    expect(ed.doc.objects.size).toBe(0);
    expect(ed.doc.terrain.get(0, 0)).toBe(1);
    ed.redo();
    expect(ed.doc.walls.size).toBeGreaterThan(0);
  });
});
