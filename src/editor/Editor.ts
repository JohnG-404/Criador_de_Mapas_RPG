import { ItemsCommand, newId } from '../core/doc/ItemLayer';
import { FOG_CLEAR, FOG_HIDDEN, MapDocument, type NewMapOptions } from '../core/doc/MapDocument';
import { hitObject, hitToken, OBJECT_ASSETS, TOKEN_COLORS, type MapObject, type Token } from '../core/doc/objects';
import { EMPTY, TERRAINS } from '../core/doc/terrain';
import {
  hitSegment, nearestEdge, rectangleSegments, samePoint, snapToVertex, subtractCollinear, type WallSegment,
} from '../core/doc/walls';
import type { Cell, Point } from '../core/grid/GridSystem';
import { CompositeCommand, History } from '../core/history/History';
import { generate, type GeneratorKind } from '../core/procgen';
import { PaintCommand } from '../core/history/PaintCommand';
import { floodFill } from '../core/tools/floodFill';
import { strokeCells } from '../core/tools/strokeCells';

export type ToolId = 'pan' | 'select' | 'brush' | 'eraser' | 'bucket' | 'wall' | 'door' | 'object' | 'token' | 'fog';
export type LayerId = 'terrain' | 'walls' | 'objects' | 'tokens' | 'fog';
export type FogMode = 'reveal' | 'hide';

export const TOOLS: { id: ToolId; name: string; key: string; layer: LayerId | null }[] = [
  { id: 'pan', name: 'Mover mapa', key: 'h', layer: null },
  { id: 'select', name: 'Selecionar', key: 'v', layer: null },
  { id: 'brush', name: 'Pincel', key: 'b', layer: 'terrain' },
  { id: 'eraser', name: 'Borracha', key: 'e', layer: 'terrain' },
  { id: 'bucket', name: 'Balde', key: 'g', layer: 'terrain' },
  { id: 'wall', name: 'Parede', key: 'w', layer: 'walls' },
  { id: 'door', name: 'Porta', key: 'd', layer: 'walls' },
  { id: 'object', name: 'Objeto', key: 'o', layer: 'objects' },
  { id: 'token', name: 'Token', key: 't', layer: 'tokens' },
  { id: 'fog', name: 'Névoa', key: 'n', layer: 'fog' },
];

export const LAYERS: { id: LayerId; name: string }[] = [
  { id: 'fog', name: 'Névoa de guerra' },
  { id: 'tokens', name: 'Tokens' },
  { id: 'objects', name: 'Objetos' },
  { id: 'walls', name: 'Paredes e portas' },
  { id: 'terrain', name: 'Terreno' },
];

export interface LayerState { visible: boolean; locked: boolean }

export type Selection = { layer: 'objects' | 'tokens'; id: string } | null;

/** O que a visualização desenha por cima do mapa durante um gesto. */
export interface Overlay {
  wallPreview: { segments: [Point, Point][]; snap: Point } | null;
  doorPreview: { a: Point; b: Point } | null;
  eraseTarget: WallSegment | null;
}

export const MIN_BRUSH = 1;
export const MAX_BRUSH = 9;

export interface EditorState {
  tool: ToolId;
  terrain: number;
  /** Tamanho do pincel em células (1 = uma célula). */
  brushSize: number;
  showGrid: boolean;
  objectAsset: string;
  tokenColor: string;
  fogMode: FogMode;
  selection: Selection;
  layers: Record<LayerId, LayerState>;
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
  private stroke: { cmd: PaintCommand; last: Point; value: number } | null = null;
  private wallDrag: { start: Point; end: Point; rect: boolean } | null = null;
  private moveDrag: { layer: 'objects' | 'tokens'; id: string; dx: number; dy: number; before: MapObject | Token; moved: boolean } | null = null;
  private hoverPoint: Point | null = null;
  private hoverAlt = false;
  overlay: Overlay = { wallPreview: null, doorPreview: null, eraseTarget: null };
  private overlayListeners = new Set<() => void>();

  constructor(options: NewMapOptions = DEFAULT_MAP) {
    this.doc = new MapDocument(options);
    this.state = {
      tool: 'brush',
      terrain: TERRAINS[1].id,
      brushSize: 2,
      showGrid: true,
      objectAsset: OBJECT_ASSETS[0].key,
      tokenColor: TOKEN_COLORS[0],
      fogMode: 'hide',
      selection: null,
      layers: {
        terrain: { visible: true, locked: false },
        walls: { visible: true, locked: false },
        objects: { visible: true, locked: false },
        tokens: { visible: true, locked: false },
        fog: { visible: true, locked: false },
      },
      canUndo: false,
      canRedo: false,
      docVersion: 0,
    };
    this.history.onChange(() => {
      // Desfazer pode apagar o item selecionado.
      const sel = this.state.selection;
      const gone = sel && !this.doc[sel.layer].get(sel.id);
      this.set({ canUndo: this.history.canUndo, canRedo: this.history.canRedo, ...(gone ? { selection: null } : {}) });
    });
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

  setTool(tool: ToolId) {
    this.endGestures();
    this.set({ tool, selection: tool === 'select' ? this.state.selection : null });
    this.refreshOverlay();
  }
  setObjectAsset(objectAsset: string) { this.set({ objectAsset, tool: 'object' }); }
  setTokenColor(tokenColor: string) {
    this.set({ tokenColor });
    // Só recolore na ferramenta Selecionar; com a ferramenta Token a cor vale para o próximo.
    const sel = this.state.tool === 'select' ? this.state.selection : null;
    if (sel?.layer === 'tokens') {
      const t = this.doc.tokens.get(sel.id);
      if (t) this.commit(this.doc.tokens, 'Cor do token', [[t.id, { ...t, color: tokenColor }]]);
    }
  }
  setLayer(id: LayerId, patch: Partial<LayerState>) {
    const layers = { ...this.state.layers, [id]: { ...this.state.layers[id], ...patch } };
    const sel = this.state.selection;
    const dropSel = sel && sel.layer === id && (!layers[id].visible || layers[id].locked);
    this.set({ layers, ...(dropSel ? { selection: null } : {}) });
  }
  /** A camada da ferramenta atual está visível e destravada? */
  get toolLayerEditable() {
    const layer = TOOLS.find((t) => t.id === this.state.tool)?.layer;
    if (!layer) return true;
    const l = this.state.layers[layer];
    return l.visible && !l.locked;
  }
  onOverlay(fn: () => void) {
    this.overlayListeners.add(fn);
    return () => { this.overlayListeners.delete(fn); };
  }
  setTerrain(terrain: number) {
    this.set({ terrain, tool: this.state.tool === 'brush' || this.state.tool === 'bucket' ? this.state.tool : 'brush' });
  }
  setBrushSize(size: number) {
    this.set({ brushSize: Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, Math.round(size))) });
  }
  setShowGrid(showGrid: boolean) { this.set({ showGrid }); }
  setFogMode(fogMode: FogMode) { this.set({ fogMode, tool: 'fog' }); }

  /** Cobre (ou revela) o mapa inteiro de uma vez, como um passo do histórico. */
  fogAll(hidden: boolean) {
    this.endGestures();
    const { fog } = this.doc;
    const value = hidden ? FOG_HIDDEN : FOG_CLEAR;
    const cmd = new PaintCommand(fog, hidden ? 'Cobrir tudo' : 'Revelar tudo');
    for (let row = 0; row < fog.rows; row++) for (let col = 0; col < fog.cols; col++) cmd.paint(col, row, value);
    fog.flush();
    this.history.push(cmd);
  }
  undo() { this.endGestures(); this.history.undo(); }
  redo() { this.endGestures(); this.history.redo(); }

  newMap(options: NewMapOptions) {
    this.loadDocument(new MapDocument(options));
  }

  /**
   * Substitui o conteúdo do mapa pelo resultado de um gerador (terreno,
   * paredes e objetos; tokens ficam). Um passo só no histórico.
   */
  generate(kind: GeneratorKind, seed: number) {
    this.endGestures();
    const { doc } = this;
    const grid = doc.grid;
    const result = generate(kind, {
      cols: grid.cols,
      rows: grid.rows,
      cellSize: grid.cellSize,
      seed,
      hex: grid.kind === 'hex',
      center: (col, row) => grid.cellToWorld({ col, row }),
    });
    const terrain = new PaintCommand(doc.terrain, 'Terreno gerado');
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) terrain.paint(col, row, result.terrain[row * grid.cols + col]);
    }
    const fog = new PaintCommand(doc.fog, 'Névoa');
    for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) fog.paint(col, row, FOG_CLEAR);
    const walls = new ItemsCommand(doc.walls, 'Paredes geradas');
    for (const w of doc.walls.all()) walls.set(w.id, null);
    for (const w of result.walls) {
      const id = newId(w.kind === 'door' ? 'd' : 'w');
      walls.set(id, { id, ...w });
    }
    const objects = new ItemsCommand(doc.objects, 'Objetos gerados');
    for (const o of doc.objects.all()) objects.set(o.id, null);
    for (const o of result.objects) {
      const id = newId('o');
      objects.set(id, { id, ...o });
    }
    doc.terrain.flush();
    doc.fog.flush();
    doc.walls.emit();
    doc.objects.emit();
    this.set({ selection: null });
    this.history.push(new CompositeCommand('Gerar mapa', [terrain, fog, walls, objects]));
  }

  /** Troca o documento (mapa novo, arquivo aberto, salvamento automático). */
  loadDocument(doc: MapDocument) {
    this.endGestures();
    this.doc = doc;
    this.history.clear();
    this.set({ docVersion: this.state.docVersion + 1, selection: null });
  }

  /** A ferramenta atual usa o botão esquerdo (todas menos Mover mapa)? */
  get toolEdits() { return this.state.tool !== 'pan'; }

  /** Raio do pincel em células, para a ferramenta atual. */
  get brushRadius() {
    const t = this.state.tool;
    return t === 'brush' || t === 'eraser' || t === 'fog' ? this.state.brushSize - 1 : 0;
  }

  /** Células que a ferramenta afetaria se o usuário clicasse aqui (para a prévia). */
  previewCells(cell: Cell): Cell[] {
    const t = this.state.tool;
    if ((t !== 'brush' && t !== 'eraser' && t !== 'bucket' && t !== 'fog') || !this.toolLayerEditable) return [];
    return this.doc.grid.cellsInRadius(cell, this.brushRadius);
  }

  // ---- gestos
  pointerDown(p: Point, mods: { shift?: boolean; alt?: boolean } = {}) {
    const { tool } = this.state;
    const grid = this.doc.grid;
    if (!this.toolLayerEditable) return;
    if (tool === 'select') return this.selectAt(p);
    if (tool === 'wall' || tool === 'door') {
      if (mods.alt) return this.eraseWallAt(p);
      if (tool === 'door') return this.placeDoor(p);
      const start = snapToVertex(grid, p);
      this.wallDrag = { start, end: start, rect: !!mods.shift };
      this.refreshOverlay();
      return;
    }
    if (tool === 'object') return this.placeObject(p, !!mods.shift);
    if (tool === 'token') return this.placeToken(p);
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
    if (tool === 'fog') {
      // Alt inverte o modo durante o traço.
      const hide = (this.state.fogMode === 'hide') !== !!mods.alt;
      const cmd = new PaintCommand(this.doc.fog, hide ? 'Cobrir com névoa' : 'Revelar névoa');
      this.stroke = { cmd, last: p, value: hide ? FOG_HIDDEN : FOG_CLEAR };
      this.paintSegment(p, p);
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      const cmd = new PaintCommand(this.doc.terrain, tool === 'brush' ? 'Pincel' : 'Borracha');
      this.stroke = { cmd, last: p, value: tool === 'eraser' ? EMPTY : this.state.terrain };
      this.paintSegment(p, p);
    }
  }

  pointerMove(p: Point, mods: { shift?: boolean; alt?: boolean } = {}) {
    if (this.wallDrag) {
      this.wallDrag.end = snapToVertex(this.doc.grid, p);
      this.wallDrag.rect = !!mods.shift;
      this.refreshOverlay();
      return;
    }
    if (this.moveDrag) return this.dragSelection(p, !!mods.shift);
    if (!this.stroke) return;
    this.paintSegment(this.stroke.last, p);
    this.stroke.last = p;
  }

  pointerUp() {
    if (this.wallDrag) return this.finishWall();
    if (this.moveDrag) return this.finishMove();
    if (!this.stroke) return;
    this.history.push(this.stroke.cmd);
    this.stroke = null;
  }

  /** Posição do mouse sem botão apertado (para as prévias de parede e porta). */
  hover(p: Point | null, mods: { alt?: boolean } = {}) {
    this.hoverPoint = p;
    this.hoverAlt = !!mods.alt;
    this.refreshOverlay();
  }

  get isStroking() { return this.stroke !== null || this.wallDrag !== null || this.moveDrag !== null; }

  // ---- seleção (objetos e tokens)
  clearSelection() { if (this.state.selection) this.set({ selection: null }); }

  deleteSelection() {
    const sel = this.state.selection;
    if (!sel) return;
    if (sel.layer === 'objects') this.commit(this.doc.objects, 'Apagar objeto', [[sel.id, null]]);
    else this.commit(this.doc.tokens, 'Apagar token', [[sel.id, null]]);
    this.set({ selection: null });
  }

  rotateSelection(deg: number) {
    const o = this.selectedObject();
    if (!o) return;
    this.commit(this.doc.objects, 'Girar objeto', [[o.id, { ...o, rot: (((o.rot + deg) % 360) + 360) % 360 }]]);
  }

  /** Objetos: multiplica a escala. Tokens: muda o tamanho em células. */
  resizeSelection(step: 1 | -1) {
    const sel = this.state.selection;
    if (sel?.layer === 'tokens') {
      const t = this.doc.tokens.get(sel.id);
      if (!t) return;
      const size = Math.min(4, Math.max(0.5, t.size === 0.5 && step > 0 ? 1 : t.size + step * (t.size <= 1 && step < 0 ? 0.5 : 1)));
      this.commit(this.doc.tokens, 'Tamanho do token', [[t.id, { ...t, size }]]);
      return;
    }
    const o = this.selectedObject();
    if (!o) return;
    const scale = Math.min(4, Math.max(0.25, Math.round(o.scale * (step > 0 ? 1.15 : 1 / 1.15) * 100) / 100));
    this.commit(this.doc.objects, 'Escalar objeto', [[o.id, { ...o, scale }]]);
  }

  renameSelectedToken(name: string) {
    const sel = this.state.selection;
    if (sel?.layer !== 'tokens') return;
    const t = this.doc.tokens.get(sel.id);
    if (t && t.name !== name) this.commit(this.doc.tokens, 'Renomear token', [[t.id, { ...t, name }]]);
  }

  selectedObject() {
    const sel = this.state.selection;
    return sel?.layer === 'objects' ? this.doc.objects.get(sel.id) ?? null : null;
  }

  selectedToken() {
    const sel = this.state.selection;
    return sel?.layer === 'tokens' ? this.doc.tokens.get(sel.id) ?? null : null;
  }

  private layerUsable(id: LayerId) {
    const l = this.state.layers[id];
    return l.visible && !l.locked;
  }

  private selectAt(p: Point) {
    const cell = this.doc.grid.cellSize;
    let hit: Selection = null;
    if (this.layerUsable('tokens')) {
      const t = this.doc.tokens.all().reverse().find((t) => hitToken(t, cell, p));
      if (t) hit = { layer: 'tokens', id: t.id };
    }
    if (!hit && this.layerUsable('objects')) {
      const o = this.doc.objects.all().reverse().find((o) => hitObject(o, cell, p));
      if (o) hit = { layer: 'objects', id: o.id };
    }
    this.set({ selection: hit });
    if (!hit) return;
    const item = this.doc[hit.layer].get(hit.id)!;
    this.moveDrag = { layer: hit.layer, id: hit.id, dx: item.x - p.x, dy: item.y - p.y, before: item, moved: false };
  }

  private dragSelection(p: Point, free: boolean) {
    const d = this.moveDrag!;
    const layer = d.layer === 'objects' ? this.doc.objects : this.doc.tokens;
    const item = layer.get(d.id);
    if (!item) return;
    const raw = { x: p.x + d.dx, y: p.y + d.dy };
    const pos = d.layer === 'tokens' && !free ? this.snapCellCenter(raw) : free ? raw : this.snapHalf(raw);
    if (pos.x === item.x && pos.y === item.y) return;
    d.moved = true;
    (layer as typeof this.doc.objects).put(d.id, { ...(item as MapObject), ...pos });
    layer.emit();
  }

  private finishMove() {
    const d = this.moveDrag!;
    this.moveDrag = null;
    if (!d.moved) return;
    const layer = d.layer === 'objects' ? this.doc.objects : this.doc.tokens;
    const after = layer.get(d.id);
    if (!after) return;
    // O item já está na posição final; o comando guarda o "antes" para desfazer.
    (layer as typeof this.doc.objects).put(d.id, d.before as MapObject);
    this.commit(layer as typeof this.doc.objects, d.layer === 'objects' ? 'Mover objeto' : 'Mover token', [[d.id, after as MapObject]]);
  }

  // ---- paredes e portas
  private finishWall() {
    const { start, end, rect } = this.wallDrag!;
    this.wallDrag = null;
    this.refreshOverlay();
    if (samePoint(start, end)) return;
    const segs = rect ? rectangleSegments(start, end) : [[start, end] as [typeof start, typeof end]];
    this.commit(this.doc.walls, rect ? 'Sala' : 'Parede', segs.map(([a, b]) => {
      const id = newId('w');
      return [id, { id, a, b, kind: 'wall' }];
    }));
  }

  private placeDoor(p: Point) {
    const edge = nearestEdge(this.doc.grid, p);
    if (!edge) return;
    const changes: [string, WallSegment | null][] = [];
    let toggledOff = false;
    for (const s of this.doc.walls.all()) {
      const parts = subtractCollinear(s, edge.a, edge.b);
      if (!parts) continue;
      if (s.kind === 'door') {
        // Clicar numa porta existente a transforma de volta em parede.
        toggledOff = true;
        changes.push([s.id, { ...s, kind: 'wall' }]);
        continue;
      }
      changes.push([s.id, null]);
      for (const [a, b] of parts) {
        const id = newId('w');
        changes.push([id, { id, a, b, kind: 'wall' }]);
      }
    }
    if (!toggledOff) {
      const id = newId('d');
      changes.push([id, { id, a: edge.a, b: edge.b, kind: 'door' }]);
    }
    this.commit(this.doc.walls, toggledOff ? 'Remover porta' : 'Porta', changes);
  }

  private eraseWallAt(p: Point) {
    const hit = hitSegment(this.doc.walls.all(), p, this.doc.grid.cellSize * 0.3);
    if (hit) this.commit(this.doc.walls, hit.kind === 'door' ? 'Apagar porta' : 'Apagar parede', [[hit.id, null]]);
    this.refreshOverlay();
  }

  // ---- objetos e tokens
  private placeObject(p: Point, free: boolean) {
    const pos = free ? p : this.snapHalf(p);
    const id = newId('o');
    this.commit(this.doc.objects, 'Objeto', [[id, { id, asset: this.state.objectAsset, ...pos, rot: 0, scale: 1 }]]);
  }

  private placeToken(p: Point) {
    const cell = this.doc.grid.worldToCell(p);
    if (!cell) return;
    const pos = this.doc.grid.cellToWorld(cell);
    const id = newId('t');
    const name = nextTokenName(this.doc.tokens.all().map((t) => t.name));
    this.commit(this.doc.tokens, 'Token', [[id, { id, name, ...pos, size: 1, color: this.state.tokenColor }]]);
    this.set({ selection: { layer: 'tokens', id } });
  }

  private snapHalf(p: Point): Point {
    const grid = this.doc.grid;
    if (grid.kind === 'hex') return this.snapCellCenter(p);
    const h = grid.cellSize / 2;
    return { x: Math.round(p.x / h) * h, y: Math.round(p.y / h) * h };
  }

  private snapCellCenter(p: Point): Point {
    const cell = this.doc.grid.worldToCell(p);
    return cell ? this.doc.grid.cellToWorld(cell) : p;
  }

  private commit<T extends { id: string }>(layer: import('../core/doc/ItemLayer').ItemLayer<T>, label: string, changes: [string, T | null][]) {
    const cmd = new ItemsCommand(layer, label);
    for (const [id, item] of changes) cmd.set(id, item);
    layer.emit();
    this.history.push(cmd);
  }

  private refreshOverlay() {
    const { tool } = this.state;
    const grid = this.doc.grid;
    let wallPreview: Overlay['wallPreview'] = null;
    let doorPreview: Overlay['doorPreview'] = null;
    let eraseTarget: Overlay['eraseTarget'] = null;
    const editable = this.toolLayerEditable;
    if (this.wallDrag) {
      const { start, end, rect } = this.wallDrag;
      wallPreview = { segments: rect ? rectangleSegments(start, end) : [[start, end]], snap: end };
    } else if (this.hoverPoint && editable && (tool === 'wall' || tool === 'door')) {
      if (this.hoverAlt) eraseTarget = hitSegment(this.doc.walls.all(), this.hoverPoint, grid.cellSize * 0.3);
      else if (tool === 'wall') wallPreview = { segments: [], snap: snapToVertex(grid, this.hoverPoint) };
      else doorPreview = nearestEdge(grid, this.hoverPoint);
    }
    this.overlay = { wallPreview, doorPreview, eraseTarget };
    this.overlayListeners.forEach((fn) => fn());
  }

  private endGestures() {
    if (this.stroke || this.wallDrag || this.moveDrag) this.pointerUp();
  }

  private paintSegment(a: Point, b: Point) {
    const s = this.stroke;
    if (!s) return;
    for (const c of strokeCells(this.doc.grid, a, b, this.brushRadius)) s.cmd.paint(c.col, c.row, s.value);
    s.cmd.flush();
  }

}

/** Próximo nome livre: A, B, C... Z, depois A2, B2... */
export function nextTokenName(used: string[]) {
  const set = new Set(used);
  for (let round = 1; ; round++) {
    for (let i = 0; i < 26; i++) {
      const name = String.fromCharCode(65 + i) + (round > 1 ? round : '');
      if (!set.has(name)) return name;
    }
  }
}
