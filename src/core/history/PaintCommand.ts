import type { TerrainLayer } from '../doc/TerrainLayer';
import type { Command } from './History';

/**
 * Pintura de terreno. Durante um traço, as células vão sendo pintadas e
 * registradas aqui (guardando o valor original de cada uma); ao soltar o
 * mouse, o traço inteiro vira UM passo do histórico.
 */
export class PaintCommand implements Command {
  /** índice da célula → [antes, depois] */
  private changes = new Map<number, [number, number]>();

  constructor(
    private layer: TerrainLayer,
    readonly label: string,
  ) {}

  paint(col: number, row: number, value: number) {
    if (!this.layer.contains(col, row)) return;
    const idx = row * this.layer.cols + col;
    const prev = this.layer.set(col, row, value);
    const existing = this.changes.get(idx);
    if (existing) existing[1] = value;
    else if (prev !== value) this.changes.set(idx, [prev, value]);
  }

  get size() { return this.changes.size; }

  /** Avisa quem desenha a camada sobre as células pintadas até agora. */
  flush() { this.layer.flush(); }

  isEmpty() {
    for (const [before, after] of this.changes.values()) if (before !== after) return false;
    return true;
  }

  apply() { this.write(1); }
  revert() { this.write(0); }

  private write(which: 0 | 1) {
    const cols = this.layer.cols;
    for (const [idx, pair] of this.changes) this.layer.set(idx % cols, Math.floor(idx / cols), pair[which]);
    this.layer.flush();
  }
}
