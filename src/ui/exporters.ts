import type { MapDocument } from '../core/doc/MapDocument';
import { mapFileName } from '../core/doc/serialize';
import { buildPdf, MM, planPrintPages, type PdfPage } from '../core/export/pdf';
import { buildUvtt } from '../core/export/uvtt';
import { saveBlob } from '../editor/persistence';
import { canvasToBlob, type MapView } from '../render/MapView';

const baseName = (doc: MapDocument) => mapFileName(doc.options.name).replace(/\.rpgmap$/, '');

export async function exportPngFile(view: MapView, doc: MapDocument, grid: boolean) {
  const blob = await view.exportPng({ grid });
  return saveBlob(blob, `${baseName(doc)}.png`, { description: 'Imagem PNG', accept: { 'image/png': ['.png'] } });
}

/**
 * Mesa virtual (Universal VTT): imagem sem grid e sem tokens (a mesa virtual
 * desenha os dela), mais paredes, portas e luzes.
 */
export async function exportUvttFile(view: MapView, doc: MapDocument) {
  const wanted = 100 / doc.grid.cellSize; // 100 px por célula, o padrão do formato
  const scale = view.maxExportScale(wanted);
  const b = doc.grid.worldBounds();
  const canvas = view.renderRegion(b, scale, { grid: false, tokens: false });
  const blob = await canvasToBlob(canvas, 'image/png');
  const base64 = await blobToBase64(blob);
  const ppg = Math.round(doc.grid.cellSize * scale * 1000) / 1000;
  const file = buildUvtt(doc, base64, ppg);
  return saveBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${baseName(doc)}.dd2vtt`, {
    description: 'Mapa Universal VTT',
    accept: { 'application/json': ['.dd2vtt', '.uvtt'] },
  });
}

/**
 * PDF para imprimir em escala real: cada célula com `cellMm` milímetros
 * (25,4 mm = 1 polegada, o tamanho padrão das miniaturas), dividido em folhas A4.
 */
export async function exportPdfFile(view: MapView, doc: MapDocument, opts: { grid: boolean; cellMm: number; onProgress?: (done: number, total: number) => void }) {
  const s = doc.grid.cellSize;
  const b = doc.grid.worldBounds();
  const cellPt = opts.cellMm * MM;
  const dpi = 150;
  const pxPerCell = Math.round((opts.cellMm / 25.4) * dpi);
  const scale = pxPerCell / s;
  const plan = planPrintPages(Math.ceil(b.width / s - 1e-6), Math.ceil(b.height / s - 1e-6), cellPt);
  const pages: PdfPage[] = [];
  for (const [i, pg] of plan.pages.entries()) {
    const frame = {
      x: pg.col * s,
      y: pg.row * s,
      width: Math.min(pg.cols * s, b.width - pg.col * s),
      height: Math.min(pg.rows * s, b.height - pg.row * s),
    };
    const canvas = flatten(view.renderRegion(frame, scale, { grid: opts.grid, tokens: true }));
    const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.88)).arrayBuffer());
    pages.push({
      jpeg,
      pxWidth: canvas.width,
      pxHeight: canvas.height,
      x: pg.x,
      y: pg.y,
      width: (frame.width / s) * cellPt,
      height: (frame.height / s) * cellPt,
      caption: `Atlas Board - ${doc.options.name} - folha ${i + 1} de ${plan.pages.length} - colunas ${pg.col + 1} a ${pg.col + pg.cols}, linhas ${pg.row + 1} a ${pg.row + pg.rows}`,
    });
    opts.onProgress?.(i + 1, plan.pages.length);
    // Deixa a interface respirar entre as folhas.
    await new Promise((r) => setTimeout(r, 0));
  }
  const pdf = buildPdf(pages);
  return saveBlob(new Blob([pdf], { type: 'application/pdf' }), `${baseName(doc)}.pdf`, {
    description: 'PDF para impressão',
    accept: { 'application/pdf': ['.pdf'] },
  });
}

export function printPageCount(doc: MapDocument, cellMm: number) {
  const s = doc.grid.cellSize;
  const b = doc.grid.worldBounds();
  return planPrintPages(Math.ceil(b.width / s - 1e-6), Math.ceil(b.height / s - 1e-6), cellMm * MM).pages.length;
}

/** JPEG não tem transparência: põe fundo branco (papel). */
function flatten(src: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  return c;
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
