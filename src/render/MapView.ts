import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from '../core/camera/Camera';
import type { Cell, GridSystem, Point } from '../core/grid/GridSystem';
import { theme } from './theme';

export interface MapViewEvents {
  onHoverCell?: (cell: Cell | null) => void;
  onZoomChange?: (zoom: number) => void;
}

export interface MapViewOptions {
  showGrid: boolean;
}

/** Abaixo deste tamanho de célula na tela (px), as linhas finas do grid somem. */
const MIN_CELL_SCREEN_PX = 6;
/** A cada quantas células desenha uma linha mais forte. */
const MAJOR_EVERY = 10;
const ZOOM_STEP = 1.2;

/**
 * Visualização 2D do mapa com PixiJS. Lê o grid e a câmera; não guarda
 * dados do mapa (o documento continua sendo a fonte da verdade).
 */
export class MapView {
  readonly app = new Application();
  readonly camera = new Camera();
  private world = new Container();
  private mapLayer = new Graphics();
  private gridLayer = new Graphics();
  private hoverLayer = new Graphics();
  private hoverCell: Cell | null = null;
  private dirty = true;
  /** Área (em células) e zoom com que o grid foi desenhado pela última vez. */
  private gridCache: { minCol: number; maxCol: number; minRow: number; maxRow: number; zoom: number; showGrid: boolean } | null = null;
  private mapCacheZoom = 0;
  private rafId = 0;
  private dragging: { pointerId: number; last: Point } | null = null;
  private spaceDown = false;
  private destroyed = false;
  private cleanup: Array<() => void> = [];

  constructor(
    private grid: GridSystem,
    private options: MapViewOptions,
    private events: MapViewEvents = {},
  ) {}

  async mount(host: HTMLElement) {
    await this.app.init({
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
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.tabIndex = 0;
    this.app.canvas.setAttribute('aria-label', 'Área do mapa');
    this.app.canvas.dataset.testid = 'map-canvas';

    this.world.addChild(this.mapLayer, this.gridLayer, this.hoverLayer);
    this.app.stage.addChild(this.world);

    this.camera.setViewSize(this.app.screen.width, this.app.screen.height);
    this.fitToMap();
    this.bindInput();
    // Renderiza só quando algo mudou (economiza bateria e CPU com o mapa parado).
    this.app.stop();
    const loop = () => {
      if (this.destroyed) return;
      this.renderIfDirty();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
    this.cleanup.push(() => cancelAnimationFrame(this.rafId));
  }

  destroy() {
    this.destroyed = true;
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    // Só destrói se o init já terminou (o renderer existe).
    if ((this.app as unknown as { renderer?: unknown }).renderer) this.app.destroy(true, { children: true });
  }

  setOptions(options: Partial<MapViewOptions>) {
    this.options = { ...this.options, ...options };
    this.gridCache = null;
    this.invalidate();
  }

  fitToMap() {
    this.camera.fit(this.grid.worldBounds());
    this.afterCameraChange();
  }

  zoomBy(factor: number) {
    this.camera.zoomAt({ x: this.camera.viewWidth / 2, y: this.camera.viewHeight / 2 }, factor);
    this.afterCameraChange();
  }

  zoomIn() { this.zoomBy(ZOOM_STEP); }
  zoomOut() { this.zoomBy(1 / ZOOM_STEP); }

  private invalidate() { this.dirty = true; }

  private afterCameraChange() {
    this.camera.clampTo(this.grid.worldBounds());
    this.events.onZoomChange?.(this.camera.zoom);
    this.invalidate();
  }

  private renderIfDirty() {
    const { width, height } = this.app.screen;
    if (width !== this.camera.viewWidth || height !== this.camera.viewHeight) {
      this.camera.setViewSize(width, height);
      this.camera.clampTo(this.grid.worldBounds());
      this.dirty = true;
    }
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
    const b = this.grid.worldBounds();
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
    const z = this.camera.zoom;
    const view = this.camera.visibleWorldRect();
    const visible = this.grid.cellRangeInRect(view);
    const c = this.gridCache;
    if (
      c && c.zoom === z && c.showGrid === this.options.showGrid &&
      (!visible || (visible.minCol >= c.minCol && visible.maxCol <= c.maxCol && visible.minRow >= c.minRow && visible.maxRow <= c.maxRow))
    ) return;

    const g = this.gridLayer.clear();
    const b = this.grid.worldBounds();
    g.rect(b.x, b.y, b.width, b.height).stroke({ color: theme.gridBorder, width: 2 / z, alpha: 1 });
    const padded = { x: view.x - view.width / 2, y: view.y - view.height / 2, width: view.width * 2, height: view.height * 2 };
    const range = this.grid.cellRangeInRect(padded);
    this.gridCache = range
      ? { ...range, zoom: z, showGrid: this.options.showGrid }
      : { minCol: 0, maxCol: -1, minRow: 0, maxRow: -1, zoom: z, showGrid: this.options.showGrid };
    if (!this.options.showGrid || !range) return;
    const s = this.grid.cellSize;
    const cellScreen = s * z;
    const showMinor = cellScreen >= MIN_CELL_SCREEN_PX;
    const top = range.minRow * s;
    const bottom = (range.maxRow + 1) * s;
    const left = range.minCol * s;
    const right = (range.maxCol + 1) * s;

    const minor: number[][] = [];
    const major: number[][] = [];
    for (let c = range.minCol; c <= range.maxCol + 1; c++) {
      if (c === 0 || c === this.grid.cols) continue;
      const isMajor = c % MAJOR_EVERY === 0;
      if (isMajor) major.push([c * s, top, c * s, bottom]);
      else if (showMinor) minor.push([c * s, top, c * s, bottom]);
    }
    for (let r = range.minRow; r <= range.maxRow + 1; r++) {
      if (r === 0 || r === this.grid.rows) continue;
      const isMajor = r % MAJOR_EVERY === 0;
      if (isMajor) major.push([left, r * s, right, r * s]);
      else if (showMinor) minor.push([left, r * s, right, r * s]);
    }

    // Linhas finas ficam mais fortes conforme o zoom aumenta.
    const minorAlpha = Math.min(0.45, 0.12 + (cellScreen - MIN_CELL_SCREEN_PX) / 120);
    for (const [x1, y1, x2, y2] of minor) g.moveTo(x1, y1).lineTo(x2, y2);
    if (minor.length) g.stroke({ color: theme.gridMinor, width: 1 / z, alpha: minorAlpha });
    for (const [x1, y1, x2, y2] of major) g.moveTo(x1, y1).lineTo(x2, y2);
    if (major.length) g.stroke({ color: theme.gridMajor, width: 1.5 / z, alpha: 0.55 });
  }

  private drawHover() {
    const g = this.hoverLayer.clear();
    if (!this.hoverCell) return;
    const pts = this.grid.cellPolygon(this.hoverCell).flatMap((p) => [p.x, p.y]);
    g.poly(pts).fill({ color: theme.hoverFill, alpha: 0.35 }).stroke({ color: theme.hoverFill, width: 2 / this.camera.zoom });
  }

  private setHover(cell: Cell | null) {
    const prev = this.hoverCell;
    if (prev?.col === cell?.col && prev?.row === cell?.row) return;
    this.hoverCell = cell;
    this.events.onHoverCell?.(cell);
    this.invalidate();
  }

  private localPoint(e: PointerEvent | WheelEvent): Point {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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
      // Pinça no trackpad chega como wheel + ctrlKey; deltaY menor = zoom mais suave.
      const intensity = e.ctrlKey ? 0.01 : 0.0015;
      const factor = Math.exp(-e.deltaY * intensity);
      this.camera.zoomAt(this.localPoint(e), factor);
      this.afterCameraChange();
    }, { passive: false });

    on(canvas, 'pointerdown', (e) => {
      canvas.focus();
      // Fase 0: ainda não há ferramentas, então qualquer botão arrasta o mapa.
      // Quando houver ferramentas, o pan ficará no botão do meio, direito ou Espaço.
      this.dragging = { pointerId: e.pointerId, last: this.localPoint(e) };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });

    on(canvas, 'pointermove', (e) => {
      const p = this.localPoint(e);
      if (this.dragging && this.dragging.pointerId === e.pointerId) {
        this.camera.panBy(p.x - this.dragging.last.x, p.y - this.dragging.last.y);
        this.dragging.last = p;
        this.afterCameraChange();
      }
      this.setHover(this.grid.worldToCell(this.camera.screenToWorld(p)));
    });

    const endDrag = (e: PointerEvent) => {
      if (this.dragging?.pointerId !== e.pointerId) return;
      this.dragging = null;
      canvas.style.cursor = this.spaceDown ? 'grab' : 'default';
    };
    on(canvas, 'pointerup', endDrag);
    on(canvas, 'pointercancel', endDrag);
    on(canvas, 'pointerleave', () => { if (!this.dragging) this.setHover(null); });
    on(canvas, 'contextmenu', (e) => e.preventDefault());

    on(window, 'keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      const pan = 64;
      switch (e.key) {
        case '+': case '=': this.zoomIn(); break;
        case '-': case '_': this.zoomOut(); break;
        case '0': this.fitToMap(); break;
        case 'ArrowLeft': this.camera.panBy(pan, 0); this.afterCameraChange(); break;
        case 'ArrowRight': this.camera.panBy(-pan, 0); this.afterCameraChange(); break;
        case 'ArrowUp': this.camera.panBy(0, pan); this.afterCameraChange(); break;
        case 'ArrowDown': this.camera.panBy(0, -pan); this.afterCameraChange(); break;
        case ' ': this.spaceDown = true; if (!this.dragging) canvas.style.cursor = 'grab'; break;
        default: return;
      }
      e.preventDefault();
    });
    on(window, 'keyup', (e) => {
      if (e.key === ' ') { this.spaceDown = false; if (!this.dragging) canvas.style.cursor = 'default'; }
    });
  }
}

function isTypingTarget(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}
