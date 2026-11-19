import { MapDocument, type NewMapOptions } from '../core/doc/MapDocument';
import { EMPTY, TERRAINS } from '../core/doc/terrain';
import type { Cell, Point } from '../core/grid/GridSystem';
import { History } from '../core/history/History';
import { PaintCommand } from '../core/history/PaintCommand';
import { floodFill } from '../core/tools/floodFill';
import { strokeCells } from '../core/tools/strokeCells';

export type ToolId = 'pan' | 'brush' | 'eraser' | 'bucket';

export const TOOLS: { id: ToolId; name: string; key: string }[] = [
  { id: 'pan', name: 'Mover', key: 'h' },
  { id: 'brush', name: 'Pincel', key: 'b' },
  { id: 'eraser', name: 'Borracha', key: 'e' },
  { id: 'bucket', name: 'Balde', key: 'g' },
];

export const MIN_BRUSH = 1;
export const MAX_BRUSH = 9;

export interface EditorState {
  tool: ToolId;
  terrain: number;
  /** Tamanho do pincel em células (1 = uma célula). */
  brushSize: number;
  showGrid: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Muda a cada mapa novo, para a visualização recriar tudo. */
  docVersion: number;
}

export const DEFAULT_MAP: NewMapOptions = {
  name: 'Mapa sem título',
  gridKind: 'square',
  cols: 60,
  rows: 40,
  fill: 1,
  cellMeters: 1.5,
};

/** Limite do balde, para um clique não travar a tela em mapas enormes. */
const BUCKET_LIMIT = 250_000;

/**
 * Controlador do editor: guarda o documento, o histórico e as escolhas do
 * usuário, e traduz gestos (em coordenadas do mundo) em comandos.
 * Não sabe nada de PixiJS nem de React.
 */
export class Editor {
  doc: MapDocument;
  readonly history = new History();
  private state: EditorState;
  private listeners = new Set<() => void>();
  private stroke: { cmd: PaintCommand; last: Point } | null = null;

  constructor(options: NewMapOptions = DEFAULT_MAP) {
    this.doc = new MapDocument(options);
    this.state = {
      tool: 'brush',
      terrain: TERRAINS[1].id,
      brushSize: 2,
      showGrid: true,
      canUndo: false,
      canRedo: false,
      docVersion: 0,
    };
    this.history.onChange(() => this.set({ canUndo: this.history.canUndo, canRedo: this.history.canRedo }));
  }

  // ---- estado observável (usado pelo React via useSyncExternalStore)
  getState = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  private set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  setTool(tool: ToolId) { this.set({ tool }); }
  setTerrain(terrain: number) {
    this.set({ terrain, tool: this.state.tool === 'brush' || this.state.tool === 'bucket' ? this.state.tool : 'brush' });
  }
  setBrushSize(size: number) {
    this.set({ brushSize: Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, Math.round(size))) });
  }
  setShowGrid(showGrid: boolean) { this.set({ showGrid }); }
  undo() { this.cancelStroke(); this.history.undo(); }
  redo() { this.cancelStroke(); this.history.redo(); }

  newMap(options: NewMapOptions) {
    this.cancelStroke();
    this.doc = new MapDocument(options);
    this.history.clear();
    this.set({ docVersion: this.state.docVersion + 1 });
  }

  /** A ferramenta atual pinta (e portanto usa o botão esquerdo)? */
  get toolEdits() { return this.state.tool !== 'pan'; }

  /** Raio do pincel em células, para a ferramenta atual. */
  get brushRadius() {
    return this.state.tool === 'brush' || this.state.tool === 'eraser' ? this.state.brushSize - 1 : 0;
  }

  /** Células que a ferramenta afetaria se o usuário clicasse aqui (para a prévia). */
  previewCells(cell: Cell): Cell[] {
    if (this.state.tool === 'pan') return [];
    return this.doc.grid.cellsInRadius(cell, this.brushRadius);
  }

  // ---- gestos
  pointerDown(p: Point) {
    const { tool } = this.state;
    const grid = this.doc.grid;
    if (tool === 'bucket') {
      const start = grid.worldToCell(p);
      if (!start) return;
      const value = this.state.terrain;
      if (this.doc.terrain.getCell(start) === value) return;
      const cmd = new PaintCommand(this.doc.terrain, 'Balde');
      for (const c of floodFill(grid, this.doc.terrain, start, BUCKET_LIMIT)) cmd.paint(c.col, c.row, value);
      this.doc.terrain.flush();
      this.history.push(cmd);
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      const cmd = new PaintCommand(this.doc.terrain, tool === 'brush' ? 'Pincel' : 'Borracha');
      this.stroke = { cmd, last: p };
      this.paintSegment(p, p);
    }
  }

  pointerMove(p: Point) {
    if (!this.stroke) return;
    this.paintSegment(this.stroke.last, p);
    this.stroke.last = p;
  }

  pointerUp() {
    if (!this.stroke) return;
    this.history.push(this.stroke.cmd);
    this.stroke = null;
  }

  get isStroking() { return this.stroke !== null; }

  private paintSegment(a: Point, b: Point) {
    if (!this.stroke) return;
    const value = this.state.tool === 'eraser' ? EMPTY : this.state.terrain;
    for (const c of strokeCells(this.doc.grid, a, b, this.brushRadius)) this.stroke.cmd.paint(c.col, c.row, value);
    this.doc.terrain.flush();
  }

  /** Termina um traço em andamento (mantendo o que já foi pintado). */
  private cancelStroke() {
    if (this.stroke) this.pointerUp();
  }
}
