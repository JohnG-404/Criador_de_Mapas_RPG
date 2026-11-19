import { Assets, Container, FillPattern, Graphics, Matrix, type Texture } from 'pixi.js';
import type { MapDocument } from '../core/doc/MapDocument';
import { TERRAINS } from '../core/doc/terrain';
import { chunkKey, type ChunkKey } from '../core/doc/TerrainLayer';
import type { Point } from '../core/grid/GridSystem';
import { TERRAIN_TEXTURE_URLS, TEXTURE_CELLS } from './terrainTextures';

/** Sobreposição (px do mundo) entre células vizinhas, para não aparecer fresta. */
const OVERLAP = 0.35;

/**
 * Desenha a camada de terreno. Cada chunk de 32×32 células vira um Graphics
 * com as texturas aplicadas em coordenadas do mundo (a textura continua de
 * uma célula para a outra, sem emenda). Só os chunks alterados são refeitos.
 */
export class TerrainRenderer {
  readonly container = new Container();
  private chunks = new Map<ChunkKey, Graphics>();
  private patterns = new Map<number, FillPattern>();
  private unsubscribe: (() => void) | null = null;
  onChange: (() => void) | null = null;

  constructor(private doc: MapDocument) {}

  async load() {
    const scale = (TEXTURE_CELLS * this.doc.grid.cellSize);
    await Promise.all(
      TERRAINS.map(async (t) => {
        const url = TERRAIN_TEXTURE_URLS[t.key];
        if (!url) return;
        const tex = await Assets.load<Texture>(url);
        tex.source.scaleMode = 'linear';
        const pattern = new FillPattern(tex, 'repeat');
        pattern.setTransform(new Matrix().scale(scale / tex.width, scale / tex.height));
        this.patterns.set(t.id, pattern);
      }),
    );
  }

  buildAll() {
    const t = this.doc.terrain;
    for (let cy = 0; cy < t.chunksY; cy++) for (let cx = 0; cx < t.chunksX; cx++) this.buildChunk(cx, cy);
    this.unsubscribe = t.onChange((dirty) => {
      for (const key of dirty) {
        const [cx, cy] = key.split(',').map(Number);
        this.buildChunk(cx, cy);
      }
      this.onChange?.();
    });
  }

  destroy() {
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }

  private buildChunk(cx: number, cy: number) {
    const key = chunkKey(cx, cy);
    let g = this.chunks.get(key);
    if (!g) {
      g = new Graphics();
      this.chunks.set(key, g);
      this.container.addChild(g);
    }
    g.clear();
    const { minCol, maxCol, minRow, maxRow } = this.doc.terrain.chunkBounds(cx, cy);
    const grid = this.doc.grid;
    const layer = this.doc.terrain;

    for (const t of TERRAINS) {
      let any = false;
      if (grid.kind === 'square') {
        // Junta células iguais seguidas na mesma linha num retângulo só.
        const s = grid.cellSize;
        for (let row = minRow; row <= maxRow; row++) {
          let start = -1;
          for (let col = minCol; col <= maxCol + 1; col++) {
            const match = col <= maxCol && layer.get(col, row) === t.id;
            if (match && start < 0) start = col;
            if (!match && start >= 0) {
              g.rect(start * s - OVERLAP, row * s - OVERLAP, (col - start) * s + OVERLAP * 2, s + OVERLAP * 2);
              start = -1;
              any = true;
            }
          }
        }
      } else {
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            if (layer.get(col, row) !== t.id) continue;
            const c = grid.cellToWorld({ col, row });
            g.poly(expand(grid.cellPolygon({ col, row }), c, OVERLAP));
            any = true;
          }
        }
      }
      if (!any) continue;
      const pattern = this.patterns.get(t.id);
      if (pattern) g.fill({ fill: pattern });
      else g.fill(t.color);
    }
  }
}

function expand(pts: Point[], c: Point, by: number): number[] {
  const out: number[] = [];
  for (const p of pts) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    out.push(p.x + (dx / len) * by, p.y + (dy / len) * by);
  }
  return out;
}
