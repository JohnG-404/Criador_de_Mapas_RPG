import { BlurFilter, Container, Graphics } from 'pixi.js';
import { ELEV_ZERO } from '../core/doc/elevation';
import type { MapDocument } from '../core/doc/MapDocument';
import { CHUNK_SIZE, chunkKey, type ChunkKey } from '../core/doc/TerrainLayer';
import type { Cell, Point } from '../core/grid/GridSystem';

/** A cada quantos níveis (1 nível = 1/4 de célula) desenha uma curva de nível. */
const CONTOUR_EVERY = 4;

/**
 * Relevo no 2D: sombreamento com luz vinda do noroeste, tom mais claro no
 * alto e mais escuro no fundo, e curvas de nível. Um Graphics por chunk,
 * refeito só quando a elevação perto dele muda.
 */
export class ElevationRenderer {
  readonly container = new Container();
  private chunks = new Map<ChunkKey, { shade: Graphics; lines: Graphics }>();
  private shades = new Container();
  private lines = new Container();
  private pending = new Set<ChunkKey>();
  private unsubscribe: (() => void) | null = null;
  onChange: (() => void) | null = null;

  private blur = new BlurFilter({ strength: 8, quality: 3 });

  constructor(private doc: MapDocument) {
    // Desfoca o sombreamento por célula para as encostas parecerem contínuas.
    this.shades.filters = [this.blur];
    this.container.addChild(this.shades, this.lines);
  }

  /** Ajusta o desfoque ao zoom (px de tela por unidade do mundo). */
  setZoom(zoom: number) {
    const s = Math.max(2, Math.min(40, this.doc.grid.cellSize * zoom * 0.45));
    if (Math.abs(s - this.blur.strength) > 0.5) this.blur.strength = s;
  }

  buildAll() {
    const e = this.doc.elevation;
    for (let cy = 0; cy < e.chunksY; cy++) for (let cx = 0; cx < e.chunksX; cx++) this.buildChunk(cx, cy);
    this.unsubscribe = e.onChange((_chunks, cells) => {
      // O sombreamento depende das vizinhas: refaz também os chunks encostados.
      const c0 = Math.max(0, Math.floor((cells.minCol - 1) / CHUNK_SIZE));
      const c1 = Math.min(e.chunksX - 1, Math.floor((cells.maxCol + 1) / CHUNK_SIZE));
      const r0 = Math.max(0, Math.floor((cells.minRow - 1) / CHUNK_SIZE));
      const r1 = Math.min(e.chunksY - 1, Math.floor((cells.maxRow + 1) / CHUNK_SIZE));
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) this.pending.add(chunkKey(cx, cy));
      this.onChange?.();
    });
  }

  update(): boolean {
    if (!this.pending.size) return false;
    for (const key of this.pending) {
      const [cx, cy] = key.split(',').map(Number);
      this.buildChunk(cx, cy);
    }
    this.pending.clear();
    return true;
  }

  destroy() {
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }

  private level(col: number, row: number) {
    const e = this.doc.elevation;
    // Fora do mapa: repete a borda (sem sombra falsa na beirada).
    const c = Math.max(0, Math.min(e.cols - 1, col));
    const r = Math.max(0, Math.min(e.rows - 1, row));
    return e.get(c, r) - ELEV_ZERO;
  }

  private buildChunk(cx: number, cy: number) {
    const key = chunkKey(cx, cy);
    let v = this.chunks.get(key);
    if (!v) {
      v = { shade: new Graphics(), lines: new Graphics() };
      this.chunks.set(key, v);
      this.shades.addChild(v.shade);
      this.lines.addChild(v.lines);
    }
    const g = v.shade.clear();
    const lines = v.lines.clear();
    const grid = this.doc.grid;
    const e = this.doc.elevation;
    const cell = grid.cellSize;
    const maxCol = Math.min(e.cols, (cx + 1) * CHUNK_SIZE);
    const maxRow = Math.min(e.rows, (cy + 1) * CHUNK_SIZE);
    const contours: Array<[Point, Point]> = [];
    for (let row = cy * CHUNK_SIZE; row < maxRow; row++) {
      for (let col = cx * CHUNK_SIZE; col < maxCol; col++) {
        const h = this.level(col, row);
        const c: Cell = { col, row };
        const ns = grid.neighbors(c);
        let flat = h === 0;
        const center = grid.cellToWorld(c);
        let gx = 0, gy = 0;
        for (const n of ns) {
          const hn = this.level(n.col, n.row);
          if (hn !== 0) flat = false;
          if (hn === h) continue;
          const p = grid.cellToWorld(n);
          const dx = (p.x - center.x) / cell, dy = (p.y - center.y) / cell;
          const d = Math.hypot(dx, dy) || 1;
          gx += ((hn - h) * dx) / (d * d);
          gy += ((hn - h) * dy) / (d * d);
          // Curva de nível na aresta comum (cada par só uma vez).
          if (Math.floor(hn / CONTOUR_EVERY) !== Math.floor(h / CONTOUR_EVERY) && (n.row > row || (n.row === row && n.col > col))) {
            const edge = sharedEdge(grid.cellPolygon(c), grid.cellPolygon(n));
            if (edge) contours.push(edge);
          }
        }
        if (flat) continue;
        const k = 2 / Math.max(1, ns.length);
        gx *= k; gy *= k;
        // Luz do noroeste: terreno que sobe para leste/sul fica de frente para ela.
        const lit = Math.max(-0.55, Math.min(0.45, ((gx + gy) / Math.SQRT2) * 0.16));
        const poly = grid.cellPolygon(c).flatMap((p) => [p.x, p.y]);
        const tint = h > 0 ? Math.min(0.12, h * 0.004) : Math.min(0.4, -h * 0.03);
        if (tint > 0.01) g.poly(poly).fill({ color: h > 0 ? 0xfff6e0 : 0x0a0d12, alpha: tint });
        if (Math.abs(lit) > 0.01) g.poly(poly).fill({ color: lit > 0 ? 0xfff3d6 : 0x0b0e14, alpha: Math.abs(lit) });
      }
    }
    for (const [a, b] of contours) lines.moveTo(a.x, a.y).lineTo(b.x, b.y);
    if (contours.length) lines.stroke({ width: 1, color: 0x2a1f12, alpha: 0.3 });
  }
}

function sharedEdge(a: Point[], b: Point[]): [Point, Point] | null {
  const common: Point[] = [];
  for (const p of a) if (b.some((q) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5)) common.push(p);
  return common.length >= 2 ? [common[0], common[1]] : null;
}
