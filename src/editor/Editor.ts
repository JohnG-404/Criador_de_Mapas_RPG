import { ItemsCommand, newId } from '../core/doc/ItemLayer';
import { FOG_CLEAR, FOG_HIDDEN, MapDocument, type NewMapOptions } from '../core/doc/MapDocument';
import { CUSTOM_ASSET_PREFIX, DEFAULT_VISION, hitNote, hitObject, hitToken, OBJECT_ASSETS, TOKEN_COLORS, type MapObject, type Note, type Token } from '../core/doc/objects';
import { visibleCells } from '../core/doc/vision';
import type { ItemLayer } from '../core/doc/ItemLayer';
import { EMPTY, TERRAINS } from '../core/doc/terrain';
import {
  DEFAULT_WALL_STYLE, hitSegment, nearestEdge, rectangleSegments, samePoint, snapToVertex, styleField, subtractCollinear, type WallSegment,
} from '../core/doc/walls';
import type { Cell, Point } from '../core/grid/GridSystem';
import { CompositeCommand, History } from '../core/history/History';
import { generate, type GeneratorKind } from '../core/procgen';
import { PaintCommand } from '../core/history/PaintCommand';
import { floodFill } from '../core/tools/floodFill';
import { strokeCells } from '../core/tools/strokeCells';

export type ToolId = 'pan' | 'select' | 'brush' | 'eraser' | 'bucket' | 'wall' | 'door' | 'object' | 'token' | 'fog' | 'ruler' | 'note';
export type LayerId = 'terrain' | 'walls' | 'objects' | 'tokens' | 'fog' | 'notes';
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
  { id: 'ruler', name: 'Régua', key: 'm', layer: null },
  { id: 'note', name: 'Nota', key: 'a', layer: 'notes' },
];

export const LAYERS: { id: LayerId; name: string }[] = [
  { id: 'notes', name: 'Notas do mestre' },
  { id: 'fog', name: 'Névoa de guerra' },
  { id: 'tokens', name: 'Tokens' },
  { id: 'objects', name: 'Objetos' },
  { id: 'walls', name: 'Paredes e portas' },
  { id: 'terrain', name: 'Terreno' },
];

export interface LayerState { visible: boolean; locked: boolean }

export type SelectableLayer = 'objects' | 'tokens' | 'notes';
export type Selection = { layer: SelectableLayer; id: string } | null;

/** O que a visualização desenha por cima do mapa durante um gesto. */
export interface Overlay {
  wallPreview: { segments: [Point, Point][]; snap: Point } | null;
  doorPreview: { a: Point; b: Point } | null;
  eraseTarget: WallSegment | null;
  ruler: Ruler | null;
}

/** Medida da régua: de centro de célula a centro de célula. */
export interface Ruler { a: Point; b: Point; cells: number; meters: number }

export const MIN_BRUSH = 1;
export const MAX_BRUSH = 9;

export interface EditorState {
  tool: ToolId;
  terrain: number;
  /** Tamanho do pincel em células (1 = uma célula). */
  brushSize: number;
  showGrid: boolean;
  objectAsset: string;
  /** Tema das próximas paredes desenhadas. */
  wallStyle: string;
  tokenColor: string;
  fogMode: FogMode;
  /** Revela a névoa pela visão dos personagens de jogador a cada movimento. */
  autoReveal: boolean;
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
  private moveDrag: { layer: SelectableLayer; id: string; dx: number; dy: number; before: MapObject | Token | Note; moved: boolean } | null = null;
  private rulerDrag: { a: Point; b: Point } | null = null;
  private ruler: Ruler | null = null;
  private hoverPoint: Point | null = null;
  private hoverAlt = false;
  overlay: Overlay = { wallPreview: null, doorPreview: null, eraseTarget: null, ruler: null };
  private overlayListeners = new Set<() => void>();

  constructor(options: NewMapOptions = DEFAULT_MAP) {
    this.doc = new MapDocument(options);
    this.state = {
      tool: 'brush',
      terrain: TERRAINS[1].id,
      brushSize: 2,
      showGrid: true,
      objectAsset: OBJECT_ASSETS[0].key,
      wallStyle: DEFAULT_WALL_STYLE,
      tokenColor: TOKEN_COLORS[0],
      fogMode: 'hide',
      autoReveal: true,
      selection: null,
      layers: {
        terrain: { visible: true, locked: false },
        walls: { visible: true, locked: false },
        objects: { visible: true, locked: false },
        tokens: { visible: true, locked: false },
        fog: { visible: true, locked: false },
        notes: { visible: true, locked: false },
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
    this.ruler = null;
    this.set({ tool, selection: tool === 'select' ? this.state.selection : null });
    this.refreshOverlay();
  }
  setObjectAsset(objectAsset: string) { this.set({ objectAsset, tool: 'object' }); }

  /** Adiciona uma imagem do usuário à paleta de objetos deste mapa e a escolhe. */
  importAsset(asset: { name: string; data: string; w: number; h: number }) {
    const key = newId(CUSTOM_ASSET_PREFIX);
    this.doc.assets.put(key, { id: key, key, ...asset });
    this.doc.assets.emit();
    this.setObjectAsset(key);
    return key;
  }
  setWallStyle(wallStyle: string) { this.set({ wallStyle, tool: 'wall' }); }
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
  setAutoReveal(autoReveal: boolean) {
    this.set({ autoReveal });
    if (autoReveal) this.revealVisionNow();
  }

  /** Revela agora o que os personagens de jogador enxergam (um passo do histórico). */
  revealVisionNow() {
    const cmd = this.visionFogCommand();
    if (cmd) this.history.push(cmd);
  }

  /** Comando que revela a névoa nas células vistas pelos personagens de jogador (null se nada muda). */
  private visionFogCommand(): PaintCommand | null {
    const { doc } = this;
    const pcs = doc.tokens.all().filter((t) => t.pc);
    if (!pcs.length) return null;
    const walls = doc.walls.all();
    const cmd = new PaintCommand(doc.fog, 'Visão');
    for (const t of pcs) {
      for (const c of visibleCells(doc.grid, t, t.vision ?? DEFAULT_VISION, walls)) cmd.paint(c.col, c.row, FOG_CLEAR);
    }
    if (cmd.isEmpty()) return null;
    doc.fog.flush();
    return cmd;
  }

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
    this.ruler = null;
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
    if (tool === 'ruler') {
      const c = this.snapCellCenter(p);
      this.rulerDrag = { a: c, b: c };
      this.ruler = this.measure(c, c);
      this.refreshOverlay();
      return;
    }
    if (tool === 'note') return this.placeNote(p);
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
    if (this.rulerDrag) {
      this.rulerDrag.b = this.snapCellCenter(p);
      this.ruler = this.measure(this.rulerDrag.a, this.rulerDrag.b);
      this.refreshOverlay();
      return;
    }
    if (!this.stroke) return;
    this.paintSegment(this.stroke.last, p);
    this.stroke.last = p;
  }

  pointerUp() {
    if (this.wallDrag) return this.finishWall();
    if (this.moveDrag) return this.finishMove();
    if (this.rulerDrag) { this.rulerDrag = null; return; }
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

  /** Distância em células (diagonal conta 1 no grid quadrado, como na maioria dos sistemas) e em metros. */
  private measure(a: Point, b: Point): Ruler {
    const grid = this.doc.grid;
    const ca = grid.worldToCell(a), cb = grid.worldToCell(b);
    let cells = 0;
    if (ca && cb) {
      cells = grid.kind === 'square'
        ? Math.max(Math.abs(ca.col - cb.col), Math.abs(ca.row - cb.row))
        : Math.round(grid.distance(ca, cb));
    }
    return { a, b, cells, meters: Math.round(cells * this.doc.options.cellMeters * 10) / 10 };
  }

  clearRuler() {
    if (!this.ruler) return;
    this.ruler = null;
    this.refreshOverlay();
  }

  // ---- seleção (objetos e tokens)
  clearSelection() { if (this.state.selection) this.set({ selection: null }); }

  deleteSelection() {
    const sel = this.state.selection;
    if (!sel) return;
    if (sel.layer === 'objects') this.commit(this.doc.objects, 'Apagar objeto', [[sel.id, null]]);
    else if (sel.layer === 'notes') this.commit(this.doc.notes, 'Apagar nota', [[sel.id, null]]);
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

  selectedNote() {
    const sel = this.state.selection;
    return sel?.layer === 'notes' ? this.doc.notes.get(sel.id) ?? null : null;
  }

  setNoteText(text: string) {
    const n = this.selectedNote();
    if (n && n.text !== text) this.commit(this.doc.notes, 'Editar nota', [[n.id, { ...n, text }]]);
  }

  /** Marca o token selecionado como personagem de jogador (a visão dele revela a névoa). */
  setTokenPc(pc: boolean) {
    const t = this.selectedToken();
    if (!t || !!t.pc === pc) return;
    const next: Token = { ...t, pc };
    if (pc) next.vision = t.vision ?? DEFAULT_VISION;
    else delete next.vision;
    this.commit(this.doc.tokens, pc ? 'Personagem de jogador' : 'Token comum', [[t.id, next]]);
  }

  setTokenVision(cells: number) {
    const t = this.selectedToken();
    const vision = Math.min(60, Math.max(1, Math.round(cells)));
    if (t?.pc && t.vision !== vision) this.commit(this.doc.tokens, 'Alcance da visão', [[t.id, { ...t, vision }]]);
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
    if (!hit && this.layerUsable('notes')) {
      const n = this.doc.notes.all().reverse().find((n) => hitNote(n, cell, p));
      if (n) hit = { layer: 'notes', id: n.id };
    }
    if (!hit && this.layerUsable('objects')) {
      const o = this.doc.objects.all().reverse().find((o) => hitObject(o, cell, p));
      if (o) hit = { layer: 'objects', id: o.id };
    }
    this.set({ selection: hit });
    if (!hit) {
      // Clicar numa porta com Selecionar abre ou fecha.
      if (this.layerUsable('walls')) {
        const door = hitSegment(this.doc.walls.all().filter((w) => w.kind === 'door'), p, cell * 0.35);
        if (door) this.commit(this.doc.walls, door.open ? 'Fechar porta' : 'Abrir porta', [[door.id, { ...door, open: !door.open }]]);
      }
      return;
    }
    const item = this.layerOf(hit.layer).get(hit.id)!;
    this.moveDrag = { layer: hit.layer, id: hit.id, dx: item.x - p.x, dy: item.y - p.y, before: item, moved: false };
  }

  private dragSelection(p: Point, free: boolean) {
    const d = this.moveDrag!;
    const layer = this.layerOf(d.layer);
    const item = layer.get(d.id);
    if (!item) return;
    const raw = { x: p.x + d.dx, y: p.y + d.dy };
    const pos = d.layer === 'notes' || free ? raw : d.layer === 'tokens' ? this.snapCellCenter(raw) : this.snapHalf(raw);
    if (pos.x === item.x && pos.y === item.y) return;
    d.moved = true;
    layer.put(d.id, { ...item, ...pos });
    layer.emit();
  }

  private finishMove() {
    const d = this.moveDrag!;
    this.moveDrag = null;
    if (!d.moved) return;
    const layer = this.layerOf(d.layer);
    const after = layer.get(d.id);
    if (!after) return;
    // O item já está na posição final; o comando guarda o "antes" para desfazer.
    layer.put(d.id, d.before);
    const label = d.layer === 'objects' ? 'Mover objeto' : d.layer === 'notes' ? 'Mover nota' : 'Mover token';
    this.commit(layer, label, [[d.id, after]]);
  }

  private layerOf(id: SelectableLayer): ItemLayer<MapObject | Token | Note> {
    return this.doc[id] as ItemLayer<MapObject | Token | Note>;
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
      return [id, { id, a, b, kind: 'wall', ...styleField(this.state.wallStyle) }];
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
        changes.push([s.id, { ...s, kind: 'wall', ...styleField(this.state.wallStyle) }]);
        continue;
      }
      changes.push([s.id, null]);
      for (const [a, b] of parts) {
        const id = newId('w');
        changes.push([id, { id, a, b, kind: 'wall', ...styleField(s.style) }]);
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

  private placeNote(p: Point) {
    const id = newId('n');
    this.commit(this.doc.notes, 'Nota', [[id, { id, x: p.x, y: p.y, text: '' }]]);
    this.set({ selection: { layer: 'notes', id } });
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

  private commit<T extends { id: string }>(layer: ItemLayer<T>, label: string, changes: [string, T | null][]) {
    const cmd = new ItemsCommand(layer, label);
    for (const [id, item] of changes) cmd.set(id, item);
    layer.emit();
    // Mexer em tokens ou paredes (ex.: abrir uma porta) pode revelar mais da névoa.
    const affectsSight = (layer as unknown) === this.doc.tokens || (layer as unknown) === this.doc.walls;
    const fog = affectsSight && this.state.autoReveal && !cmd.isEmpty() ? this.visionFogCommand() : null;
    this.history.push(fog ? new CompositeCommand(label, [cmd, fog]) : cmd);
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
    this.overlay = { wallPreview, doorPreview, eraseTarget, ruler: this.ruler };
    this.overlayListeners.forEach((fn) => fn());
  }

  private endGestures() {
    if (this.stroke || this.wallDrag || this.moveDrag || this.rulerDrag) this.pointerUp();
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
