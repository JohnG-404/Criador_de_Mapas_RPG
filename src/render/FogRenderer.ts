import { AlphaFilter, BlurFilter, Container, Graphics } from 'pixi.js';
import { FOG_HIDDEN, type MapDocument } from '../core/doc/MapDocument';
import { chunkKey, type ChunkKey } from '../core/doc/TerrainLayer';

export type FogStyle = 'gm' | 'player';

const FOG_COLOR = 0x0c0e13;

/**
 * Desenha a névoa de guerra. Um Graphics por chunk de 32×32 células, refeito
 * só quando a névoa daquele chunk muda. No grid quadrado, as células escondidas
 * de cada linha viram um único retângulo.
 *
 * Mestre: névoa translúcida (dá para ver o que está escondido).
 * Jogador: névoa opaca.
 */
export class FogRenderer {
  readonly container = new Container();
  private chunks = new Map<ChunkKey, Graphics>();
  private pending = new Set<ChunkKey>();
  private unsubscribe: (() => void) | null = null;
  onChange: (() => void) | null = null;

  constructor(private doc: MapDocument, private style: FogStyle) {
    this.applyStyle();
  }

  buildAll() {
    const f = this.doc.fog;
    for (let cy = 0; cy < f.chunksY; cy++) for (let cx = 0; cx < f.chunksX; cx++) this.buildChunk(cx, cy);
    this.unsubscribe = f.onChange((chunks) => {
      for (const k of chunks) this.pending.add(k);
      this.onChange?.();
    });
  }

  setStyle(style: FogStyle) {
    if (style === this.style) return;
    this.style = style;
    this.applyStyle();
    for (const key of this.chunks.keys()) this.pending.add(key);
    this.onChange?.();
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

  private applyStyle() {
    // O filtro aplica a transparência ao grupo todo, sem escurecer as emendas.
    // Para os jogadores, a borda da névoa fica esfumada.
    this.container.filters = this.style === 'player'
      ? [new BlurFilter({ strength: 10, quality: 3 })]
      : [new AlphaFilter({ alpha: 0.55 })];
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
    const { fog, grid } = this.doc;
    const b = fog.chunkBounds(cx, cy);
    let any = false;
    // Jogador: a névoa avança um pouco sobre as células visíveis, para o esfumado
    // não deixar ver o que está escondido; nas bordas do mapa ela passa da borda.
    const player = this.style === 'player';
    const grow = player ? grid.cellSize * 0.4 : 0.25;
    const edge = player ? grid.cellSize * 2 : 0;
    if (grid.kind === 'square') {
      const s = grid.cellSize;
      for (let row = b.minRow; row <= b.maxRow; row++) {
        let start = -1;
        for (let col = b.minCol; col <= b.maxCol + 1; col++) {
          const hidden = col <= b.maxCol && fog.get(col, row) === FOG_HIDDEN;
          if (hidden && start < 0) start = col;
          else if (!hidden && start >= 0) {
            const x0 = start * s - grow - (start === 0 ? edge : 0);
            const x1 = col * s + grow + (col === fog.cols ? edge : 0);
            const y0 = row * s - grow - (row === 0 ? edge : 0);
            const y1 = (row + 1) * s + grow + (row === fog.rows - 1 ? edge : 0);
            g.rect(x0, y0, x1 - x0, y1 - y0);
            start = -1;
            any = true;
          }
        }
      }
    } else {
      for (let row = b.minRow; row <= b.maxRow; row++) {
        for (let col = b.minCol; col <= b.maxCol; col++) {
          if (fog.get(col, row) !== FOG_HIDDEN) continue;
          // Hexágono um pouco maior para cobrir as emendas (e o esfumado, para o jogador).
          const c = grid.cellToWorld({ col, row });
          const k = player ? 1.45 : 1.02;
          g.poly(grid.cellPolygon({ col, row }).flatMap((p) => [c.x + (p.x - c.x) * k, c.y + (p.y - c.y) * k]));
          if (player && (col === 0 || row === 0 || col === fog.cols - 1 || row === fog.rows - 1)) g.circle(c.x, c.y, grid.cellSize * 1.5);
          any = true;
        }
      }
    }
    if (any) g.fill(FOG_COLOR);
  }
}
