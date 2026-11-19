import type { Cell } from '../grid/GridSystem';

export const CHUNK_SIZE = 32;

export type ChunkKey = string;

export function chunkKey(cx: number, cy: number): ChunkKey {
  return `${cx},${cy}`;
}

/**
 * Camada de terreno dividida em blocos (chunks) de 32×32 células.
 * Cada célula guarda o id do terreno (0 = vazio). Quem desenha a camada só
 * precisa refazer os chunks que mudaram.
 */
export class TerrainLayer {
  readonly chunksX: number;
  readonly chunksY: number;
  private chunks = new Map<ChunkKey, Uint8Array>();
  private dirty = new Set<ChunkKey>();
  private listeners = new Set<(dirty: ReadonlySet<ChunkKey>) => void>();

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly fill = 0,
  ) {
    this.chunksX = Math.ceil(cols / CHUNK_SIZE);
    this.chunksY = Math.ceil(rows / CHUNK_SIZE);
  }

  get(col: number, row: number): number {
    if (!this.contains(col, row)) return 0;
    const chunk = this.chunks.get(chunkKey(Math.floor(col / CHUNK_SIZE), Math.floor(row / CHUNK_SIZE)));
    if (!chunk) return this.fill;
    return chunk[(row % CHUNK_SIZE) * CHUNK_SIZE + (col % CHUNK_SIZE)];
  }

  /** Muda uma célula. Retorna o valor anterior. Não notifica: chame `flush()`. */
  set(col: number, row: number, value: number): number {
    if (!this.contains(col, row)) return 0;
    const cx = Math.floor(col / CHUNK_SIZE);
    const cy = Math.floor(row / CHUNK_SIZE);
    const key = chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(this.fill);
      this.chunks.set(key, chunk);
    }
    const i = (row % CHUNK_SIZE) * CHUNK_SIZE + (col % CHUNK_SIZE);
    const prev = chunk[i];
    if (prev !== value) {
      chunk[i] = value;
      this.dirty.add(key);
    }
    return prev;
  }

  getCell(c: Cell) { return this.get(c.col, c.row); }

  contains(col: number, row: number) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  /** Avisa os observadores sobre os chunks alterados desde o último flush. */
  flush() {
    if (!this.dirty.size) return;
    const d = this.dirty;
    this.dirty = new Set();
    this.listeners.forEach((fn) => fn(d));
  }

  onChange(fn: (dirty: ReadonlySet<ChunkKey>) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Limites (em células) de um chunk. */
  chunkBounds(cx: number, cy: number) {
    const minCol = cx * CHUNK_SIZE;
    const minRow = cy * CHUNK_SIZE;
    return {
      minCol,
      minRow,
      maxCol: Math.min(this.cols, minCol + CHUNK_SIZE) - 1,
      maxRow: Math.min(this.rows, minRow + CHUNK_SIZE) - 1,
    };
  }
}
