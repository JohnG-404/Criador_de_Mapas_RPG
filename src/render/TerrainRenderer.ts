import { Assets, BufferImageSource, Container, Geometry, Mesh, Shader, Texture } from 'pixi.js';
import type { MapDocument } from '../core/doc/MapDocument';
import { TERRAINS, WATER_ID } from '../core/doc/terrain';
import { CHUNK_SIZE, chunkKey, type ChunkKey, type DirtyCells } from '../core/doc/TerrainLayer';
import { buildChunkMask, MASK_BLUR, MASK_LAYERS, MASK_MARGIN_CELLS, MASK_SLOTS, type ChunkMask } from './terrainMask';
import { terrainFragment, TERRAIN_VERTEX } from './terrainShader';
import { TERRAIN_TEXTURE_URLS, TEXTURE_CELLS } from './terrainTextures';

interface ChunkView {
  mesh: Mesh<Geometry, Shader>;
  sources: BufferImageSource[];
  data: Uint8Array;
  /** Terrenos ligados aos slots do shader (muda quando um terreno novo entra no chunk). */
  slotsKey: string;
}

/**
 * Desenha a camada de terreno com transição suave entre terrenos.
 * Cada chunk de 32×32 células é um quad com um shader que mistura as texturas
 * conforme uma máscara de baixa resolução (ver terrainMask.ts). Quando o
 * usuário pinta, só as máscaras dos chunks próximos são refeitas, uma vez
 * por quadro.
 */
export class TerrainRenderer {
  readonly container = new Container();
  private chunks = new Map<ChunkKey, ChunkView>();
  private textures = new Map<number, Texture>();
  private fragment = terrainFragment(MASK_SLOTS);
  private pending = new Set<ChunkKey>();
  private unsubscribe: (() => void) | null = null;
  onChange: (() => void) | null = null;

  constructor(private doc: MapDocument) {}

  async load() {
    const loaded = await Promise.all(
      TERRAINS.map(async (t) => {
        const tex = await Assets.load<Texture>(TERRAIN_TEXTURE_URLS[t.key]);
        tex.source.addressMode = 'repeat';
        tex.source.scaleMode = 'linear';
        tex.source.autoGenerateMipmaps = true;
        tex.source.updateMipmaps();
        return [t.id, tex] as const;
      }),
    );
    this.textures = new Map(loaded);
  }

  buildAll() {
    const t = this.doc.terrain;
    for (let cy = 0; cy < t.chunksY; cy++) for (let cx = 0; cx < t.chunksX; cx++) this.buildChunk(cx, cy);
    this.unsubscribe = t.onChange((_chunks, cells) => this.markDirty(cells));
  }

  /** Refaz as máscaras pendentes. Chamado pela visualização antes de desenhar. */
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
    for (const c of this.chunks.values()) {
      c.mesh.shader?.destroy();
      for (const s of c.sources) s.destroy();
    }
    this.container.destroy({ children: true });
  }

  /** Marca os chunks cuja máscara inclui as células alteradas (contando a margem e o desfoque). */
  private markDirty(cells: DirtyCells) {
    const reach = MASK_MARGIN_CELLS + Math.ceil(MASK_BLUR / 2) + 1;
    const t = this.doc.terrain;
    const cx0 = Math.max(0, Math.floor((cells.minCol - reach) / CHUNK_SIZE));
    const cx1 = Math.min(t.chunksX - 1, Math.floor((cells.maxCol + reach) / CHUNK_SIZE));
    const cy0 = Math.max(0, Math.floor((cells.minRow - reach) / CHUNK_SIZE));
    const cy1 = Math.min(t.chunksY - 1, Math.floor((cells.maxRow + reach) / CHUNK_SIZE));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.pending.add(chunkKey(cx, cy));
    this.onChange?.();
  }

  private buildChunk(cx: number, cy: number) {
    const key = chunkKey(cx, cy);
    const existing = this.chunks.get(key);
    const mask = buildChunkMask(this.doc.grid, this.doc.terrain, cx, cy, existing?.data);
    const layerSize = mask.width * mask.height * 4;
    const layer = (l: number) => mask.data.subarray(l * layerSize, (l + 1) * layerSize);
    const slotsKey = mask.slots.join(',');
    if (existing) {
      existing.sources.forEach((s, l) => { s.resource = layer(l); s.update(); });
      if (existing.slotsKey !== slotsKey) {
        const old = existing.mesh.shader;
        existing.mesh.shader = this.makeShader(existing.sources, mask);
        old?.destroy();
        existing.slotsKey = slotsKey;
      }
      return;
    }
    const sources = Array.from({ length: MASK_LAYERS }, (_, l) => new BufferImageSource({
      resource: layer(l),
      width: mask.width,
      height: mask.height,
      format: 'rgba8unorm',
      alphaMode: 'no-premultiply-alpha',
      scaleMode: 'linear',
    }));
    const { quad, maskRect } = mask;
    const u0 = (quad.x - maskRect.x) / maskRect.width;
    const v0 = (quad.y - maskRect.y) / maskRect.height;
    const u1 = (quad.x + quad.width - maskRect.x) / maskRect.width;
    const v1 = (quad.y + quad.height - maskRect.y) / maskRect.height;
    const geometry = new Geometry({
      attributes: {
        aPosition: [quad.x, quad.y, quad.x + quad.width, quad.y, quad.x + quad.width, quad.y + quad.height, quad.x, quad.y + quad.height],
        aUV: [u0, v0, u1, v0, u1, v1, u0, v1],
      },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    const shader = this.makeShader(sources, mask);
    const mesh = new Mesh({ geometry, shader });
    this.container.addChild(mesh);
    this.chunks.set(key, { mesh, sources, data: mask.data, slotsKey });
  }

  /** Shader do chunk: as máscaras dele e as texturas dos terrenos de cada slot. */
  private makeShader(sources: BufferImageSource[], mask: ChunkMask) {
    const cell = this.doc.grid.cellSize;
    const water = WATER_ID;
    const waterVec = (l: number) => [0, 1, 2, 3].map((c) => (mask.slots[l * 4 + c] === water ? 1 : 0));
    return Shader.from({
      gl: { vertex: TERRAIN_VERTEX, fragment: this.fragment, name: 'terrain-blend' },
      resources: {
        ...Object.fromEntries(sources.map((s, l) => [`uMask${l + 1}`, s])),
        ...Object.fromEntries(Array.from({ length: MASK_SLOTS }, (_, k) => {
          const tex = this.textures.get(mask.slots[k]) ?? Texture.WHITE;
          return [`uTex${k + 1}`, tex.source];
        })),
        terrainUniforms: {
          uTexScale: { value: TEXTURE_CELLS * cell, type: 'f32' },
          uCell: { value: cell, type: 'f32' },
          ...Object.fromEntries(Array.from({ length: MASK_LAYERS }, (_, l) => [`uWater${l + 1}`, { value: new Float32Array(waterVec(l)), type: 'vec4<f32>' }])),
        },
      },
    });
  }
}
