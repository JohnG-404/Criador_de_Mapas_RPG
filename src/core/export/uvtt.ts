import type { MapDocument } from '../doc/MapDocument';

/**
 * Formato "Universal VTT" (.dd2vtt / .uvtt): imagem do mapa + paredes, portas
 * e luzes em unidades de célula. Importado pelo Foundry VTT (módulo Universal
 * Battlemap Importer), Roll20 (script UniversalVTTImporter), Owlbear Rodeo,
 * Fantasy Grounds e outros.
 */
export interface UvttFile {
  format: number;
  resolution: { map_origin: XY; map_size: XY; pixels_per_grid: number };
  line_of_sight: XY[][];
  objects_line_of_sight: XY[][];
  portals: { position: XY; bounds: [XY, XY]; rotation: number; closed: boolean; freestanding: boolean }[];
  environment: { baked_lighting: boolean; ambient_light: string };
  lights: { position: XY; range: number; intensity: number; color: string; shadows: boolean }[];
  image: string;
}

interface XY { x: number; y: number }

/** Objetos que viram fontes de luz na mesa virtual (alcance em células). */
const LIGHT_SOURCES: Record<string, { range: number; color: string }> = {
  tocha: { range: 6, color: 'ffffb46b' },
  fogueira: { range: 8, color: 'ffff9a4d' },
};

export function buildUvtt(doc: MapDocument, imageBase64: string, pixelsPerGrid: number): UvttFile {
  const s = doc.grid.cellSize;
  const b = doc.grid.worldBounds();
  const g = (p: XY): XY => ({ x: round(p.x / s), y: round(p.y / s) });
  const walls = doc.walls.all();
  return {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: round(b.width / s), y: round(b.height / s) }, pixels_per_grid: pixelsPerGrid },
    line_of_sight: walls.filter((w) => w.kind === 'wall').map((w) => [g(w.a), g(w.b)]),
    objects_line_of_sight: [],
    portals: walls.filter((w) => w.kind === 'door').map((d) => ({
      position: g({ x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }),
      bounds: [g(d.a), g(d.b)],
      rotation: round(Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x)),
      closed: !d.open,
      freestanding: false,
    })),
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    lights: doc.objects.all().flatMap((o) => {
      const l = LIGHT_SOURCES[o.asset];
      return l ? [{ position: g(o), range: l.range, intensity: 1, color: l.color, shadows: true }] : [];
    }),
    image: imageBase64,
  };
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
