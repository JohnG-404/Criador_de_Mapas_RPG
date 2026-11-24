import { ItemsCommand, newId } from '../core/doc/ItemLayer';
import { FOG_CLEAR, FOG_HIDDEN, MapDocument, type NewMapOptions } from '../core/doc/MapDocument';
import { CUSTOM_ASSET_PREFIX, DEFAULT_VISION, hitLink, hitNote, hitObject, hitToken, OBJECT_ASSETS, TOKEN_COLORS, type MapLink, type MapObject, type Note, type Token } from '../core/doc/objects';
import type { Campaign } from '../core/doc/serialize';
import { visibleCells } from '../core/doc/vision';
import type { ItemLayer } from '../core/doc/ItemLayer';
import { EMPTY, TERRAINS } from '../core/doc/terrain';
import {
  DEFAULT_WALL_STYLE, hitSegment, nearestEdge, rectangleSegments, samePoint, snapToVertex, styleField, subtractCollinear, type WallSegment,
} from '../core/doc/walls';
import type { Cell, Point, Rect } from '../core/grid/GridSystem';
import type { Command } from '../core/history/History';
import { CompositeCommand, History } from '../core/history/History';
import { generate, type GeneratorKind } from '../core/procgen';
import { PaintCommand } from '../core/history/PaintCommand';
import { floodFill } from '../core/tools/floodFill';
import { strokeCells } from '../core/tools/strokeCells';
import { cleanSheet, tokenTemplate, type TokenSheet } from '../core/doc/tokenTemplates';
import { InitiativeCommand, nextTurn, prevTurn, pruneEntries, removeEntry, upsertEntries, EMPTY_INITIATIVE, type Initiative } from '../core/doc/initiative';
import { rollExpression } from '../core/dice/dice';
import { initiativeExpr, initiativeTiebreak } from '../core/sheets/systems';
import { brushAmount, clampLevel, distanceToStroke, ELEV_ZERO, smoothedLevel, type ElevMode } from '../core/doc/elevation';

export type ToolId = 'pan' | 'select' | 'brush' | 'eraser' | 'bucket' | 'elevation' | 'wall' | 'door' | 'object' | 'token' | 'fog' | 'ruler' | 'note' | 'link';
export type LayerId = 'terrain' | 'elevation' | 'walls' | 'objects' | 'tokens' | 'fog' | 'notes' | 'links';
export type FogMode = 'reveal' | 'hide';

export const TOOLS: { id: ToolId; name: string; key: string; layer: LayerId | null }[] = [
  { id: 'pan', name: 'Mover mapa', key: 'h', layer: null },
  { id: 'select', name: 'Selecionar', key: 'v', layer: null },
  { id: 'brush', name: 'Pincel', key: 'b', layer: 'terrain' },
  { id: 'eraser', name: 'Borracha', key: 'e', layer: 'terrain' },
  { id: 'bucket', name: 'Balde', key: 'g', layer: 'terrain' },
  { id: 'elevation', name: 'Relevo', key: 'l', layer: 'elevation' },
  { id: 'wall', name: 'Parede', key: 'w', layer: 'walls' },
  { id: 'door', name: 'Porta', key: 'd', layer: 'walls' },
  { id: 'object', name: 'Objeto', key: 'o', layer: 'objects' },
  { id: 'token', name: 'Token', key: 't', layer: 'tokens' },
  { id: 'fog', name: 'Névoa', key: 'n', layer: 'fog' },
  { id: 'ruler', name: 'Régua', key: 'm', layer: null },
  { id: 'note', name: 'Nota', key: 'a', layer: 'notes' },
  { id: 'link', name: 'Passagem', key: 'p', layer: 'links' },
];

export const LAYERS: { id: LayerId; name: string }[] = [
  { id: 'notes', name: 'Notas do mestre' },
  { id: 'links', name: 'Passagens' },
  { id: 'fog', name: 'Névoa de guerra' },
  { id: 'tokens', name: 'Tokens' },
  { id: 'objects', name: 'Objetos' },
  { id: 'walls', name: 'Paredes e portas' },
  { id: 'elevation', name: 'Relevo' },
  { id: 'terrain', name: 'Terreno' },
];

export interface LayerState { visible: boolean; locked: boolean }

export type SelectableLayer = 'objects' | 'tokens' | 'notes' | 'links';
export type Selection = { layer: SelectableLayer; id: string } | null;

/** O que a seleção em área pode pegar: terreno (células) e cada camada de itens. */
export type AreaKind = 'terrain' | SelectableLayer;
export const AREA_KINDS: AreaKind[] = ['terrain', 'objects', 'tokens', 'notes', 'links'];

/** Resultado de arrastar uma caixa com Selecionar: células e itens dentro dela. */
export interface AreaSelection {
  /** Retângulo arrastado, em coordenadas do mundo. */
  rect: Rect;
  cells: Cell[];
  objects: string[];
  tokens: string[];
  notes: string[];
  links: string[];
}

/** O que a visualização desenha por cima do mapa durante um gesto. */
export interface Overlay {
  wallPreview: { segments: [Point, Point][]; snap: Point } | null;
  doorPreview: { a: Point; b: Point } | null;
  eraseTarget: WallSegment | null;
  ruler: Ruler | null;
  /** Caixa sendo arrastada com Selecionar e o que ela pegaria se soltar agora. */
  marquee: AreaSelection | null;
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
  /** Modelo usado pela ferramenta Token (null = token simples com letra). */
  tokenTemplate: string | null;
  fogMode: FogMode;
  /** Pincel de relevo: subir, baixar, aplainar ou suavizar. */
  elevMode: ElevMode;
  /** Níveis por pincelada no centro do pincel (1 nível = 1/4 de célula). */
  elevStrength: number;
  /** Revela a névoa pela visão dos personagens de jogador a cada movimento. */
  autoReveal: boolean;
  selection: Selection;
  /** Seleção em área (caixa). Convive com `selection` = null. */
  area: AreaSelection | null;
  /** Tipos que a seleção em área considera (desligar um tira o destaque e as ações dele). */
  areaFilter: Record<AreaKind, boolean>;
  layers: Record<LayerId, LayerState>;
  canUndo: boolean;
  canRedo: boolean;
  /** Muda a cada mapa novo, para a visualização recriar tudo. */
  docVersion: number;
  /** Muda quando a lista de mapas da campanha (ou o mapa dos jogadores) muda. */
  campaignVersion: number;
}

/** Tamanho (em células) da área enquadrada ao chegar por uma passagem. */
const ARRIVAL_VIEW_CELLS = 24;

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
  private stroke: { cmd: PaintCommand; last: Point; value: number; elev?: { mode: ElevMode; amounts: Map<number, number>; target: number } } | null = null;
  private wallDrag: { start: Point; end: Point; rect: boolean } | null = null;
  private boxDrag: { a: Point; b: Point; add: boolean } | null = null;
  private groupDrag: {
    start: Point; anchor: { layer: SelectableLayer; id: string } | null; before: { layer: SelectableLayer; item: MapObject | Token | Note | MapLink }[];
    rect: Rect; cells: Cell[]; moveTerrain: boolean; delta: Point; moved: boolean;
  } | null = null;
  private moveDrag: { layer: SelectableLayer; id: string; dx: number; dy: number; before: MapObject | Token | Note | MapLink; moved: boolean } | null = null;
  /** Todos os mapas da campanha (o atual incluso), na ordem da lista. */
  private mapList: MapDocument[];
  /** Mapa que a janela e a sala dos jogadores mostram. */
  private playerMapId: string;
  /** Área a enquadrar quando a visualização carregar o próximo mapa (chegada por passagem). */
  private focus: { x: number; y: number; width: number; height: number } | null = null;
  private rulerDrag: { a: Point; b: Point } | null = null;
  private ruler: Ruler | null = null;
  private hoverPoint: Point | null = null;
  private hoverAlt = false;
  overlay: Overlay = { wallPreview: null, doorPreview: null, eraseTarget: null, ruler: null, marquee: null };
  private overlayListeners = new Set<() => void>();

  constructor(options: NewMapOptions = DEFAULT_MAP) {
    this.doc = new MapDocument(options);
    this.mapList = [this.doc];
    this.playerMapId = this.doc.id;
    this.state = {
      tool: 'brush',
      terrain: TERRAINS[1].id,
      brushSize: 2,
      showGrid: true,
      objectAsset: OBJECT_ASSETS[0].key,
      wallStyle: DEFAULT_WALL_STYLE,
      tokenColor: TOKEN_COLORS[0],
      tokenTemplate: null,
      fogMode: 'hide',
      elevMode: 'raise',
      elevStrength: 4,
      autoReveal: true,
      selection: null,
      area: null,
      areaFilter: { terrain: true, objects: true, tokens: true, notes: true, links: true },
      layers: {
        terrain: { visible: true, locked: false },
        elevation: { visible: true, locked: false },
        walls: { visible: true, locked: false },
        objects: { visible: true, locked: false },
        tokens: { visible: true, locked: false },
        fog: { visible: true, locked: false },
        notes: { visible: true, locked: false },
        links: { visible: true, locked: false },
      },
      canUndo: false,
      canRedo: false,
      docVersion: 0,
      campaignVersion: 0,
    };
    this.history.onChange(() => {
      // Desfazer pode apagar o item selecionado.
      const sel = this.state.selection;
      const gone = sel && !this.doc[sel.layer].get(sel.id);
      this.set({ canUndo: this.history.canUndo, canRedo: this.history.canRedo, ...(gone ? { selection: null } : {}), ...(this.state.area ? { area: this.pruneArea(this.state.area) } : {}) });
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
    this.set({ tool, selection: tool === 'select' ? this.state.selection : null, area: tool === 'select' ? this.state.area : null });
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
  setElevMode(elevMode: ElevMode) { this.set({ elevMode, tool: 'elevation' }); }
  setElevStrength(n: number) { this.set({ elevStrength: Math.max(1, Math.min(12, Math.round(n))) }); }
  /** Volta o mapa inteiro para o nível 0. */
  flattenAll() {
    const e = this.doc.elevation;
    const cmd = new PaintCommand(e, 'Aplainar tudo');
    for (let row = 0; row < e.rows; row++) for (let col = 0; col < e.cols; col++) cmd.paint(col, row, ELEV_ZERO);
    e.flush();
    if (!cmd.isEmpty()) this.history.push(cmd);
  }
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

  /** Troca o documento (mapa novo, arquivo aberto, salvamento automático): vira uma campanha de um mapa só. */
  loadDocument(doc: MapDocument) {
    this.loadCampaign({ maps: [doc], active: doc.id, players: doc.id });
  }

  // ---- campanha: vários mapas ligados por passagens

  /** Troca a campanha inteira (arquivo aberto, nuvem, salvamento automático). */
  loadCampaign(c: Campaign) {
    this.mapList = c.maps.length ? [...c.maps] : [new MapDocument(DEFAULT_MAP)];
    this.playerMapId = this.findMap(c.players)?.id ?? this.mapList[0].id;
    this.focus = null;
    this.showMap(this.findMap(c.active) ?? this.mapList[0]);
    this.set({ campaignVersion: this.state.campaignVersion + 1 });
  }

  /** A campanha como está agora (para salvar). */
  campaign(): Campaign {
    return { maps: [...this.mapList], active: this.doc.id, players: this.playerMapId };
  }

  get maps(): readonly MapDocument[] { return this.mapList; }
  findMap(id: string) { return this.mapList.find((m) => m.id === id); }
  /** O mapa que os jogadores estão vendo (pode ser outro que o aberto no editor). */
  get playerDoc(): MapDocument { return this.findMap(this.playerMapId) ?? this.doc; }

  /** Abre outro mapa da campanha só para o mestre (os jogadores continuam onde estão). */
  switchMap(id: string) {
    const doc = this.findMap(id);
    if (!doc || doc === this.doc) return;
    this.focus = null;
    this.showMap(doc);
  }

  /** Leva os jogadores para um mapa (por padrão, o aberto no editor). */
  showMapToPlayers(id = this.doc.id) {
    if (!this.findMap(id) || id === this.playerMapId) return;
    this.playerMapId = id;
    this.set({ campaignVersion: this.state.campaignVersion + 1 });
  }

  /**
   * Cria um mapa na campanha e o abre. Com `from`, o mapa novo ganha no
   * centro uma passagem de volta para ele.
   */
  addMap(options: NewMapOptions, from?: MapDocument): MapDocument {
    const doc = new MapDocument(options);
    if (from) {
      const center = doc.grid.cellToWorld({ col: Math.floor(options.cols / 2), row: Math.floor(options.rows / 2) });
      const id = newId('p');
      doc.links.put(id, { id, ...center, target: from.id, label: from.options.name });
    }
    this.mapList.push(doc);
    this.set({ campaignVersion: this.state.campaignVersion + 1 });
    this.focus = null;
    this.showMap(doc);
    return doc;
  }

  renameMap(id: string, name: string) {
    const doc = this.findMap(id);
    const clean = name.trim().slice(0, 80);
    if (!doc || !clean || doc.options.name === clean) return;
    doc.options.name = clean;
    this.set({ campaignVersion: this.state.campaignVersion + 1 });
  }

  /** Tira um mapa da campanha. As passagens que levavam a ele ficam sem destino. */
  removeMap(id: string) {
    const doc = this.findMap(id);
    if (!doc || this.mapList.length < 2) return;
    const idx = this.mapList.indexOf(doc);
    this.mapList.splice(idx, 1);
    for (const m of this.mapList) {
      let changed = false;
      for (const l of m.links.all()) {
        if (l.target === id) { m.links.put(l.id, { ...l, target: '' }); changed = true; }
      }
      if (changed) m.links.emit();
    }
    const fallback = this.mapList[Math.max(0, idx - 1)];
    if (this.playerMapId === id) this.playerMapId = this.doc === doc ? fallback.id : this.doc.id;
    this.set({ campaignVersion: this.state.campaignVersion + 1 });
    if (this.doc === doc) { this.focus = null; this.showMap(fallback); }
  }

  /**
   * Atravessa uma passagem: abre o mapa de destino para o mestre e os
   * jogadores, enquadra a passagem de volta (se houver) e, com `carryPcs`,
   * leva junto os personagens de jogador.
   */
  followLink(linkId: string, carryPcs = true): boolean {
    const link = this.doc.links.get(linkId);
    const target = link ? this.findMap(link.target) : undefined;
    if (!link || !target || target === this.doc) return false;
    const from = this.doc;
    const back = target.links.all().find((l) => l.target === from.id);
    const grid = target.grid;
    const arrival = back ? { x: back.x, y: back.y } : grid.cellToWorld({ col: Math.floor(grid.cols / 2), row: Math.floor(grid.rows / 2) });
    if (carryPcs) {
      const pcs = from.tokens.all().filter((t) => t.pc);
      if (pcs.length) {
        for (const t of pcs) from.tokens.put(t.id, null);
        from.tokens.emit();
        // Ao voltar, os personagens que já estavam no destino são substituídos.
        for (const t of pcs) target.tokens.put(t.id, null);
        const spots = freeCellsAround(target, arrival, pcs.length);
        pcs.forEach((t, i) => target.tokens.put(t.id, { ...t, ...(spots[i] ?? arrival) }));
        target.tokens.emit();
      }
    }
    if (back) {
      const side = ARRIVAL_VIEW_CELLS * grid.cellSize;
      this.focus = { x: arrival.x - side / 2, y: arrival.y - side / 3, width: side, height: (side * 2) / 3 };
    } else {
      this.focus = null;
    }
    this.playerMapId = target.id;
    this.set({ campaignVersion: this.state.campaignVersion + 1 });
    this.showMap(target);
    if (carryPcs && this.state.autoReveal) this.revealVisionNow();
    return true;
  }

  /** Área que a visualização deve enquadrar ao abrir o mapa atual (uma vez só). */
  takeFocus() {
    const f = this.focus;
    this.focus = null;
    return f;
  }

  /**
   * Avisa quando o conteúdo a salvar ou a mostrar muda: edições (histórico),
   * troca de mapa e mudanças na lista de mapas.
   */
  onDocChange(fn: () => void) {
    let { docVersion, campaignVersion } = this.state;
    const offHistory = this.history.onChange(fn);
    const offState = this.subscribe(() => {
      const s = this.state;
      if (s.docVersion !== docVersion || s.campaignVersion !== campaignVersion) {
        docVersion = s.docVersion;
        campaignVersion = s.campaignVersion;
        fn();
      }
    });
    return () => { offHistory(); offState(); };
  }

  private showMap(doc: MapDocument) {
    this.endGestures();
    this.ruler = null;
    this.doc = doc;
    this.history.clear();
    this.set({ docVersion: this.state.docVersion + 1, selection: null });
  }

  // ---- passagens
  selectedLink() {
    const sel = this.state.selection;
    return sel?.layer === 'links' ? this.doc.links.get(sel.id) ?? null : null;
  }

  /** Escolhe o destino da passagem selecionada (o nome do mapa vira o rótulo, se ele estiver vazio ou for o nome antigo). */
  setLinkTarget(target: string) {
    const l = this.selectedLink();
    if (!l || l.target === target) return;
    const oldName = this.findMap(l.target)?.options.name ?? '';
    const newName = this.findMap(target)?.options.name ?? '';
    const label = !l.label || l.label === oldName ? newName : l.label;
    this.commit(this.doc.links, 'Destino da passagem', [[l.id, { ...l, target, label }]]);
  }

  setLinkLabel(label: string) {
    const l = this.selectedLink();
    const clean = label.slice(0, 40);
    if (l && l.label !== clean) this.commit(this.doc.links, 'Nome da passagem', [[l.id, { ...l, label: clean }]]);
  }

  /** Cria um mapa novo como destino da passagem selecionada, com a passagem de volta. */
  addMapForLink(options: NewMapOptions) {
    const l = this.selectedLink();
    if (!l) return null;
    const from = this.doc;
    const linkId = l.id;
    const doc = this.addMap(options, from);
    // A passagem fica no mapa de origem; o histórico dele já foi limpo pela troca, então muda direto.
    const cur = from.links.get(linkId);
    if (cur) {
      from.links.put(linkId, { ...cur, target: doc.id, label: cur.label || doc.options.name });
      from.links.emit();
    }
    this.set({ campaignVersion: this.state.campaignVersion + 1 });
    return doc;
  }

  /** A ferramenta atual usa o botão esquerdo (todas menos Mover mapa)? */
  get toolEdits() { return this.state.tool !== 'pan'; }

  /** Raio do pincel em células, para a ferramenta atual. */
  get brushRadius() {
    const t = this.state.tool;
    return t === 'brush' || t === 'eraser' || t === 'fog' || t === 'elevation' ? this.state.brushSize - 1 : 0;
  }

  /** Células que a ferramenta afetaria se o usuário clicasse aqui (para a prévia). */
  previewCells(cell: Cell): Cell[] {
    const t = this.state.tool;
    if ((t !== 'brush' && t !== 'eraser' && t !== 'bucket' && t !== 'fog' && t !== 'elevation') || !this.toolLayerEditable) return [];
    return this.doc.grid.cellsInRadius(cell, this.brushRadius);
  }

  // ---- gestos
  pointerDown(p: Point, mods: { shift?: boolean; alt?: boolean } = {}) {
    const { tool } = this.state;
    const grid = this.doc.grid;
    if (!this.toolLayerEditable) return;
    if (tool === 'select') return this.selectAt(p, !!mods.shift);
    if (tool === 'ruler') {
      const c = this.snapCellCenter(p);
      this.rulerDrag = { a: c, b: c };
      this.ruler = this.measure(c, c);
      this.refreshOverlay();
      return;
    }
    if (tool === 'note') return this.placeNote(p);
    if (tool === 'link') return this.placeLink(p);
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
    if (tool === 'elevation') {
      // Alt inverte subir/baixar durante o traço.
      let mode = this.state.elevMode;
      if (mods.alt && (mode === 'raise' || mode === 'lower')) mode = mode === 'raise' ? 'lower' : 'raise';
      const labels: Record<ElevMode, string> = { raise: 'Subir terreno', lower: 'Baixar terreno', flatten: 'Aplainar', smooth: 'Suavizar' };
      const cell = this.doc.grid.worldToCell(p);
      const target = cell ? this.doc.elevation.getCell(cell) : ELEV_ZERO;
      const cmd = new PaintCommand(this.doc.elevation, labels[mode]);
      this.stroke = { cmd, last: p, value: 0, elev: { mode, amounts: new Map(), target } };
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
    if (this.boxDrag) {
      this.boxDrag.b = p;
      this.refreshOverlay();
      return;
    }
    if (this.groupDrag) return this.dragGroup(p);
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
    if (this.boxDrag) return this.finishBox();
    if (this.groupDrag) return this.finishGroup();
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

  get isStroking() { return this.stroke !== null || this.wallDrag !== null || this.moveDrag !== null || this.boxDrag !== null || this.groupDrag !== null; }

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
  clearSelection() { if (this.state.selection || this.state.area) this.set({ selection: null, area: null }); }

  get hasSelection() { return this.state.selection !== null || this.state.area !== null; }

  deleteSelection() {
    if (this.state.area) return this.deleteArea();
    const sel = this.state.selection;
    if (!sel) return;
    if (sel.layer === 'objects') this.commit(this.doc.objects, 'Apagar objeto', [[sel.id, null]]);
    else if (sel.layer === 'notes') this.commit(this.doc.notes, 'Apagar nota', [[sel.id, null]]);
    else if (sel.layer === 'links') this.commit(this.doc.links, 'Apagar passagem', [[sel.id, null]]);
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

  setTokenTemplate(tokenTemplate: string | null) { this.set({ tokenTemplate, tool: 'token' }); }

  /** Muda a ficha do token selecionado (cria uma ficha vazia se ele não tiver). */
  updateTokenSheet(patch: Partial<TokenSheet>) {
    const sel = this.state.selection;
    if (sel?.layer !== 'tokens') return;
    const t = this.doc.tokens.get(sel.id);
    if (!t) return;
    const base: TokenSheet = t.sheet ?? { hp: 10, hpMax: 10, def: 10, move: 9 };
    const sheet = cleanSheet({ ...base, ...patch });
    if (sheet) this.commit(this.doc.tokens, 'Ficha', [[t.id, { ...t, sheet }]]);
  }

  /** Dano (negativo) ou cura (positivo) no token selecionado, sem passar do máximo. */
  changeHp(delta: number) {
    const t = this.selectedToken();
    if (!t?.sheet) return;
    this.updateTokenSheet({ hp: Math.min(t.sheet.hpMax, t.sheet.hp + delta) });
  }

  removeTokenSheet() {
    const t = this.selectedToken();
    if (!t?.sheet) return;
    const rest: Token = { ...t };
    delete rest.sheet;
    this.commit(this.doc.tokens, 'Ficha', [[t.id, rest]]);
  }

  // ---- iniciativa

  /**
   * Rola a iniciativa dos tokens dados (ou de todos com ficha que ainda não
   * estão na lista, mais os personagens de jogador) e reordena. Devolve as
   * rolagens para o registro de dados.
   */
  rollInitiative(ids?: string[], roller: (expr: string, token: Token) => number = (e) => rollExpression(e).total): { token: Token; total: number }[] {
    const ini = this.doc.initiative.get();
    const inList = new Set(ini.entries.map((e) => e.id));
    const tokens = ids
      ? ids.map((id) => this.doc.tokens.get(id)).filter((t): t is Token => !!t)
      : this.doc.tokens.all().filter((t) => !inList.has(t.id) && (t.sheet || t.pc));
    if (!tokens.length) return [];
    const rolls = tokens.map((token) => ({ token, total: roller(initiativeExpr(token.sheet), token) }));
    const next = upsertEntries(ini, rolls.map(({ token, total }) => ({ id: token.id, value: total, tie: initiativeTiebreak(token.sheet) })));
    this.setInitiative('Rolar iniciativa', next);
    return rolls;
  }

  setInitiativeValue(id: string, value: number) {
    const ini = this.doc.initiative.get();
    const e = ini.entries.find((x) => x.id === id);
    if (!e || !Number.isFinite(value)) return;
    this.setInitiative('Iniciativa', upsertEntries(ini, [{ ...e, value: Math.round(value) }]));
  }

  /** Põe na lista sem rolar (valor manual). */
  addToInitiative(id: string, value = 10) {
    const t = this.doc.tokens.get(id);
    if (!t) return;
    this.setInitiative('Entrar na iniciativa', upsertEntries(this.doc.initiative.get(), [{ id, value, tie: initiativeTiebreak(t.sheet) }]));
  }

  removeFromInitiative(id: string) { this.setInitiative('Sair da iniciativa', removeEntry(this.doc.initiative.get(), id)); }
  nextTurn() { this.setInitiative('Próxima vez', nextTurn(this.doc.initiative.get())); }
  prevTurn() { this.setInitiative('Vez anterior', prevTurn(this.doc.initiative.get())); }
  clearInitiative() { this.setInitiative('Encerrar combate', EMPTY_INITIATIVE); }

  /** Seleciona o token (ferramenta Selecionar), por exemplo ao clicar na lista de iniciativa. */
  selectToken(id: string) {
    if (!this.doc.tokens.get(id)) return;
    this.endGestures();
    this.set({ tool: 'select', selection: { layer: 'tokens', id } });
    this.refreshOverlay();
  }

  private setInitiative(label: string, next: Initiative) {
    const before = this.doc.initiative.get();
    this.history.execute(new InitiativeCommand(label, this.doc.initiative, before, next));
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

  private selectAt(p: Point, add = false) {
    const cell = this.doc.grid.cellSize;
    let hit: Selection = null;
    if (this.layerUsable('tokens')) {
      const t = this.doc.tokens.all().reverse().find((t) => hitToken(t, cell, p));
      if (t) hit = { layer: 'tokens', id: t.id };
    }
    if (!hit && this.layerUsable('links')) {
      const l = this.doc.links.all().reverse().find((l) => hitLink(l, cell, p));
      if (l) hit = { layer: 'links', id: l.id };
    }
    if (!hit && this.layerUsable('notes')) {
      const n = this.doc.notes.all().reverse().find((n) => hitNote(n, cell, p));
      if (n) hit = { layer: 'notes', id: n.id };
    }
    if (!hit && this.layerUsable('objects')) {
      const o = this.doc.objects.all().reverse().find((o) => hitObject(o, cell, p));
      if (o) hit = { layer: 'objects', id: o.id };
    }
    // Pegou um item que está na seleção em área: arrasta o grupo todo.
    const area = this.state.area;
    if (hit && area && this.activeIds(area, hit.layer).includes(hit.id)) return this.startGroupDrag(p, hit, area);
    // Clique dentro da caixa (fora de itens de fora): também arrasta tudo.
    if (area && !hit && insideRect(area.rect, p)) return this.startGroupDrag(p, null, area);
    if (!hit) {
      // Clicar numa porta com Selecionar abre ou fecha.
      if (this.layerUsable('walls')) {
        const door = hitSegment(this.doc.walls.all().filter((w) => w.kind === 'door'), p, cell * 0.35);
        if (door) {
          this.set({ selection: null });
          this.commit(this.doc.walls, door.open ? 'Fechar porta' : 'Abrir porta', [[door.id, { ...door, open: !door.open }]]);
          return;
        }
      }
      // Espaço vazio: começa uma caixa de seleção.
      this.boxDrag = { a: p, b: p, add };
      if (!add) this.set({ selection: null });
      this.refreshOverlay();
      return;
    }
    this.set({ selection: hit, area: null });
    const item = this.layerOf(hit.layer).get(hit.id)!;
    this.moveDrag = { layer: hit.layer, id: hit.id, dx: item.x - p.x, dy: item.y - p.y, before: item, moved: false };
  }

  private dragSelection(p: Point, free: boolean) {
    const d = this.moveDrag!;
    const layer = this.layerOf(d.layer);
    const item = layer.get(d.id);
    if (!item) return;
    const raw = { x: p.x + d.dx, y: p.y + d.dy };
    const pos = d.layer === 'notes' || free ? raw : d.layer === 'tokens' || d.layer === 'links' ? this.snapCellCenter(raw) : this.snapHalf(raw);
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
    const label = { objects: 'Mover objeto', notes: 'Mover nota', links: 'Mover passagem', tokens: 'Mover token' }[d.layer];
    this.commit(layer, label, [[d.id, after]]);
  }

  // ---- seleção em área
  /** Células (pelo centro) e itens (pelo centro) dentro do retângulo, nas camadas visíveis e destravadas. */
  areaInRect(rect: Rect): AreaSelection {
    const grid = this.doc.grid;
    const inside = (p: Point) => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
    const cells: Cell[] = [];
    const range = grid.cellRangeInRect(rect);
    if (range && this.layerUsable('terrain')) {
      for (let row = range.minRow; row <= range.maxRow; row++) {
        for (let col = range.minCol; col <= range.maxCol; col++) {
          if (inside(grid.cellToWorld({ col, row }))) cells.push({ col, row });
        }
      }
    }
    const ids = (l: SelectableLayer) => (this.layerUsable(l) ? this.layerOf(l).all().filter(inside).map((i) => i.id) : []);
    return { rect, cells, objects: ids('objects'), tokens: ids('tokens'), notes: ids('notes'), links: ids('links') };
  }

  /** Ids de uma camada que a seleção em área considera agora (respeita o filtro). */
  activeIds(area: AreaSelection, layer: SelectableLayer): string[] {
    return this.state.areaFilter[layer] ? area[layer] : [];
  }
  activeCells(area: AreaSelection): Cell[] {
    return this.state.areaFilter.terrain ? area.cells : [];
  }

  setAreaFilter(kind: AreaKind, on: boolean) {
    this.set({ areaFilter: { ...this.state.areaFilter, [kind]: on } });
  }

  /** Seleciona o mapa inteiro (Ctrl+A). */
  selectAll() {
    if (this.state.tool !== 'select') this.setTool('select');
    this.set({ selection: null, area: this.areaInRect(this.doc.grid.worldBounds()) });
  }

  private pruneArea(area: AreaSelection): AreaSelection {
    const keep = (l: SelectableLayer) => area[l].filter((id) => !!this.layerOf(l).get(id));
    return { ...area, objects: keep('objects'), tokens: keep('tokens'), notes: keep('notes'), links: keep('links') };
  }

  private finishBox() {
    const { a, b, add } = this.boxDrag!;
    this.boxDrag = null;
    const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
    // Um clique sem arrastar limpa a seleção.
    if (rect.width < this.doc.grid.cellSize * 0.2 && rect.height < this.doc.grid.cellSize * 0.2) {
      if (!add) this.set({ area: null });
      this.refreshOverlay();
      return;
    }
    let area = this.areaInRect(rect);
    const prev = this.state.area;
    if (add && prev) {
      const merge = (x: string[], y: string[]) => [...new Set([...x, ...y])];
      const seen = new Set(prev.cells.map((c) => c.row * this.doc.grid.cols + c.col));
      const x0 = Math.min(prev.rect.x, rect.x), y0 = Math.min(prev.rect.y, rect.y);
      area = {
        rect: { x: x0, y: y0, width: Math.max(prev.rect.x + prev.rect.width, rect.x + rect.width) - x0, height: Math.max(prev.rect.y + prev.rect.height, rect.y + rect.height) - y0 },
        cells: [...prev.cells, ...area.cells.filter((c) => !seen.has(c.row * this.doc.grid.cols + c.col))],
        objects: merge(prev.objects, area.objects), tokens: merge(prev.tokens, area.tokens),
        notes: merge(prev.notes, area.notes), links: merge(prev.links, area.links),
      };
    }
    const empty = !area.cells.length && !area.objects.length && !area.tokens.length && !area.notes.length && !area.links.length;
    this.set({ selection: null, area: empty ? null : area });
    this.refreshOverlay();
  }

  private startGroupDrag(p: Point, anchor: { layer: SelectableLayer; id: string } | null, area: AreaSelection) {
    const before: { layer: SelectableLayer; item: MapObject | Token | Note | MapLink }[] = [];
    for (const l of ['objects', 'tokens', 'notes', 'links'] as SelectableLayer[]) {
      for (const id of this.activeIds(area, l)) {
        const item = this.layerOf(l).get(id);
        if (item) before.push({ layer: l, item });
      }
    }
    const cells = this.activeCells(area);
    // O terreno anda junto em células inteiras (no hex, por ora, só os itens andam).
    const moveTerrain = cells.length > 0 && this.doc.grid.kind === 'square';
    this.groupDrag = { start: p, anchor, before, rect: area.rect, cells: area.cells, moveTerrain, delta: { x: 0, y: 0 }, moved: false };
  }

  private dragGroup(p: Point) {
    const d = this.groupDrag!;
    const size = this.doc.grid.cellSize;
    let dx = p.x - d.start.x, dy = p.y - d.start.y;
    const anchor = d.anchor && d.before.find((b) => b.layer === d.anchor!.layer && b.item.id === d.anchor!.id)?.item;
    if (d.moveTerrain || !anchor) {
      // Com terreno junto, anda de célula em célula para tudo continuar alinhado.
      dx = Math.round(dx / size) * size;
      dy = Math.round(dy / size) * size;
    } else {
      // O item agarrado encaixa como de costume; os outros andam o mesmo tanto.
      const raw = { x: anchor.x + dx, y: anchor.y + dy };
      const snapped = d.anchor!.layer === 'notes' ? raw : d.anchor!.layer === 'objects' ? this.snapHalf(raw) : this.snapCellCenter(raw);
      dx = snapped.x - anchor.x; dy = snapped.y - anchor.y;
    }
    if (dx === d.delta.x && dy === d.delta.y) return;
    d.delta = { x: dx, y: dy };
    const touched = new Set<SelectableLayer>();
    for (const { layer, item } of d.before) {
      this.layerOf(layer).put(item.id, { ...item, x: item.x + dx, y: item.y + dy });
      touched.add(layer);
    }
    touched.forEach((l) => this.layerOf(l).emit());
    d.moved = dx !== 0 || dy !== 0;
    const area = this.state.area;
    if (area) this.set({ area: { ...area, rect: { ...d.rect, x: d.rect.x + dx, y: d.rect.y + dy }, cells: this.shiftCells(d.cells, dx, dy) } });
  }

  private finishGroup() {
    const d = this.groupDrag!;
    this.groupDrag = null;
    if (!d.moved) return;
    const extra: Command[] = [];
    if (d.moveTerrain) {
      const cmd = new PaintCommand(this.doc.terrain, 'Mover seleção');
      const src = this.doc.terrain;
      const values = d.cells.map((c) => src.getCell(c));
      for (const c of d.cells) cmd.paint(c.col, c.row, EMPTY);
      const moved = this.shiftCells(d.cells, d.delta.x, d.delta.y, false);
      moved.forEach((c, i) => { if (c) cmd.paint(c.col, c.row, values[i]); });
      src.flush();
      extra.push(cmd);
    }
    const groups = new Map<SelectableLayer, [string, MapObject | Token | Note | MapLink][]>();
    for (const { layer, item } of d.before) {
      const after = this.layerOf(layer).get(item.id)!;
      this.layerOf(layer).put(item.id, item);
      if (!groups.has(layer)) groups.set(layer, []);
      groups.get(layer)!.push([item.id, after]);
    }
    this.commitGroup('Mover seleção', [...groups].map(([l, changes]) => ({ layer: this.layerOf(l), changes })), extra);
  }

  /** Células deslocadas por (dx, dy) em pixels; as que saem do mapa somem (ou viram null). */
  private shiftCells(cells: Cell[], dx: number, dy: number, drop?: true): Cell[];
  private shiftCells(cells: Cell[], dx: number, dy: number, drop: false): (Cell | null)[];
  private shiftCells(cells: Cell[], dx: number, dy: number, drop = true) {
    const grid = this.doc.grid;
    if (grid.kind !== 'square') return cells;
    const dc = Math.round(dx / grid.cellSize), dr = Math.round(dy / grid.cellSize);
    const out = cells.map((c) => {
      const n = { col: c.col + dc, row: c.row + dr };
      return n.col >= 0 && n.row >= 0 && n.col < grid.cols && n.row < grid.rows ? n : null;
    });
    return drop ? out.filter((c): c is Cell => c !== null) : out;
  }

  /** Apaga tudo o que está ativo na seleção em área, num único passo do histórico. */
  deleteArea() {
    const area = this.state.area;
    if (!area) return;
    const extra: Command[] = [];
    const cells = this.activeCells(area);
    if (cells.length) {
      const cmd = new PaintCommand(this.doc.terrain, 'Apagar seleção');
      for (const c of cells) cmd.paint(c.col, c.row, EMPTY);
      this.doc.terrain.flush();
      extra.push(cmd);
    }
    const groups = (['objects', 'tokens', 'notes', 'links'] as SelectableLayer[]).map((l) => ({
      layer: this.layerOf(l), changes: this.activeIds(area, l).map((id) => [id, null] as [string, null]),
    }));
    this.commitGroup('Apagar seleção', groups, extra);
    this.set({ area: null });
  }

  /** Pinta as células selecionadas com o terreno escolhido. */
  fillArea() {
    const area = this.state.area;
    if (!area) return;
    const cmd = new PaintCommand(this.doc.terrain, 'Preencher seleção');
    for (const c of this.activeCells(area)) cmd.paint(c.col, c.row, this.state.terrain);
    this.doc.terrain.flush();
    this.history.push(cmd);
  }

  /** Cobre ou revela a névoa nas células da área (independe do filtro de terreno). */
  fogArea(hide: boolean) {
    const area = this.state.area;
    if (!area) return;
    const cmd = new PaintCommand(this.doc.fog, hide ? 'Cobrir seleção com névoa' : 'Revelar seleção');
    for (const c of area.cells) cmd.paint(c.col, c.row, hide ? FOG_HIDDEN : FOG_CLEAR);
    this.doc.fog.flush();
    this.history.push(cmd);
  }

  private commitGroup(label: string, groups: { layer: ItemLayer<MapObject | Token | Note | MapLink>; changes: [string, MapObject | Token | Note | MapLink | null][] }[], extra: Command[] = []) {
    const parts: Command[] = [...extra];
    let tokens = false;
    for (const g of groups) {
      if (!g.changes.length) continue;
      const cmd = new ItemsCommand(g.layer, label);
      for (const [id, item] of g.changes) cmd.set(id, item);
      g.layer.emit();
      parts.push(cmd);
      if ((g.layer as unknown) === this.doc.tokens) tokens = true;
    }
    if (tokens) {
      const fog = this.state.autoReveal ? this.visionFogCommand() : null;
      if (fog) parts.push(fog);
      const ini = this.doc.initiative.get();
      const pruned = pruneEntries(ini, (id) => !!this.doc.tokens.get(id));
      if (pruned !== ini) { const c = new InitiativeCommand(label, this.doc.initiative, ini, pruned); c.apply(); parts.push(c); }
    }
    if (!parts.length) return;
    this.history.push(parts.length > 1 ? new CompositeCommand(label, parts) : parts[0]);
  }

  private layerOf(id: SelectableLayer): ItemLayer<MapObject | Token | Note | MapLink> {
    return this.doc[id] as ItemLayer<MapObject | Token | Note | MapLink>;
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

  private placeLink(p: Point) {
    const cell = this.doc.grid.worldToCell(p);
    if (!cell) return;
    const id = newId('p');
    const other = this.mapList.find((m) => m !== this.doc);
    this.commit(this.doc.links, 'Passagem', [[id, {
      id, ...this.doc.grid.cellToWorld(cell), target: other?.id ?? '', label: other?.options.name ?? '',
    }]]);
    this.set({ selection: { layer: 'links', id } });
  }

  private placeToken(p: Point) {
    const cell = this.doc.grid.worldToCell(p);
    if (!cell) return;
    const pos = this.doc.grid.cellToWorld(cell);
    const id = newId('t');
    const used = this.doc.tokens.all().map((t) => t.name);
    const tpl = tokenTemplate(this.state.tokenTemplate ?? undefined);
    const token: Token = tpl
      ? {
        id, ...pos, name: nextTemplateName(tpl.name, used), size: tpl.size, color: tpl.color,
        template: tpl.key, sheet: structuredClone(tpl.sheet),
        ...(tpl.kind === 'pc' ? { pc: true, vision: DEFAULT_VISION } : {}),
      }
      : { id, name: nextTokenName(used), ...pos, size: 1, color: this.state.tokenColor };
    this.commit(this.doc.tokens, tpl ? `Token: ${tpl.name}` : 'Token', [[id, token]]);
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
    // Token apagado sai da iniciativa no mesmo passo do histórico.
    const ini = this.doc.initiative.get();
    const pruned = (layer as unknown) === this.doc.tokens ? pruneEntries(ini, (id) => !!this.doc.tokens.get(id)) : ini;
    const iniCmd = pruned !== ini ? new InitiativeCommand(label, this.doc.initiative, ini, pruned) : null;
    iniCmd?.apply();
    const parts = [cmd, ...(fog ? [fog] : []), ...(iniCmd ? [iniCmd] : [])];
    this.history.push(parts.length > 1 ? new CompositeCommand(label, parts) : cmd);
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
    let marquee: AreaSelection | null = null;
    if (this.boxDrag) {
      const { a, b } = this.boxDrag;
      marquee = this.areaInRect({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
    }
    this.overlay = { wallPreview, doorPreview, eraseTarget, ruler: this.ruler, marquee };
    this.overlayListeners.forEach((fn) => fn());
  }

  private endGestures() {
    if (this.stroke || this.wallDrag || this.moveDrag || this.rulerDrag || this.boxDrag || this.groupDrag) this.pointerUp();
  }

  private paintSegment(a: Point, b: Point) {
    const s = this.stroke;
    if (!s) return;
    if (s.elev) {
      this.paintElevation(s.cmd, s.elev, a, b);
      s.cmd.flush();
      return;
    }
    for (const c of strokeCells(this.doc.grid, a, b, this.brushRadius)) s.cmd.paint(c.col, c.row, s.value);
    s.cmd.flush();
  }


  /**
   * Relevo: cada célula sobe/baixa uma vez por traço, pelo maior valor que o
   * pincel já passou nela (forte no centro, suave na borda).
   */
  private paintElevation(cmd: PaintCommand, e: { mode: ElevMode; amounts: Map<number, number>; target: number }, a: Point, b: Point) {
    const grid = this.doc.grid;
    const layer = this.doc.elevation;
    const radius = this.brushRadius;
    for (const c of strokeCells(grid, a, b, radius)) {
      const idx = c.row * layer.cols + c.col;
      if (e.mode === 'flatten') { cmd.paint(c.col, c.row, e.target); continue; }
      if (e.mode === 'smooth') { cmd.paint(c.col, c.row, smoothedLevel(grid, layer, c) + ELEV_ZERO); continue; }
      const amount = brushAmount(this.state.elevStrength, distanceToStroke(grid, c, a, b), radius);
      if (amount <= (e.amounts.get(idx) ?? 0)) continue;
      e.amounts.set(idx, amount);
      const orig = cmd.before(c.col, c.row) - ELEV_ZERO;
      cmd.paint(c.col, c.row, clampLevel(orig + (e.mode === 'raise' ? amount : -amount)) + ELEV_ZERO);
    }
  }
}

/** "Goblin", depois "Goblin 2", "Goblin 3"... */
export function nextTemplateName(base: string, used: string[]) {
  const set = new Set(used);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) if (!set.has(`${base} ${i}`)) return `${base} ${i}`;
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

/** Células livres (sem token) mais perto de um ponto, para os personagens que chegam por uma passagem. */
function freeCellsAround(doc: MapDocument, p: Point, count: number): Point[] {
  const grid = doc.grid;
  const start = grid.worldToCell(p) ?? { col: Math.floor(grid.cols / 2), row: Math.floor(grid.rows / 2) };
  const taken = new Set(doc.tokens.all().map((t) => {
    const c = grid.worldToCell(t);
    return c ? `${c.col},${c.row}` : '';
  }));
  const out: Point[] = [];
  const seen = new Set<string>();
  for (let r = 0; r <= 6 && out.length < count; r++) {
    const ring = grid.cellsInRadius(start, r)
      .map((c) => ({ c, d: Math.hypot(c.col - start.col, c.row - start.row) }))
      .sort((a, b) => a.d - b.d);
    for (const { c } of ring) {
      const k = `${c.col},${c.row}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // A célula da passagem fica livre para não esconder o marcador.
      if (taken.has(k) || (c.col === start.col && c.row === start.row)) continue;
      out.push(grid.cellToWorld(c));
      if (out.length >= count) break;
    }
  }
  return out;
}

function insideRect(r: Rect, p: Point) {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}
