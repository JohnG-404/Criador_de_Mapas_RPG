import { TERRAINS } from '../core/doc/terrain';
import type { TerrainLayer } from '../core/doc/TerrainLayer';
import type { GridSystem, Rect } from '../core/grid/GridSystem';

/** Resolução da máscara: pixels por célula. */
export const MASK_PX_PER_CELL = 4;
/** Células de vizinhos incluídas em volta do chunk (para a transição continuar entre chunks). */
export const MASK_MARGIN_CELLS = 2;
/** Raio do desfoque em pixels da máscara (largura da transição entre terrenos). */
export const MASK_BLUR = 2;

/**
 * Quantos terrenos diferentes cada chunk mistura. O catálogo pode ter mais:
 * cada chunk escolhe os seus (ver `slots`). 3 máscaras + 12 texturas = 15
 * unidades de textura, dentro das 16 que o WebGL 2 garante.
 */
export const MASK_SLOTS = 12;
/** Máscaras RGBA por chunk (4 slots em cada). */
export const MASK_LAYERS = MASK_SLOTS / 4;

export interface ChunkMask {
  /** MASK_LAYERS máscaras RGBA em sequência, cada uma com width × height × 4 bytes. */
  data: Uint8Array;
  /** Id do terreno de cada slot (canal) da máscara, em ordem crescente; no máximo MASK_SLOTS. */
  slots: number[];
  width: number;
  height: number;
  /** Área do mundo coberta pelas células do chunk (onde o quad é desenhado). */
  quad: Rect;
  /** Área do mundo coberta pela máscara inteira (quad + margem). */
  maskRect: Rect;
}

if (TERRAINS.length > 255) throw new Error('O terreno é salvo em 1 byte: no máximo 255 tipos.');

/** Retângulo do mundo que envolve um intervalo de células. */
export function cellRangeRect(grid: GridSystem, minCol: number, maxCol: number, minRow: number, maxRow: number): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const visit = (col: number, row: number) => {
    for (const p of grid.cellPolygon({ col, row })) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  };
  // As células extremas definem o contorno; no hex, as duas primeiras/últimas linhas alternam o deslocamento.
  for (let row = minRow; row <= Math.min(maxRow, minRow + 1); row++) { visit(minCol, row); visit(maxCol, row); }
  for (let row = Math.max(minRow, maxRow - 1); row <= maxRow; row++) { visit(minCol, row); visit(maxCol, row); }
  for (let col = minCol; col <= maxCol; col++) { visit(col, minRow); visit(col, maxRow); }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Máscaras RGBA de um chunk: cada canal é a presença de um terreno (slot 0 =
 * R da máscara 1, slot 4 = R da máscara 2...), amostrada em resolução baixa e
 * desfocada. Os slots são os terrenos que aparecem no chunk (com a margem):
 * se houver mais de MASK_SLOTS, os mais raros viram o mais comum.
 * A GPU interpola e o shader mistura as texturas com esses pesos, o que dá a
 * transição suave entre terrenos nos dois tipos de grid.
 */
export function buildChunkMask(grid: GridSystem, layer: TerrainLayer, cx: number, cy: number, out?: Uint8Array): ChunkMask {
  const b = layer.chunkBounds(cx, cy);
  const quad = cellRangeRect(grid, b.minCol, b.maxCol, b.minRow, b.maxRow);
  const px = grid.cellSize / MASK_PX_PER_CELL;
  const margin = MASK_MARGIN_CELLS * grid.cellSize;
  const width = Math.ceil((quad.width + margin * 2) / px);
  const height = Math.ceil((quad.height + margin * 2) / px);
  const maskRect = { x: quad.x - margin, y: quad.y - margin, width: width * px, height: height * px };
  const layerSize = width * height * 4;
  const size = layerSize * MASK_LAYERS;
  const data = out && out.length === size ? out : new Uint8Array(size);
  data.fill(0);
  const ids = new Uint8Array(width * height);

  if (grid.kind === 'square') {
    // Caminho rápido: no grid quadrado a célula sai direto da divisão.
    const s = grid.cellSize;
    for (let j = 0; j < height; j++) {
      const row = Math.floor((maskRect.y + (j + 0.5) * px) / s);
      if (row < 0 || row >= grid.rows) continue;
      for (let i = 0; i < width; i++) {
        const col = Math.floor((maskRect.x + (i + 0.5) * px) / s);
        if (col < 0 || col >= grid.cols) continue;
        const id = layer.get(col, row);
        ids[j * width + i] = id;
      }
    }
  } else {
    for (let j = 0; j < height; j++) {
      const y = maskRect.y + (j + 0.5) * px;
      for (let i = 0; i < width; i++) {
        const cell = grid.worldToCell({ x: maskRect.x + (i + 0.5) * px, y });
        if (!cell) continue;
        const id = layer.get(cell.col, cell.row);
        ids[j * width + i] = id;
      }
    }
  }
  const slots = chooseSlots(ids);
  const lut = new Int16Array(256).fill(-1);
  slots.forEach((id, k) => { lut[id] = k; });
  const fallback = slots.length ? lut[mostCommon(ids)] : -1;
  for (let p = 0; p < ids.length; p++) {
    const id = ids[p];
    if (!id) continue;
    const k = lut[id] >= 0 ? lut[id] : fallback;
    if (k >= 0) data[(k >> 2) * layerSize + p * 4 + (k & 3)] = 255;
  }
  for (let l = 0; l < MASK_LAYERS; l++) {
    const layer = data.subarray(l * layerSize, (l + 1) * layerSize);
    boxBlurRGBA(layer, width, height, MASK_BLUR);
    boxBlurRGBA(layer, width, height, MASK_BLUR);
  }
  return { data, width, height, quad, maskRect, slots };
}

function counts(ids: Uint8Array) {
  const c = new Uint32Array(256);
  for (let p = 0; p < ids.length; p++) c[ids[p]]++;
  c[0] = 0;
  return c;
}

function mostCommon(ids: Uint8Array) {
  const c = counts(ids);
  let best = 0;
  for (let id = 1; id < 256; id++) if (c[id] > c[best]) best = id;
  return best;
}

/** Terrenos presentes, os MASK_SLOTS mais comuns, em ordem de id (estável enquanto o conjunto não muda). */
export function chooseSlots(ids: Uint8Array): number[] {
  const c = counts(ids);
  const present: number[] = [];
  for (let id = 1; id < 256; id++) if (c[id]) present.push(id);
  if (present.length > MASK_SLOTS) present.sort((a, b) => c[b] - c[a] || a - b).length = MASK_SLOTS;
  return present.sort((a, b) => a - b);
}

/** Desfoque de caixa separável nos 4 canais (no lugar), com bordas repetidas. */
export function boxBlurRGBA(data: Uint8Array, w: number, h: number, r: number) {
  if (r <= 0) return;
  const div = r * 2 + 1;
  const mul = Math.round(65536 / div);
  blurPass(data, w, h, 4, w * 4, r, mul); // horizontal: passo 4 dentro da linha
  blurPass(data, h, w, w * 4, 4, r, mul); // vertical: passo de uma linha
}

/**
 * Uma passada 1D. `n` amostras por linha com passo `step`; `lines` linhas com
 * passo `lineStep`. Os 4 canais são somados juntos.
 */
function blurPass(data: Uint8Array, n: number, lines: number, step: number, lineStep: number, r: number, mul: number) {
  const buf = new Uint8Array(n * 4);
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    for (let i = 0; i < n; i++) {
      const o = base + i * step;
      buf[i * 4] = data[o]; buf[i * 4 + 1] = data[o + 1]; buf[i * 4 + 2] = data[o + 2]; buf[i * 4 + 3] = data[o + 3];
    }
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let k = -r; k <= r; k++) {
      const j = (k < 0 ? 0 : k >= n ? n - 1 : k) * 4;
      a0 += buf[j]; a1 += buf[j + 1]; a2 += buf[j + 2]; a3 += buf[j + 3];
    }
    for (let i = 0; i < n; i++) {
      const o = base + i * step;
      data[o] = (a0 * mul + 32768) >>> 16;
      data[o + 1] = (a1 * mul + 32768) >>> 16;
      data[o + 2] = (a2 * mul + 32768) >>> 16;
      data[o + 3] = (a3 * mul + 32768) >>> 16;
      const add = (i + r + 1 >= n ? n - 1 : i + r + 1) * 4;
      const sub = (i - r < 0 ? 0 : i - r) * 4;
      a0 += buf[add] - buf[sub]; a1 += buf[add + 1] - buf[sub + 1];
      a2 += buf[add + 2] - buf[sub + 2]; a3 += buf[add + 3] - buf[sub + 3];
    }
  }
}
