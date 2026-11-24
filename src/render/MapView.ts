import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { getA11y } from '../ui/a11y/settings';
import { Camera } from '../core/camera/Camera';
import type { MapDocument } from '../core/doc/MapDocument';
import { objectAsset } from '../core/doc/objects';
import { sameCell, type Cell, type CellRange, type Point } from '../core/grid/GridSystem';
import type { AreaSelection, Editor, LayerId, LayerState } from '../editor/Editor';
import { ContentRenderer } from './ContentRenderer';
import { FogRenderer } from './FogRenderer';
import { ElevationRenderer } from './ElevationRenderer';
import { TerrainRenderer } from './TerrainRenderer';
import { theme } from './theme';

/** Mestre edita e vê a névoa translúcida; jogador só olha, com a névoa opaca. */
export type ViewMode = 'gm' | 'player';

export interface MapViewEvents {
  onHoverCell?: (cell: Cell | null) => void;
  onZoomChange?: (zoom: number) => void;
  onReady?: () => void;
}

/** Abaixo deste tamanho de célula na tela (px), as linhas finas do grid somem. */
const MIN_CELL_SCREEN_PX = 6;
/** A cada quantas células desenha uma linha mais forte (só no grid quadrado). */
const MAJOR_EVERY = 10;
const ZOOM_STEP = 1.2;
/** Maior lado (px) de uma imagem exportada; texturas maiores falham em muitas GPUs. */
const MAX_EXPORT_SIDE = 8192;

type Drag =
  | { kind: 'pan'; pointerId: number; last: Point }
  | { kind: 'tool'; pointerId: number };

/**
 * Visualização 2D do mapa com PixiJS. Lê o documento e a câmera; as edições
 * passam pelo Editor (que é quem altera o documento).
 */
export class MapView {
  readonly app = new Application();
  readonly camera = new Camera();
  private world = new Container();
  private mapLayer = new Graphics();
  private terrain: TerrainRenderer | null = null;
  private terrainHolder = new Container();
  private elevation: ElevationRenderer | null = null;
  private elevationHolder = new Container();
  private gridLayer = new Graphics();
  private hoverLayer = new Graphics();
  private contentHolder = new Container();
  private content: ContentRenderer | null = null;
  private fog: FogRenderer | null = null;
  private fogHolder = new Container();
  private notesHolder = new Container();
  private rulerLabel = new Text({
    text: '',
    resolution: 3,
    style: { fontFamily: 'system-ui, sans-serif', fontWeight: '700', fontSize: 14, fill: 0x1b1e26 },
  });
  private rulerBg = new Graphics();
  private areaLabel = new Text({
    text: '',
    resolution: 3,
    style: { fontFamily: 'system-ui, sans-serif', fontWeight: '700', fontSize: 13, fill: 0x0b1620 },
  });
  private fittedSize = '';
  private overlayLayer = new Graphics();
  private layers: Record<LayerId, LayerState> | null = null;
  private lastPointer: Point | null = null;
  private altDown = false;
  private hoverCell: Cell | null = null;
  private dirty = true;
  private gridCache: (CellRange & { zoom: number; showGrid: boolean }) | null = null;
  private mapCacheZoom = 0;
  private drag: Drag | null = null;
  private spaceDown = false;
  private destroyed = false;
  private rafId = 0;
  private cleanup: Array<() => void> = [];
  private doc: MapDocument;
  private docVersion: number;
  private showGrid: boolean;

  constructor(
    private editor: Editor,
    private events: MapViewEvents = {},
    readonly mode: ViewMode = 'gm',
  ) {
    this.doc = editor.doc;
    this.docVersion = editor.getState().docVersion;
    this.showGrid = editor.getState().showGrid;
  }

  async mount(host: HTMLElement) {
    await this.app.init({
      // O shader de terreno é GLSL; WebGL roda em todos os navegadores atuais.
      preference: 'webgl',
      background: theme.background,
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    const canvas = this.app.canvas;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Área do mapa');
    canvas.dataset.testid = 'map-canvas';

    this.world.addChild(this.mapLayer, this.terrainHolder, this.elevationHolder, this.gridLayer, this.contentHolder, this.fogHolder, this.notesHolder, this.hoverLayer, this.overlayLayer, this.areaLabel, this.rulerBg, this.rulerLabel);
    this.areaLabel.visible = false;
    this.rulerLabel.anchor.set(0.5);
    this.rulerLabel.visible = false;
    this.notesHolder.visible = this.mode === 'gm';
    this.app.stage.addChild(this.world);
    this.camera.setViewSize(this.app.screen.width, this.app.screen.height);
    this.bindInput();

    // Mudanças de estado do editor (grid visível, ferramenta, mapa novo).
    this.cleanup.push(this.editor.subscribe(() => this.onEditorState()));
    this.cleanup.push(this.editor.history.onChange(() => this.invalidate()));
    this.cleanup.push(this.editor.onOverlay(() => this.invalidate()));

    await this.loadDocument();
    this.app.stop();
    const loop = () => {
      if (this.destroyed) return;
      this.renderIfDirty();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
    this.cleanup.push(() => cancelAnimationFrame(this.rafId));
    canvas.dataset.ready = 'true';
    this.events.onReady?.();
  }

  destroy() {
    this.destroyed = true;
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.terrain?.destroy();
    this.content?.destroy();
    this.fog?.destroy();
    this.elevation?.destroy();
    if ((this.app as unknown as { renderer?: unknown }).renderer) this.app.destroy(true, { children: true });
  }

  fitToMap() {
    this.camera.fit(this.doc.grid.worldBounds());
    this.afterCameraChange();
  }

  zoomBy(factor: number) {
    this.camera.zoomAt({ x: this.camera.viewWidth / 2, y: this.camera.viewHeight / 2 }, factor);
    this.afterCameraChange();
  }

  /** Centraliza a câmera num ponto do mundo, sem mudar o zoom (ex.: token da vez). */
  centerOn(p: { x: number; y: number }) {
    const r = this.camera.visibleWorldRect();
    this.camera.x = p.x - r.width / 2;
    this.camera.y = p.y - r.height / 2;
    this.afterCameraChange();
  }

  /** Área do mundo visível agora (para mandar aos jogadores). */
  visibleRect() { return this.camera.visibleWorldRect(); }

  /** Enquadra uma área (vinda do mestre). */
  showRect(rect: { x: number; y: number; width: number; height: number }) {
    this.camera.fit(rect, 0);
    this.afterCameraChange();
  }

  zoomIn() { this.zoomBy(ZOOM_STEP); }
  zoomOut() { this.zoomBy(1 / ZOOM_STEP); }

  /** Ferramentas só no modo mestre; o jogador só move e aproxima o mapa. */
  private get toolEdits() { return this.mode === 'gm' && this.editor.toolEdits; }

  /**
   * Exporta o mapa inteiro como PNG (sem névoa, prévias e seleção).
   * A escala é reduzida em mapas grandes para caber no limite de textura da GPU.
   */
  async exportPng(opts: { grid: boolean; scale?: number; tokens?: boolean }): Promise<Blob> {
    const b = this.doc.grid.worldBounds();
    const scale = Math.min(opts.scale ?? 2, MAX_EXPORT_SIDE / b.width, MAX_EXPORT_SIDE / b.height);
    const canvas = this.renderRegion(b, scale, { grid: opts.grid, tokens: opts.tokens ?? true });
    return canvasToBlob(canvas, 'image/png');
  }

  /** Imagem só do chão (terreno e grid), no máximo `maxSide` px no lado maior: textura da vista 3D. */
  renderGround(grid: boolean, maxSide = 4096): HTMLCanvasElement {
    const b = this.doc.grid.worldBounds();
    const scale = Math.min(2, maxSide / b.width, maxSide / b.height);
    return this.renderRegion(b, scale, { grid, tokens: false, content: false, relief: false });
  }

  /** Maior escala de exportação possível para o mapa inteiro, sem passar do limite. */
  maxExportScale(wanted: number) {
    const b = this.doc.grid.worldBounds();
    return Math.min(wanted, MAX_EXPORT_SIDE / b.width, MAX_EXPORT_SIDE / b.height);
  }

  /**
   * Desenha um trecho do mundo numa imagem, sem névoa, notas, prévias e
   * seleção. Usado para PNG, PDF e exportação para mesas virtuais.
   */
  renderRegion(frame: { x: number; y: number; width: number; height: number }, scale: number, opts: { grid: boolean; tokens: boolean; content?: boolean; relief?: boolean }): HTMLCanvasElement {
    this.terrain?.update();
    const tokens = this.content?.tokens;
    const saved = {
      scale: this.world.scale.x, x: this.world.position.x, y: this.world.position.y,
      grid: this.gridLayer.visible, fog: this.fogHolder.visible, hover: this.hoverLayer.visible, overlay: this.overlayLayer.visible,
      notes: this.notesHolder.visible, ruler: this.rulerBg.visible, tokens: tokens?.visible ?? true,
      content: this.contentHolder.visible,
      relief: this.elevationHolder.visible,
    };
    this.elevation?.update();
    // A vista 3D tem relevo de verdade: tira o sombreamento desenhado.
    if (opts.relief === false) this.elevationHolder.visible = false;
    // Sem paredes, objetos e tokens: só o chão (usado pela vista 3D).
    if (opts.content === false) this.contentHolder.visible = false;
    this.world.scale.set(1);
    this.elevation?.setZoom(1);
    this.world.position.set(0, 0);
    this.fogHolder.visible = this.hoverLayer.visible = this.overlayLayer.visible = false;
    this.notesHolder.visible = this.rulerBg.visible = this.rulerLabel.visible = false;
    if (tokens) tokens.visible = opts.tokens && saved.tokens;
    // Desenha o grid inteiro (o normal só cobre a área visível).
    this.gridLayer.visible = opts.grid;
    if (opts.grid) this.drawFullGrid(1 / scale);
    try {
      return this.app.renderer.extract.canvas({
        target: this.world,
        frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
        resolution: scale,
        clearColor: '#00000000',
      }) as HTMLCanvasElement;
    } finally {
      this.world.scale.set(saved.scale);
      this.elevation?.setZoom(this.camera.zoom);
      this.world.position.set(saved.x, saved.y);
      this.gridLayer.visible = saved.grid;
      this.fogHolder.visible = saved.fog;
      this.hoverLayer.visible = saved.hover;
      this.overlayLayer.visible = saved.overlay;
      this.notesHolder.visible = saved.notes;
      this.rulerBg.visible = saved.ruler;
      if (tokens) tokens.visible = saved.tokens;
      this.contentHolder.visible = saved.content;
      this.elevationHolder.visible = saved.relief;
      this.gridCache = null;
      this.invalidate();
    }
  }

  private drawFullGrid(lineScale: number) {
    const grid = this.doc.grid;
    const g = this.gridLayer.clear();
    const b = grid.worldBounds();
    const all = { minCol: 0, maxCol: grid.cols - 1, minRow: 0, maxRow: grid.rows - 1 };
    const z = this.camera.zoom;
    // Os métodos de grid usam a espessura relativa ao zoom; simula zoom = 1/lineScale.
    this.camera.zoom = 1 / lineScale;
    try {
      g.rect(b.x, b.y, b.width, b.height).stroke({ color: theme.gridBorder, width: 2 * lineScale, alpha: 1 });
      if (grid.kind === 'square') this.drawSquareGrid(g, all, 40);
      else this.drawHexGrid(g, all, 40);
    } finally {
      this.camera.zoom = z;
    }
  }

  private async loadDocument() {
    this.terrain?.destroy();
    this.content?.destroy();
    this.content = null;
    this.fog?.destroy();
    this.fog = null;
    this.elevation?.destroy();
    this.elevation = null;
    this.doc = this.editor.doc;
    const renderer = new TerrainRenderer(this.doc);
    const content = new ContentRenderer(this.doc, this.mode === 'player');
    this.terrain = renderer;
    await Promise.all([renderer.load(), content.load()]);
    if (this.destroyed || this.terrain !== renderer) {
      content.destroy();
      return;
    }
    renderer.buildAll();
    renderer.onChange = () => this.invalidate();
    this.terrainHolder.addChild(renderer.container);
    const elevation = new ElevationRenderer(this.doc);
    elevation.buildAll();
    elevation.onChange = () => this.invalidate();
    this.elevation = elevation;
    elevation.setZoom(this.camera.zoom);
    this.elevationHolder.addChild(elevation.container);
    this.content = content;
    content.onChange = () => this.invalidate();
    content.start();
    this.contentHolder.addChild(content.objects, content.walls, content.tokens);
    this.notesHolder.addChild(content.links, content.notes);
    const fog = new FogRenderer(this.doc, this.mode);
    fog.buildAll();
    fog.onChange = () => this.invalidate();
    this.fog = fog;
    this.fogHolder.addChild(fog.container);
    this.layers = null;
    this.applyLayers();
    this.gridCache = null;
    this.mapCacheZoom = 0;
    this.hoverCell = null;
    // Só reenquadra quando o mapa muda (a janela do jogador recebe o mapa a cada edição).
    const size = `${this.doc.id}:${this.doc.grid.kind}:${this.doc.grid.cols}x${this.doc.grid.rows}`;
    const focus = this.mode === 'gm' ? this.editor.takeFocus() : null;
    if (focus) this.showRect(focus);
    else if (size !== this.fittedSize || this.mode === 'gm') this.fitToMap();
    else this.afterCameraChange();
    this.fittedSize = size;
  }

  private onEditorState() {
    const s = this.editor.getState();
    if (s.docVersion !== this.docVersion) {
      this.docVersion = s.docVersion;
      void this.loadDocument();
    }
    if (s.showGrid !== this.showGrid) {
      this.showGrid = s.showGrid;
      this.gridCache = null;
    }
    this.applyLayers();
    this.updateCursor();
    this.invalidate();
  }

  private invalidate() { this.dirty = true; }

  private applyLayers() {
    const layers = this.editor.getState().layers;
    if (layers === this.layers) return;
    this.layers = layers;
    if (this.mode === 'player') {
      this.terrainHolder.visible = true;
      this.fogHolder.visible = true;
      return;
    }
    this.fogHolder.visible = layers.fog.visible;
    this.terrainHolder.visible = layers.terrain.visible;
    this.elevationHolder.visible = layers.elevation.visible;
    if (this.content) {
      this.content.walls.visible = layers.walls.visible;
      this.content.objects.visible = layers.objects.visible;
      this.content.tokens.visible = layers.tokens.visible;
      this.content.notes.visible = layers.notes.visible;
      this.content.links.visible = layers.links.visible;
    }
  }

  private afterCameraChange() {
    this.camera.clampTo(this.doc.grid.worldBounds());
    this.events.onZoomChange?.(this.camera.zoom);
    this.elevation?.setZoom(this.camera.zoom);
    this.invalidate();
  }

  private renderIfDirty() {
    const { width, height } = this.app.screen;
    if (width !== this.camera.viewWidth || height !== this.camera.viewHeight) {
      this.camera.setViewSize(width, height);
      this.camera.clampTo(this.doc.grid.worldBounds());
      this.dirty = true;
    }
    if (this.terrain?.update()) this.dirty = true;
    if (this.fog?.update()) this.dirty = true;
    if (this.elevation?.update()) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;

    const { zoom, x, y } = this.camera;
    this.world.scale.set(zoom);
    this.world.position.set(-x * zoom, -y * zoom);

    this.drawMap();
    this.drawGrid();
    if (this.mode === 'gm') {
      this.drawHover();
      this.drawOverlay();
    }
    this.app.render();
  }

  private drawMap() {
    if (this.mapCacheZoom === this.camera.zoom) return;
    this.mapCacheZoom = this.camera.zoom;
    const grid = this.doc.grid;
    const b = grid.worldBounds();
    const g = this.mapLayer.clear();
    const shadow = 6 / this.camera.zoom;
    g.rect(b.x + shadow, b.y + shadow, b.width, b.height).fill({ color: theme.mapShadow, alpha: 0.35 });
    g.rect(b.x, b.y, b.width, b.height).fill(theme.mapFill);
  }

  /**
   * Desenha as linhas visíveis (mais uma margem), com espessura constante na tela.
   * Durante o pan só a transformação muda; a geometria é refeita apenas quando
   * o zoom muda ou a câmera sai da área já desenhada.
   */
  private drawGrid() {
    const grid = this.doc.grid;
    const z = this.camera.zoom;
    const view = this.camera.visibleWorldRect();
    const visible = grid.cellRangeInRect(view);
    const c = this.gridCache;
    if (
      c && c.zoom === z && c.showGrid === this.showGrid &&
      (!visible || (visible.minCol >= c.minCol && visible.maxCol <= c.maxCol && visible.minRow >= c.minRow && visible.maxRow <= c.maxRow))
    ) return;

    const g = this.gridLayer.clear();
    const b = grid.worldBounds();
    g.rect(b.x, b.y, b.width, b.height).stroke({ color: theme.gridBorder, width: 2 / z, alpha: 1 });
    const padded = { x: view.x - view.width / 2, y: view.y - view.height / 2, width: view.width * 2, height: view.height * 2 };
    const range = grid.cellRangeInRect(padded);
    this.gridCache = range
      ? { ...range, zoom: z, showGrid: this.showGrid }
      : { minCol: 0, maxCol: -1, minRow: 0, maxRow: -1, zoom: z, showGrid: this.showGrid };
    if (!this.showGrid || !range) return;
    const cellScreen = grid.cellSize * z;
    if (grid.kind === 'square') this.drawSquareGrid(g, range, cellScreen);
    else if (cellScreen >= MIN_CELL_SCREEN_PX) this.drawHexGrid(g, range, cellScreen);
  }

  private drawSquareGrid(g: Graphics, range: CellRange, cellScreen: number) {
    const grid = this.doc.grid;
    const z = this.camera.zoom;
    const s = grid.cellSize;
    const showMinor = cellScreen >= MIN_CELL_SCREEN_PX;
    const top = range.minRow * s;
    const bottom = (range.maxRow + 1) * s;
    const left = range.minCol * s;
    const right = (range.maxCol + 1) * s;
    const minor: number[][] = [];
    const major: number[][] = [];
    for (let c = range.minCol; c <= range.maxCol + 1; c++) {
      if (c === 0 || c === grid.cols) continue;
      if (c % MAJOR_EVERY === 0) major.push([c * s, top, c * s, bottom]);
      else if (showMinor) minor.push([c * s, top, c * s, bottom]);
    }
    for (let r = range.minRow; r <= range.maxRow + 1; r++) {
      if (r === 0 || r === grid.rows) continue;
      if (r % MAJOR_EVERY === 0) major.push([left, r * s, right, r * s]);
      else if (showMinor) minor.push([left, r * s, right, r * s]);
    }
    const minorAlpha = Math.min(0.4, 0.12 + (cellScreen - MIN_CELL_SCREEN_PX) / 120);
    for (const [x1, y1, x2, y2] of minor) g.moveTo(x1, y1).lineTo(x2, y2);
    if (minor.length) g.stroke({ color: theme.gridLine, width: 1 / z, alpha: minorAlpha });
    for (const [x1, y1, x2, y2] of major) g.moveTo(x1, y1).lineTo(x2, y2);
    if (major.length) g.stroke({ color: theme.gridLine, width: 1.5 / z, alpha: 0.5 });
  }

  /** Cada hexágono desenha 3 arestas (esquerda, superior esquerda, superior direita); as bordas completam o resto. */
  private drawHexGrid(g: Graphics, range: CellRange, cellScreen: number) {
    const grid = this.doc.grid;
    const z = this.camera.zoom;
    for (let row = range.minRow; row <= range.maxRow; row++) {
      for (let col = range.minCol; col <= range.maxCol; col++) {
        const p = grid.cellPolygon({ col, row });
        g.moveTo(p[2].x, p[2].y).lineTo(p[3].x, p[3].y).lineTo(p[4].x, p[4].y).lineTo(p[5].x, p[5].y);
        if (col === grid.cols - 1) g.lineTo(p[0].x, p[0].y);
        if (row === grid.rows - 1) g.moveTo(p[0].x, p[0].y).lineTo(p[1].x, p[1].y).lineTo(p[2].x, p[2].y);
      }
    }
    const alpha = Math.min(0.6, 0.2 + (cellScreen - MIN_CELL_SCREEN_PX) / 80);
    g.stroke({ color: theme.gridLine, width: 1.2 / z, alpha });
  }

  private drawHover() {
    const g = this.hoverLayer.clear();
    if (!this.hoverCell) return;
    const cells = this.editor.previewCells(this.hoverCell);
    if (!cells.length) return;
    const z = this.camera.zoom;
    for (const c of cells) g.poly(this.doc.grid.cellPolygon(c).flatMap((p) => [p.x, p.y]));
    g.fill({ color: theme.hoverFill, alpha: this.editor.getState().tool === 'eraser' ? 0.18 : 0.28 });
    for (const c of cells) g.poly(this.doc.grid.cellPolygon(c).flatMap((p) => [p.x, p.y]));
    g.stroke({ color: theme.hoverFill, width: 1.5 / z, alpha: 0.9 });
  }

  /** Prévias de parede e porta, alvo da borracha e contorno da seleção. */
  private drawOverlay() {
    const g = this.overlayLayer.clear();
    const z = this.camera.zoom;
    const cell = this.doc.grid.cellSize;
    const { wallPreview, doorPreview, eraseTarget, ruler, marquee } = this.editor.overlay;
    this.drawRuler(ruler, z);
    const area = this.editor.getState().tool === 'select' ? this.editor.getState().area : null;
    this.areaLabel.visible = false;
    if (marquee) this.drawArea(g, marquee, z, true);
    else if (area) this.drawArea(g, area, z, false);
    if (wallPreview) {
      for (const [a, b] of wallPreview.segments) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      if (wallPreview.segments.length) {
        g.stroke({ width: cell * 0.3, color: theme.hoverFill, alpha: 0.45, cap: 'round', join: 'round' });
        for (const [a, b] of wallPreview.segments) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
        g.stroke({ width: 1.5 / z, color: theme.hoverFill, alpha: 1 });
      }
      g.circle(wallPreview.snap.x, wallPreview.snap.y, 4 / z).fill(theme.hoverFill).stroke({ width: 1.5 / z, color: 0x000000, alpha: 0.6 });
    }
    if (doorPreview) {
      g.moveTo(doorPreview.a.x, doorPreview.a.y).lineTo(doorPreview.b.x, doorPreview.b.y)
        .stroke({ width: cell * 0.22, color: theme.hoverFill, alpha: 0.55, cap: 'butt' });
    }
    if (eraseTarget) {
      g.moveTo(eraseTarget.a.x, eraseTarget.a.y).lineTo(eraseTarget.b.x, eraseTarget.b.y)
        .stroke({ width: cell * 0.36, color: theme.danger, alpha: 0.6, cap: 'round' });
    }
    const pad = 3 / z;
    const obj = this.editor.selectedObject();
    if (obj && this.layers?.objects.visible) {
      const a = objectAsset(obj.asset);
      if (a) {
        const hw = (a.w * cell * obj.scale) / 2 + pad;
        const hh = (a.h * cell * obj.scale) / 2 + pad;
        const r = (obj.rot * Math.PI) / 180;
        const cos = Math.cos(r), sin = Math.sin(r);
        const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].flatMap(([x, y]) => [obj.x + x * cos - y * sin, obj.y + x * sin + y * cos]);
        g.poly(pts).stroke({ width: 2 / z, color: theme.selection, alpha: 1 });
      }
    }
    const note = this.editor.selectedNote();
    if (note && this.layers?.notes.visible) {
      const h = cell * 0.31 + pad;
      g.rect(note.x - h, note.y - h, h * 2, h * 2).stroke({ width: 2 / z, color: theme.selection, alpha: 1 });
    }
    const tok = this.editor.selectedToken();
    if (tok && this.layers?.tokens.visible) {
      g.circle(tok.x, tok.y, (tok.size * cell) / 2 * 0.9 + pad).stroke({ width: 2 / z, color: theme.selection, alpha: 1 });
    }
  }

  /**
   * Seleção em área: escurece o resto do mapa, pinta as células e contorna
   * cada item pego com a cor do seu tipo, mais uma etiqueta com a contagem.
   */
  private drawArea(g: Graphics, area: AreaSelection, z: number, dragging: boolean) {
    const grid = this.doc.grid;
    const cell = grid.cellSize;
    const { rect } = area;
    const filter = this.editor.getState().areaFilter;
    const cells = this.editor.activeCells(area);
    // 1. Fora da seleção fica mais escuro.
    const b = grid.worldBounds();
    const pad = cell * 4;
    const x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + b.width + pad, y1 = b.y + b.height + pad;
    const rx1 = rect.x + rect.width, ry1 = rect.y + rect.height;
    g.rect(x0, y0, x1 - x0, rect.y - y0).rect(x0, ry1, x1 - x0, y1 - ry1)
      .rect(x0, rect.y, rect.x - x0, rect.height).rect(rx1, rect.y, x1 - rx1, rect.height)
      .fill({ color: 0x000000, alpha: dragging ? 0.3 : 0.5 });
    // 2. Células pegas: preenchimento leve e contorno fino.
    if (cells.length && cells.length <= 8000) {
      for (const c of cells) g.poly(grid.cellPolygon(c).flatMap((p) => [p.x, p.y]));
      g.fill({ color: AREA_COLORS.terrain, alpha: 0.2 });
      if (cells.length <= 3000) {
        for (const c of cells) g.poly(grid.cellPolygon(c).flatMap((p) => [p.x, p.y]));
        g.stroke({ color: AREA_COLORS.terrain, width: 1 / z, alpha: 0.55 });
      }
    } else if (cells.length) {
      g.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: AREA_COLORS.terrain, alpha: 0.2 });
    }
    // 3. Borda da caixa: traço escuro por baixo e tracejado claro por cima.
    g.rect(rect.x, rect.y, rect.width, rect.height).stroke({ width: 4 / z, color: 0x000000, alpha: 0.55 });
    dashedRect(g, rect, 8 / z, 5 / z);
    g.stroke({ width: 2 / z, color: AREA_COLORS.terrain, alpha: 1 });
    // 4. Itens: halo e anel na cor do tipo, com um selo de "pego".
    const ring = (kind: keyof typeof AREA_COLORS, draw: () => void, badge: Point) => {
      draw(); g.stroke({ width: 7 / z, color: kind === 'terrain' ? 0 : AREA_COLORS[kind], alpha: 0.35 });
      draw(); g.stroke({ width: 2.5 / z, color: AREA_COLORS[kind], alpha: 1 });
      const r = 7 / z;
      g.circle(badge.x, badge.y, r).fill(AREA_COLORS[kind]).stroke({ width: 1.5 / z, color: 0x000000, alpha: 0.7 });
      g.moveTo(badge.x - r * 0.45, badge.y + r * 0.02).lineTo(badge.x - r * 0.1, badge.y + r * 0.4).lineTo(badge.x + r * 0.5, badge.y - r * 0.38)
        .stroke({ width: 2 / z, color: 0x0b1620, alpha: 1, cap: 'round', join: 'round' });
    };
    const gap = 4 / z;
    const counts = { objects: 0, tokens: 0, notes: 0, links: 0 };
    if (filter.objects && this.layers?.objects.visible) {
      for (const id of area.objects) {
        const o = this.doc.objects.get(id);
        const a = o && objectAsset(o.asset);
        if (!o || !a) continue;
        counts.objects++;
        const hw = (a.w * cell * o.scale) / 2 + gap, hh = (a.h * cell * o.scale) / 2 + gap;
        const r = (o.rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
        const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: o.x + x * cos - y * sin, y: o.y + x * sin + y * cos }));
        ring('objects', () => g.poly(pts.flatMap((p) => [p.x, p.y])), pts[1]);
      }
    }
    if (filter.tokens && this.layers?.tokens.visible) {
      for (const id of area.tokens) {
        const t = this.doc.tokens.get(id);
        if (!t) continue;
        counts.tokens++;
        const rr = (t.size * cell) / 2 * 0.9 + gap;
        ring('tokens', () => g.circle(t.x, t.y, rr), { x: t.x + rr * 0.72, y: t.y - rr * 0.72 });
      }
    }
    if (filter.notes && this.layers?.notes.visible && this.mode === 'gm') {
      for (const id of area.notes) {
        const n = this.doc.notes.get(id);
        if (!n) continue;
        counts.notes++;
        const h = cell * 0.31 + gap;
        ring('notes', () => g.rect(n.x - h, n.y - h, h * 2, h * 2), { x: n.x + h, y: n.y - h });
      }
    }
    if (filter.links && this.layers?.links.visible) {
      for (const id of area.links) {
        const l = this.doc.links.get(id);
        if (!l) continue;
        counts.links++;
        const rr = cell * 0.45 + gap;
        ring('links', () => g.circle(l.x, l.y, rr), { x: l.x + rr * 0.72, y: l.y - rr * 0.72 });
      }
    }
    // 5. Etiqueta acima do canto superior esquerdo.
    const parts: string[] = [];
    if (cells.length) parts.push(plural(cells.length, 'célula', 'células'));
    if (counts.objects) parts.push(plural(counts.objects, 'objeto', 'objetos'));
    if (counts.tokens) parts.push(plural(counts.tokens, 'token', 'tokens'));
    if (counts.notes) parts.push(plural(counts.notes, 'nota', 'notas'));
    if (counts.links) parts.push(plural(counts.links, 'passagem', 'passagens'));
    const label = this.areaLabel;
    label.text = parts.length ? parts.join(' · ') : 'Nada selecionado';
    label.visible = true;
    label.scale.set(1 / z);
    label.anchor.set(0, 1);
    label.position.set(rect.x + 6 / z, rect.y - 8 / z);
    const lw = label.width + 12 / z, lh = label.height + 6 / z;
    g.roundRect(rect.x, rect.y - 5 / z - lh, lw, lh, 5 / z).fill({ color: AREA_COLORS.terrain }).stroke({ width: 1 / z, color: 0x000000, alpha: 0.6 });
  }

  private drawRuler(ruler: import('../editor/Editor').Ruler | null, z: number) {
    const g = this.rulerBg.clear();
    this.rulerLabel.visible = !!ruler;
    if (!ruler) return;
    const { a, b } = ruler;
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 5 / z, color: 0x000000, alpha: 0.5, cap: 'round' });
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.5 / z, color: theme.hoverFill, alpha: 1, cap: 'round' });
    for (const p of [a, b]) g.circle(p.x, p.y, 5 / z).fill(theme.hoverFill).stroke({ width: 1.5 / z, color: 0x000000, alpha: 0.6 });
    const label = this.rulerLabel;
    label.text = `${ruler.cells} ${ruler.cells === 1 ? 'célula' : 'células'} · ${ruler.meters.toLocaleString('pt-BR')} m`;
    label.scale.set(1 / z);
    // Etiqueta logo acima do ponto final.
    label.position.set(b.x, b.y - 18 / z);
    const w = label.width + 12 / z;
    const h = label.height + 6 / z;
    g.roundRect(label.x - w / 2, label.y - h / 2, w, h, 5 / z).fill({ color: theme.hoverFill }).stroke({ width: 1 / z, color: 0x000000, alpha: 0.5 });
  }

  private setHover(cell: Cell | null) {
    if (sameCell(this.hoverCell, cell)) return;
    this.hoverCell = cell;
    this.events.onHoverCell?.(cell);
    this.invalidate();
  }

  private localPoint(e: PointerEvent | WheelEvent): Point {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private updateCursor() {
    const canvas = this.app.canvas;
    if (!canvas) return;
    if (this.drag?.kind === 'pan') canvas.style.cursor = 'grabbing';
    else if (this.spaceDown || !this.toolEdits) canvas.style.cursor = 'grab';
    else if (this.editor.getState().tool === 'select') canvas.style.cursor = 'default';
    else if (!this.editor.toolLayerEditable) canvas.style.cursor = 'not-allowed';
    else canvas.style.cursor = 'crosshair';
  }

  private bindInput() {
    const canvas = this.app.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };

    on(canvas, 'wheel', (e) => {
      e.preventDefault();
      const intensity = e.ctrlKey ? 0.01 : 0.0015;
      this.camera.zoomAt(this.localPoint(e), Math.exp(-e.deltaY * intensity));
      this.afterCameraChange();
    }, { passive: false });

    on(canvas, 'pointerdown', (e) => {
      canvas.focus();
      if (this.drag) return;
      const p = this.localPoint(e);
      // Botão esquerdo usa a ferramenta; meio/direito, Espaço ou a ferramenta Mover arrastam o mapa.
      const useTool = e.button === 0 && this.toolEdits && !this.spaceDown;
      canvas.setPointerCapture(e.pointerId);
      if (useTool) {
        this.drag = { kind: 'tool', pointerId: e.pointerId };
        this.editor.pointerDown(this.camera.screenToWorld(p), mods(e));
      } else {
        this.drag = { kind: 'pan', pointerId: e.pointerId, last: p };
      }
      this.updateCursor();
    });

    on(canvas, 'pointermove', (e) => {
      const p = this.localPoint(e);
      const d = this.drag;
      if (d && d.pointerId === e.pointerId) {
        if (d.kind === 'pan') {
          this.camera.panBy(p.x - d.last.x, p.y - d.last.y);
          d.last = p;
          this.afterCameraChange();
        } else {
          this.editor.pointerMove(this.camera.screenToWorld(p), mods(e));
        }
      }
      const world = this.camera.screenToWorld(p);
      this.lastPointer = world;
      this.altDown = e.altKey;
      if (!this.drag) this.editor.hover(world, { alt: e.altKey });
      this.setHover(this.doc.grid.worldToCell(this.camera.screenToWorld(p)));
    });

    const endDrag = (e: PointerEvent) => {
      if (this.drag?.pointerId !== e.pointerId) return;
      if (this.drag.kind === 'tool') this.editor.pointerUp();
      this.drag = null;
      this.updateCursor();
    };
    on(canvas, 'pointerup', endDrag);
    on(canvas, 'pointercancel', endDrag);
    on(canvas, 'pointerleave', () => {
      if (this.drag) return;
      this.lastPointer = null;
      this.setHover(null);
      this.editor.hover(null);
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());

    // Alt muda a prévia de parede para "apagar"; Shift muda a parede para sala.
    const modKey = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      e.preventDefault();
      const alt = e.type === 'keydown';
      if (alt === this.altDown) return;
      this.altDown = alt;
      if (!this.drag) this.editor.hover(this.lastPointer, { alt });
    };
    on(window, 'keydown', modKey);
    on(window, 'keyup', modKey);
    on(window, 'blur', () => { this.altDown = false; this.spaceDown = false; this.updateCursor(); });

    on(window, 'keydown', (e) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const pan = 64;
      if (!getA11y().letterShortcuts && ['+', '=', '-', '_', '0'].includes(e.key)) return;
      switch (e.key) {
        case '+': case '=': this.zoomIn(); break;
        case '-': case '_': this.zoomOut(); break;
        case '0': this.fitToMap(); break;
        case 'ArrowLeft': this.camera.panBy(pan, 0); this.afterCameraChange(); break;
        case 'ArrowRight': this.camera.panBy(-pan, 0); this.afterCameraChange(); break;
        case 'ArrowUp': this.camera.panBy(0, pan); this.afterCameraChange(); break;
        case 'ArrowDown': this.camera.panBy(0, -pan); this.afterCameraChange(); break;
        case ' ': this.spaceDown = true; this.updateCursor(); break;
        default: return;
      }
      e.preventDefault();
    });
    on(window, 'keyup', (e) => {
      if (e.key === ' ') { this.spaceDown = false; this.updateCursor(); }
    });
    this.updateCursor();
  }
}

function mods(e: PointerEvent) {
  return { shift: e.shiftKey, alt: e.altKey };
}

function isTypingTarget(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' | 'image/webp', quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem'))), type, quality),
  );
}

/** Cores da seleção em área por tipo (também usadas no painel). */
export const AREA_COLORS = {
  terrain: theme.selection,
  objects: 0xffa24a,
  tokens: 0xff5fa2,
  notes: 0xc59bff,
  links: 0xffe066,
} as const;

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
}

function dashedRect(g: Graphics, r: { x: number; y: number; width: number; height: number }, dash: number, gap: number) {
  const side = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!len) return;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.moveTo(x0 + ux * d, y0 + uy * d).lineTo(x0 + ux * e, y0 + uy * e);
    }
  };
  side(r.x, r.y, r.x + r.width, r.y);
  side(r.x + r.width, r.y, r.x + r.width, r.y + r.height);
  side(r.x + r.width, r.y + r.height, r.x, r.y + r.height);
  side(r.x, r.y + r.height, r.x, r.y);
}
