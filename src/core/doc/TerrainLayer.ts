import type { Cell } from '../grid/GridSystem';

export const CHUNK_SIZE = 32;

export type ChunkKey = string;

/** Retângulo de células alteradas (inclusivo). */
export interface DirtyCells {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

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
  /** Chunks por índice (cy * chunksX + cx); undefined = ainda só o terreno inicial. */
  private chunks: (Uint8Array | undefined)[];
  private dirty = new Set<ChunkKey>();
  private dirtyCells: DirtyCells | null = null;
  private listeners = new Set<(dirty: ReadonlySet<ChunkKey>, cells: DirtyCells) => void>();

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly fill = 0,
  ) {
    this.chunksX = Math.ceil(cols / CHUNK_SIZE);
    this.chunksY = Math.ceil(rows / CHUNK_SIZE);
    this.chunks = new Array(this.chunksX * this.chunksY);
  }

  get(col: number, row: number): number {
    if (!this.contains(col, row)) return 0;
    const chunk = this.chunks[((row / CHUNK_SIZE) | 0) * this.chunksX + ((col / CHUNK_SIZE) | 0)];
    if (!chunk) return this.fill;
    return chunk[(row % CHUNK_SIZE) * CHUNK_SIZE + (col % CHUNK_SIZE)];
  }

  /** Muda uma célula. Retorna o valor anterior. Não notifica: chame `flush()`. */
  set(col: number, row: number, value: number): number {
    if (!this.contains(col, row)) return 0;
    const cx = Math.floor(col / CHUNK_SIZE);
    const cy = Math.floor(row / CHUNK_SIZE);
    const ci = cy * this.chunksX + cx;
    let chunk = this.chunks[ci];
    if (!chunk) {
      chunk = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(this.fill);
      this.chunks[ci] = chunk;
    }
    const i = (row % CHUNK_SIZE) * CHUNK_SIZE + (col % CHUNK_SIZE);
    const prev = chunk[i];
    if (prev !== value) {
      chunk[i] = value;
      this.dirty.add(chunkKey(cx, cy));
      const d = this.dirtyCells;
      if (!d) this.dirtyCells = { minCol: col, maxCol: col, minRow: row, maxRow: row };
      else {
        if (col < d.minCol) d.minCol = col;
        if (col > d.maxCol) d.maxCol = col;
        if (row < d.minRow) d.minRow = row;
        if (row > d.maxRow) d.maxRow = row;
      }
    }
    return prev;
  }

  getCell(c: Cell) { return this.get(c.col, c.row); }

  contains(col: number, row: number) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  /** Avisa os observadores sobre os chunks alterados desde o último flush. */
  flush() {
    if (!this.dirty.size || !this.dirtyCells) return;
    const d = this.dirty;
    const cells = this.dirtyCells;
    this.dirty = new Set();
    this.dirtyCells = null;
    this.listeners.forEach((fn) => fn(d, cells));
  }

  onChange(fn: (dirty: ReadonlySet<ChunkKey>, cells: DirtyCells) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Copia todas as células para um array linha a linha (cols × rows). */
  toArray(): Uint8Array {
    const out = new Uint8Array(this.cols * this.rows);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) out[row * this.cols + col] = this.get(col, row);
    }
    return out;
  }

  /** Substitui todas as células por um array linha a linha e avisa os observadores. */
  loadArray(data: Uint8Array) {
    if (data.length !== this.cols * this.rows) throw new Error('Tamanho de camada inválido');
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) this.set(col, row, data[row * this.cols + col]);
    }
    this.flush();
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
