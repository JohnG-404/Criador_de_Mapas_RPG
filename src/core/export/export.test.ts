import { describe, expect, it } from 'vitest';
import { MapDocument } from '../doc/MapDocument';
import { buildPdf, planPrintPages } from './pdf';
import { buildUvtt } from './uvtt';

describe('Universal VTT', () => {
  it('converte paredes, portas e luzes para unidades de célula', () => {
    const doc = new MapDocument({ name: 'x', gridKind: 'square', cols: 20, rows: 10, fill: 1, cellMeters: 1.5 });
    doc.walls.put('w', { id: 'w', a: { x: 0, y: 64 }, b: { x: 128, y: 64 }, kind: 'wall' });
    doc.walls.put('d', { id: 'd', a: { x: 128, y: 64 }, b: { x: 160, y: 64 }, kind: 'door', open: true });
    doc.objects.put('t', { id: 't', asset: 'tocha', x: 48, y: 48, rot: 0, scale: 1 });
    doc.objects.put('m', { id: 'm', asset: 'mesa', x: 200, y: 200, rot: 0, scale: 1 });
    const f = buildUvtt(doc, 'AAAA', 100);
    expect(f.resolution).toEqual({ map_origin: { x: 0, y: 0 }, map_size: { x: 20, y: 10 }, pixels_per_grid: 100 });
    expect(f.line_of_sight).toEqual([[{ x: 0, y: 2 }, { x: 4, y: 2 }]]);
    expect(f.portals).toHaveLength(1);
    expect(f.portals[0]).toMatchObject({ position: { x: 4.5, y: 2 }, bounds: [{ x: 4, y: 2 }, { x: 5, y: 2 }], closed: false });
    expect(f.lights).toHaveLength(1);
    expect(f.lights[0].position).toEqual({ x: 1.5, y: 1.5 });
    expect(f.image).toBe('AAAA');
  });
});

describe('PDF', () => {
  it('divide um mapa 60×40 em folhas A4 com 1 polegada por célula', () => {
    const { pages, perPageCols, perPageRows } = planPrintPages(60, 40, 72);
    expect(perPageCols).toBe(7);
    expect(perPageRows).toBe(10);
    expect(pages).toHaveLength(9 * 4);
    expect(pages.at(-1)).toMatchObject({ col: 56, row: 30, cols: 4, rows: 10 });
  });

  it('gera um PDF válido com tabela xref correta', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = buildPdf([
      { jpeg, pxWidth: 1, pxHeight: 1, x: 10, y: 10, width: 100, height: 100, caption: 'Folha 1 (colunas 1–7)' },
      { jpeg, pxWidth: 1, pxHeight: 1, x: 10, y: 10, width: 100, height: 100 },
    ]);
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // cada entrada da xref aponta para o início de "n 0 obj"
    const xrefAt = Number(text.match(/startxref\n(\d+)/)![1]);
    const entries = text.slice(xrefAt).split('\n').slice(3).filter((l) => / n $/.test(l)).map((l) => Number(l.slice(0, 10)));
    entries.forEach((off, i) => expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });
});
