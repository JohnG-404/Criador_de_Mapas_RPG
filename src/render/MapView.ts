import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../core/camera/Camera';
import type { MapDocument } from '../core/doc/MapDocument';
import { sameCell, type Cell, type CellRange, type Point } from '../core/grid/GridSystem';
import type { Editor } from '../editor/Editor';
import { TerrainRenderer } from './TerrainRenderer';
import { theme } from './theme';

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
  private gridLayer = new Graphics();
  private hoverLayer = new Graphics();
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

    this.world.addChild(this.mapLayer, this.terrainHolder, this.gridLayer, this.hoverLayer);
    this.app.stage.addChild(this.world);
    this.camera.setViewSize(this.app.screen.width, this.app.screen.height);
    this.bindInput();

    // Mudanças de estado do editor (grid visível, ferramenta, mapa novo).
    this.cleanup.push(this.editor.subscribe(() => this.onEditorState()));
    this.cleanup.push(this.editor.history.onChange(() => this.invalidate()));

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

  zoomIn() { this.zoomBy(ZOOM_STEP); }
  zoomOut() { this.zoomBy(1 / ZOOM_STEP); }

  private async loadDocument() {
    this.terrain?.destroy();
    this.doc = this.editor.doc;
    const renderer = new TerrainRenderer(this.doc);
    this.terrain = renderer;
    await renderer.load();
    if (this.destroyed || this.terrain !== renderer) return;
    renderer.buildAll();
    renderer.onChange = () => this.invalidate();
    this.terrainHolder.addChild(renderer.container);
    this.gridCache = null;
    this.mapCacheZoom = 0;
    this.hoverCell = null;
    this.fitToMap();
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
    this.updateCursor();
    this.invalidate();
  }

  private invalidate() { this.dirty = true; }

  private afterCameraChange() {
    this.camera.clampTo(this.doc.grid.worldBounds());
    this.events.onZoomChange?.(this.camera.zoom);
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
    if (!this.dirty) return;
    this.dirty = false;

    const { zoom, x, y } = this.camera;
    this.world.scale.set(zoom);
    this.world.position.set(-x * zoom, -y * zoom);

    this.drawMap();
    this.drawGrid();
    this.drawHover();
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
    else if (this.spaceDown || !this.editor.toolEdits) canvas.style.cursor = 'grab';
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
      const useTool = e.button === 0 && this.editor.toolEdits && !this.spaceDown;
      canvas.setPointerCapture(e.pointerId);
      if (useTool) {
        this.drag = { kind: 'tool', pointerId: e.pointerId };
        this.editor.pointerDown(this.camera.screenToWorld(p));
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
          this.editor.pointerMove(this.camera.screenToWorld(p));
        }
      }
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
    on(canvas, 'pointerleave', () => { if (!this.drag) this.setHover(null); });
    on(canvas, 'contextmenu', (e) => e.preventDefault());

    on(window, 'keydown', (e) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const pan = 64;
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

function isTypingTarget(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}
