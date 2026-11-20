import { MapDocument, type NewMapOptions } from './MapDocument';
import type { MapObject, Note, Token } from './objects';
import { DEFAULT_VISION, OBJECT_ASSETS } from './objects';
import { styleField, type WallSegment } from './walls';

/** Formato do arquivo .rpgmap (JSON). */
export interface MapFile {
  format: typeof FORMAT;
  version: number;
  options: NewMapOptions;
  /** Camadas de células comprimidas (RLE + base64). */
  terrain: string;
  fog: string;
  walls: WallSegment[];
  objects: MapObject[];
  tokens: Token[];
  notes?: Note[];
}

export const FORMAT = 'atlas-board-map';
export const VERSION = 1;
export const MAP_EXTENSION = '.rpgmap';
const MAX_SIDE = 1000;

export function serializeDoc(doc: MapDocument): MapFile {
  return {
    format: FORMAT,
    version: VERSION,
    options: { ...doc.options },
    terrain: encodeLayer(doc.terrain.toArray()),
    fog: encodeLayer(doc.fog.toArray()),
    walls: doc.walls.all(),
    objects: doc.objects.all(),
    tokens: doc.tokens.all(),
    notes: doc.notes.all(),
  };
}

export function docToJson(doc: MapDocument) {
  return JSON.stringify(serializeDoc(doc));
}

/** Lê um arquivo .rpgmap. Lança um Error com mensagem em português se o arquivo não servir. */
export function parseMap(text: string | MapFile): MapDocument {
  let f: MapFile;
  try {
    f = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('O arquivo não é um mapa do Atlas Board (JSON inválido).');
  }
  if (!f || f.format !== FORMAT) throw new Error('O arquivo não é um mapa do Atlas Board.');
  if (typeof f.version !== 'number' || f.version > VERSION) {
    throw new Error('Este mapa foi salvo numa versão mais nova do Atlas Board.');
  }
  const o = f.options;
  if (!o || (o.gridKind !== 'square' && o.gridKind !== 'hex') || !validSide(o.cols) || !validSide(o.rows)) {
    throw new Error('O tamanho ou o tipo de grid do mapa é inválido.');
  }
  const options: NewMapOptions = {
    name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 80) : 'Mapa sem título',
    gridKind: o.gridKind,
    cols: o.cols,
    rows: o.rows,
    fill: Number(o.fill) || 0,
    cellMeters: Number(o.cellMeters) > 0 ? Number(o.cellMeters) : 1.5,
  };
  const doc = new MapDocument(options);
  const n = options.cols * options.rows;
  doc.terrain.loadArray(decodeLayer(f.terrain, n));
  doc.fog.loadArray(f.fog ? decodeLayer(f.fog, n) : new Uint8Array(n));
  for (const w of arr(f.walls)) {
    if (isPoint(w?.a) && isPoint(w?.b) && typeof w.id === 'string') {
      const kind = w.kind === 'door' ? 'door' : 'wall';
      doc.walls.put(w.id, { id: w.id, a: w.a, b: w.b, kind, ...(kind === 'door' && w.open ? { open: true } : {}), ...(kind === 'wall' ? styleField(w.style) : {}) });
    }
  }
  const assets = new Set(OBJECT_ASSETS.map((a) => a.key));
  for (const ob of arr(f.objects)) {
    if (typeof ob?.id === 'string' && assets.has(ob.asset) && finite(ob.x) && finite(ob.y)) {
      doc.objects.put(ob.id, { id: ob.id, asset: ob.asset, x: ob.x, y: ob.y, rot: finite(ob.rot) ? ob.rot : 0, scale: finite(ob.scale) && ob.scale > 0 ? ob.scale : 1 });
    }
  }
  for (const t of arr(f.tokens)) {
    if (typeof t?.id === 'string' && finite(t.x) && finite(t.y)) {
      doc.tokens.put(t.id, {
        id: t.id, x: t.x, y: t.y,
        name: typeof t.name === 'string' ? t.name.slice(0, 24) : '?',
        size: finite(t.size) && t.size > 0 ? t.size : 1,
        color: typeof t.color === 'string' && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#888888',
        ...(t.pc ? { pc: true, vision: finite(t.vision) && t.vision > 0 ? Math.min(60, t.vision) : DEFAULT_VISION } : {}),
      });
    }
  }
  for (const n of arr(f.notes)) {
    if (typeof n?.id === 'string' && finite(n.x) && finite(n.y)) {
      doc.notes.put(n.id, { id: n.id, x: n.x, y: n.y, text: typeof n.text === 'string' ? n.text.slice(0, 2000) : '' });
    }
  }
  return doc;
}

/**
 * Comprime uma camada: pares (valor, repetições) com repetições em varint,
 * depois base64. Mapas com áreas grandes do mesmo terreno ficam pequenos.
 */
export function encodeLayer(data: Uint8Array): string {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const v = data[i];
    let run = 1;
    while (i + run < data.length && data[i + run] === v) run++;
    out.push(v);
    let r = run;
    while (r >= 0x80) { out.push((r & 0x7f) | 0x80); r >>>= 7; }
    out.push(r);
    i += run;
  }
  return toBase64(Uint8Array.from(out));
}

export function decodeLayer(text: string, length: number): Uint8Array {
  const bytes = fromBase64(text);
  const out = new Uint8Array(length);
  let o = 0;
  let i = 0;
  while (i < bytes.length) {
    const v = bytes[i++];
    let run = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length) throw new Error('Camada do mapa corrompida.');
      const b = bytes[i++];
      run += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) break;
      shift += 7;
    }
    if (o + run > length) throw new Error('Camada do mapa corrompida.');
    out.fill(v, o, o + run);
    o += run;
  }
  if (o !== length) throw new Error('Camada do mapa corrompida.');
  return out;
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string) {
  let s: string;
  try { s = atob(text); } catch { throw new Error('Camada do mapa corrompida.'); }
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function validSide(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_SIDE;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arr(v: unknown): any[] { return Array.isArray(v) ? v : []; }
function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function isPoint(p: unknown): p is { x: number; y: number } {
  return !!p && finite((p as { x: unknown }).x) && finite((p as { y: unknown }).y);
}

/** Nome de arquivo seguro a partir do nome do mapa. */
export function mapFileName(name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return (base || 'mapa') + MAP_EXTENSION;
}
