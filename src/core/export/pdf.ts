/**
 * Gerador mínimo de PDF: uma imagem JPEG por página, com uma legenda de texto.
 * Suficiente para imprimir o mapa em folhas (sem depender de biblioteca).
 */
export interface PdfPage {
  /** Bytes do JPEG. */
  jpeg: Uint8Array;
  /** Tamanho da imagem em pixels. */
  pxWidth: number;
  pxHeight: number;
  /** Posição e tamanho da imagem na página, em pontos (1/72 pol.), origem no canto superior esquerdo. */
  x: number;
  y: number;
  width: number;
  height: number;
  caption?: string;
}

/** A4 em pontos. */
export const A4 = { width: 595.28, height: 841.89 };
export const MM = 72 / 25.4;

export function buildPdf(pages: PdfPage[], size = A4): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  // Objetos: 1 catálogo, 2 árvore de páginas, 3 fonte; depois, por página: página, conteúdo, imagem.
  const pageObj = (i: number) => 4 + i * 3;
  const total = 3 + pages.length * 3;
  const begin = (n: number) => { offsets[n] = length; push(`${n} 0 obj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  begin(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  begin(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>\nendobj\n`);
  begin(3);
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');

  pages.forEach((p, i) => {
    const po = pageObj(i);
    const top = size.height - p.y - p.height; // PDF tem origem embaixo
    let content = `q\n${num(p.width)} 0 0 ${num(p.height)} ${num(p.x)} ${num(top)} cm\n/Im0 Do\nQ\n`;
    content += `0.6 G 0.5 w ${num(p.x)} ${num(top)} ${num(p.width)} ${num(p.height)} re S\n`;
    if (p.caption) content += `BT /F1 8 Tf 0.35 g ${num(p.x)} ${num(Math.max(8, top - 14))} Td (${pdfText(p.caption)}) Tj ET\n`;
    const contentBytes = latin1(content);
    begin(po);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(size.width)} ${num(size.height)}] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${po + 2} 0 R >> >> /Contents ${po + 1} 0 R >>\nendobj\n`);
    begin(po + 1);
    push(`<< /Length ${contentBytes.length} >>\nstream\n`);
    push(contentBytes);
    push('\nendstream\nendobj\n');
    begin(po + 2);
    push(`<< /Type /XObject /Subtype /Image /Width ${p.pxWidth} /Height ${p.pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg);
    push('\nendstream\nendobj\n');
  });

  const xref = length;
  let table = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function num(v: number) {
  return (Math.round(v * 100) / 100).toString();
}

/** Texto para o PDF: Latin-1 (acentos do português) com parênteses e barras escapados. */
function pdfText(s: string) {
  return s.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\xff]/g, '?');
}

function latin1(s: string) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Divide o mapa em folhas para impressão em escala real.
 * Retorna, para cada folha, o trecho em células (coluna/linha inicial e quantidade).
 */
export function planPrintPages(cols: number, rows: number, cellPt: number, size = A4, marginMm = 10) {
  const margin = marginMm * MM;
  const usableW = size.width - margin * 2;
  const usableH = size.height - margin * 2 - 12; // espaço para a legenda
  const perPageCols = Math.max(1, Math.floor(usableW / cellPt));
  const perPageRows = Math.max(1, Math.floor(usableH / cellPt));
  const pages: { col: number; row: number; cols: number; rows: number; x: number; y: number }[] = [];
  for (let row = 0; row < rows; row += perPageRows) {
    for (let col = 0; col < cols; col += perPageCols) {
      pages.push({ col, row, cols: Math.min(perPageCols, cols - col), rows: Math.min(perPageRows, rows - row), x: margin, y: margin + 12 });
    }
  }
  return { pages, perPageCols, perPageRows };
}
