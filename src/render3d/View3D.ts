import {
  ACESFilmicToneMapping, BoxGeometry, Float32BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color, CylinderGeometry,
  DirectionalLight, DoubleSide, Fog, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, Quaternion, RepeatWrapping, Scene, SRGBColorSpace, Sprite, SpriteMaterial, Texture,
  TextureLoader, Vector3, WebGLRenderer, type Material, type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDocument } from '../core/doc/MapDocument';
import { isCustomAsset, objectAsset } from '../core/doc/objects';
import { OBJECT_TEXTURE_URLS, WALL_TEXTURE_URLS } from '../render/objectTextures';
import { TOKEN_ART_URLS } from '../render/tokenArt';
import { PropBuilder } from './props3d';
import { buildSceneData, groundHeights, type Box, type SceneData, type WallHeight } from './sceneData';

export interface View3DOptions {
  /** Imagem do chão (terreno + grid) do mapa inteiro. */
  ground: () => HTMLCanvasElement;
  wallHeight: WallHeight;
  onReady?: () => void;
}

/** Partes da cena que são refeitas separadamente. */
type Layer = 'ground' | 'walls' | 'props' | 'minis';
const ALL_LAYERS: Layer[] = ['ground', 'walls', 'props', 'minis'];

/** Espera (ms) depois de uma edição antes de refazer cada camada: o chão é o mais caro. */
const DELAY: Record<Layer, number> = { ground: 250, walls: 120, props: 120, minis: 30 };

/** Maior densidade de pixels usada na vista 3D (telas 4K/retina pesam muito acima disso). */
const MAX_PIXEL_RATIO = 1.5;

/**
 * Vista 3D do mapa (three.js): chão com a textura do 2D e a água afundada,
 * paredes e portas extrudadas, objetos em volume (fatias empilhadas do
 * próprio desenho) e tokens como miniaturas. Só leitura: observa o documento.
 *
 * Desempenho: a cena é dividida em camadas (chão, paredes, objetos,
 * miniaturas) e cada edição refaz só a camada afetada; objetos iguais são
 * desenhados de uma vez (instancing); a luz do sol é fixa, então o mapa de
 * sombras só é recalculado quando a cena muda, não a cada quadro.
 */
export class View3D {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(45, 1, 0.05, 2000);
  private controls: OrbitControls;
  private sun = new DirectionalLight(0xfff1dc, 2.6);
  private loader = new TextureLoader();
  private textures = new Map<string, Promise<Texture>>();
  private layers: Record<Layer, Group> = { ground: new Group(), walls: new Group(), props: new Group(), minis: new Group() };
  private props = new PropBuilder();
  private shared = new SharedMinis();
  private labels = new Map<string, CanvasTexture>();
  private groundTex: CanvasTexture | null = null;
  private resize: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private pending = new Set<Layer>();
  private rebuildTimer = 0;
  private rebuildAt = Infinity;
  private building = false;
  private unsub: Array<() => void> = [];
  private builds = 0;
  private disposed = false;
  private framed = false;
  private sunSize = -1;

  constructor(private host: HTMLElement, private doc: MapDocument, private opts: View3DOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // O sol não se move: as sombras só mudam quando a cena muda (ver rebuild).
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.dataset.testid = 'map-3d';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new Color(0xb9cfe0);
    this.scene.add(new HemisphereLight(0xe8f0fc, 0x6b5a46, 1.7));
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, ...ALL_LAYERS.map((k) => this.layers[k]));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = 1.42;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('change', () => { this.dirty = true; });

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.watch();
    this.schedule(ALL_LAYERS, 0);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); }
    };
    loop();
  }

  setWallHeight(h: WallHeight) {
    if (h === this.opts.wallHeight) return;
    this.opts.wallHeight = h;
    this.schedule(['walls'], 0);
  }

  setDoc(doc: MapDocument) {
    if (doc === this.doc) return;
    this.doc = doc;
    this.framed = false;
    this.watch();
    this.schedule(ALL_LAYERS, 0);
  }

  /** Volta a câmera para a vista inicial. */
  resetCamera() {
    this.framed = false;
    this.frame(buildSceneData(this.doc, this.opts.wallHeight));
  }

  /** Redesenha a textura do chão (o grid foi ligado ou desligado). */
  refreshGround() { this.schedule(['ground'], 0); }

  /** Refaz a cena inteira agora (usado pelos testes de desempenho). */
  rebuildAll() {
    for (const l of ALL_LAYERS) this.pending.add(l);
    return this.flush();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.rebuildTimer);
    this.unsub.forEach((f) => f());
    this.resize.disconnect();
    this.controls.dispose();
    for (const k of ALL_LAYERS) this.clearLayer(k);
    this.props.dispose();
    this.shared.dispose();
    this.labels.forEach((t) => t.dispose());
    this.groundTex?.dispose();
    for (const p of this.textures.values()) void p.then((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private watch() {
    this.unsub.forEach((f) => f());
    const d = this.doc;
    // Terreno e relevo mudam a altura de tudo que está em cima do chão.
    this.unsub = [
      d.walls.onChange(() => this.schedule(['walls'])),
      d.objects.onChange(() => this.schedule(['props'])),
      d.assets.onChange(() => this.schedule(['props'])),
      d.tokens.onChange(() => this.schedule(['minis'])),
      d.terrain.onChange(() => this.schedule(ALL_LAYERS)),
      d.elevation.onChange(() => this.schedule(ALL_LAYERS)),
    ];
  }

  /**
   * Agenda a reconstrução das camadas. Edições seguidas se juntam numa só;
   * a espera é a menor entre as camadas pendentes.
   */
  private schedule(layers: Layer[], ms?: number) {
    for (const l of layers) this.pending.add(l);
    const wait = ms ?? Math.min(...layers.map((l) => DELAY[l]));
    const at = performance.now() + wait;
    if (at >= this.rebuildAt) return;
    this.rebuildAt = at;
    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildAt = Infinity;
      void this.flush();
    }, wait);
  }

  /** Refaz as camadas pendentes, uma reconstrução por vez. */
  private async flush() {
    if (this.building || !this.pending.size) return;
    const todo = new Set(this.pending);
    this.pending.clear();
    this.building = true;
    try {
      await this.rebuild(todo);
    } finally {
      this.building = false;
    }
    // Edições que chegaram durante a reconstrução e cujo prazo já passou.
    if (this.pending.size && this.rebuildAt === Infinity) void this.flush();
  }

  private fit() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private frame(s: SceneData) {
    if (this.framed) return;
    this.framed = true;
    const size = Math.max(s.width, s.depth);
    const c = new Vector3(s.width / 2, 0, s.depth / 2);
    this.controls.target.copy(c);
    this.camera.position.set(c.x - size * 0.05, size * 0.5, c.z + size * 0.58);
    this.camera.far = size * 8;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = 2;
    this.controls.maxDistance = size * 2.5;
    this.scene.fog = new Fog(0xb9cfe0, size * 1.6, size * 4);
    this.controls.update();
    this.dirty = true;
  }

  private clearLayer(layer: Layer) {
    const g = this.layers[layer];
    g.traverse((o) => {
      if (!(o instanceof Mesh || o instanceof Sprite)) return;
      if (o instanceof InstancedMesh) o.dispose();
      // A geometria dos sprites é única e global no three.js.
      if (!(o instanceof Sprite) && !o.geometry.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats as Material[]) if (!m.userData.shared) m.dispose();
    });
    g.clear();
  }

  private texture(key: string, url: string, repeat = false): Promise<Texture> {
    let p = this.textures.get(key);
    if (!p) {
      p = this.loader.loadAsync(url).then((t) => {
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
        return t;
      });
      this.textures.set(key, p);
    }
    return p;
  }

  private propTexture(asset: string): Promise<Texture> | null {
    if (isCustomAsset(asset)) {
      const a = objectAsset(asset) as { data?: string } | undefined;
      return a?.data ? this.texture(asset, a.data) : null;
    }
    const url = OBJECT_TEXTURE_URLS[asset];
    return url ? this.texture(asset, url) : null;
  }

  private async rebuild(layers: Set<Layer>) {
    const build = ++this.builds;
    const s = buildSceneData(this.doc, this.opts.wallHeight);
    const groundCanvas = layers.has('ground') ? this.opts.ground() : null;
    // Carrega as texturas antes de trocar a cena, para não piscar.
    const wallTex = new Map<string, Texture>();
    const propTex = new Map<string, Texture>();
    const tokenTex = new Map<string, Texture>();
    await Promise.all([
      ...(layers.has('walls') ? [...new Set(s.boxes.map((b) => b.style)), 'madeira'] : []).map(async (k) => {
        const url = WALL_TEXTURE_URLS[k];
        if (url) wallTex.set(k, await this.texture(`wall:${k}`, url, true));
      }),
      ...(layers.has('props') ? [...new Set(s.props.map((p) => p.asset))] : []).map(async (k) => {
        const t = this.propTexture(k);
        const tex = t && await t.catch(() => null);
        if (tex) propTex.set(k, tex);
      }),
      ...(layers.has('minis') ? [...new Set(s.minis.map((m) => m.art).filter((k): k is string => !!k))] : []).map(async (k) => {
        const t = TOKEN_ART_URLS[k] ? this.texture(`token:${k}`, TOKEN_ART_URLS[k]) : this.propTexture(k);
        const tex = t && await t.catch(() => null);
        if (tex) tokenTex.set(k, tex);
      }),
    ]);
    if (this.disposed) return;

    if (groundCanvas) {
      this.clearLayer('ground');
      this.groundTex?.dispose();
      this.groundTex = new CanvasTexture(groundCanvas);
      this.groundTex.colorSpace = SRGBColorSpace;
      this.groundTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.addGround(s, this.groundTex);
      this.placeSun(s);
    }
    if (layers.has('walls')) { this.clearLayer('walls'); this.addWalls(s.boxes, wallTex); }
    if (layers.has('props')) { this.clearLayer('props'); this.add('props', this.props.build(s.props, propTex)); }
    if (layers.has('minis')) { this.clearLayer('minis'); this.addMinis(s, tokenTex); }
    this.frame(s);
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
    const el = this.renderer.domElement;
    el.dataset.ready = 'true';
    el.dataset.builds = String(build);
    el.dataset.layers = [...layers].join(' ');
    this.opts.onReady?.();
  }

  private add(layer: Layer, objs: Object3D[]) {
    if (objs.length) this.layers[layer].add(...objs);
  }

  private placeSun(s: SceneData) {
    const size = Math.max(s.width, s.depth);
    if (size === this.sunSize) return;
    this.sunSize = size;
    const c = new Vector3(s.width / 2, 0, s.depth / 2);
    // Sol da tarde, vindo do sudoeste: ilumina as faces voltadas para a câmera inicial.
    this.sun.position.set(c.x - size * 0.6, size * 0.75, c.z + size * 0.3);
    this.sun.target.position.copy(c);
    const cam = this.sun.shadow.camera;
    const half = size * 0.75;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 0.5; cam.far = size * 3;
    cam.updateProjectionMatrix();
    const res = size > 90 ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== res) {
      this.sun.shadow.mapSize.set(res, res);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  private addGround(s: SceneData, tex: Texture) {
    // Chão plano e sem água: dois triângulos bastam (e não precisa calcular alturas).
    const flat = !s.water.length && !s.hasRelief;
    const segX = flat ? 1 : Math.min(400, Math.ceil(s.width * 2));
    const segZ = flat ? 1 : Math.min(400, Math.ceil(s.depth * 2));
    const g = new PlaneGeometry(s.width, s.depth, segX, segZ);
    g.rotateX(-Math.PI / 2);
    g.translate(s.width / 2, 0, s.depth / 2);
    const h = flat ? new Float32Array((segX + 1) * (segZ + 1)) : groundHeights(this.doc, segX, segZ);
    if (!flat) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, h[i]);
      g.computeVertexNormals();
    }
    const ground = new Mesh(g, new MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    ground.receiveShadow = true;
    // Plano não faz sombra em nada; com relevo, os morros fazem.
    ground.castShadow = !flat;
    this.layers.ground.add(ground);

    // Laterais do tabuleiro: uma faixa em cada borda, do chão até o fundo.
    const bottom = s.minHeight - 0.6;
    const verts: number[] = [];
    const idx: number[] = [];
    const edge = (pts: Array<[number, number, number]>) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, z0, y0] = pts[k], [x1, z1, y1] = pts[k + 1];
        const v = verts.length / 3;
        verts.push(x0, y0, z0, x1, y1, z1, x1, bottom, z1, x0, bottom, z0);
        idx.push(v, v + 2, v + 1, v, v + 3, v + 2, v, v + 1, v + 2, v, v + 2, v + 3);
      }
    };
    const at = (i: number, j: number): [number, number, number] => [(i / segX) * s.width, (j / segZ) * s.depth, h[j * (segX + 1) + i]];
    edge(Array.from({ length: segX + 1 }, (_, i) => at(i, 0)));
    edge(Array.from({ length: segX + 1 }, (_, i) => at(i, segZ)));
    edge(Array.from({ length: segZ + 1 }, (_, j) => at(0, j)));
    edge(Array.from({ length: segZ + 1 }, (_, j) => at(segX, j)));
    const skirt = new BufferGeometry();
    skirt.setAttribute('position', new Float32BufferAttribute(verts, 3));
    skirt.setIndex(idx);
    skirt.computeVertexNormals();
    this.layers.ground.add(new Mesh(skirt, new MeshStandardMaterial({ color: 0x3b3128, roughness: 1, side: DoubleSide })));

    if (s.water.length) {
      // Superfície da água célula a célula, na altura de cada uma.
      const wv: number[] = [];
      const wi: number[] = [];
      for (const w of s.water) {
        const v0 = wv.length / 3;
        for (const [x, z] of w.poly) wv.push(x, w.y, z);
        for (let k = 1; k < w.poly.length - 1; k++) wi.push(v0, v0 + k + 1, v0 + k);
      }
      const wg = new BufferGeometry();
      wg.setAttribute('position', new Float32BufferAttribute(wv, 3));
      wg.setIndex(wi);
      wg.computeVertexNormals();
      const water = new Mesh(wg, new MeshStandardMaterial({ color: 0x356f78, transparent: true, opacity: 0.42, roughness: 0.08, metalness: 0.15, depthWrite: false, side: DoubleSide }));
      water.receiveShadow = true;
      this.layers.ground.add(water);
    }
  }

  private addWalls(boxes: Box[], tex: Map<string, Texture>) {
    const groups = new Map<string, BufferGeometry[]>();
    const m = new Matrix4();
    for (const b of boxes) {
      const g = new BoxGeometry(b.len, b.height, b.thick);
      scaleBoxUv(g, b.len, b.height, b.thick);
      m.makeRotationY(b.rotY).setPosition(b.x, b.y0 + b.height / 2, b.z);
      g.applyMatrix4(m);
      const key = b.kind === 'door' ? 'door' : `${b.kind}:${b.style}`;
      const list = groups.get(key);
      if (list) list.push(g); else groups.set(key, [g]);
    }
    for (const [key, geos] of groups) {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const [kind, style] = key.split(':');
      const mat = kind === 'door'
        ? new MeshStandardMaterial({ map: tex.get('madeira') ?? null, color: 0xe0a978, roughness: 0.75 })
        : new MeshStandardMaterial({ map: tex.get(style) ?? null, color: kind === 'jamb' ? 0x9a9184 : 0xffffff, roughness: 0.9 });
      const mesh = new Mesh(merged, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.layers.walls.add(mesh);
    }
  }

  /**
   * Miniaturas, instanciadas: as fichas sem retrato (base + corpo) e as com
   * retrato (disco na cor do token + a arte deitada no topo, um grupo por
   * modelo). A cor de cada token vai por instância. Os nomes são sprites.
   */
  private addMinis(s: SceneData, art: Map<string, Texture>) {
    if (!s.minis.length) return;
    const plain = s.minis.filter((t) => !(t.art && art.get(t.art)));
    const portrait = s.minis.filter((t) => t.art && art.get(t.art));
    const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), color = new Color();
    const finish = (im: InstancedMesh, shadows: boolean) => {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = im.receiveShadow = shadows;
      this.layers.minis.add(im);
    };
    if (plain.length) {
      const base = new InstancedMesh(this.shared.baseGeo, this.shared.baseMat, plain.length);
      const body = new InstancedMesh(this.shared.bodyGeo, this.shared.bodyMat, plain.length);
      plain.forEach((t, i) => {
        const k = t.size;
        base.setMatrixAt(i, m.compose(pos.set(t.x, t.ground, t.z), q, sc.set(k, 1, k)));
        body.setMatrixAt(i, m.compose(pos.set(t.x, t.ground, t.z), q, sc.set(k, k, k)));
        body.setColorAt(i, color.set(t.color));
      });
      finish(base, true);
      finish(body, true);
    }
    if (portrait.length) {
      const disc = new InstancedMesh(this.shared.discGeo, this.shared.discMat, portrait.length);
      portrait.forEach((t, i) => {
        disc.setMatrixAt(i, m.compose(pos.set(t.x, t.ground, t.z), q, sc.set(t.size, 1, t.size)));
        disc.setColorAt(i, color.set(t.color));
      });
      finish(disc, true);
      const byTemplate = new Map<string, typeof portrait>();
      for (const t of portrait) { const l = byTemplate.get(t.art!); if (l) l.push(t); else byTemplate.set(t.art!, [t]); }
      for (const [key, list] of byTemplate) {
        const face = new InstancedMesh(this.shared.faceGeo, this.shared.faceMaterial(key, art.get(key)!), list.length);
        list.forEach((t, i) => face.setMatrixAt(i, m.compose(pos.set(t.x, t.ground, t.z), q, sc.set(t.size, 1, t.size))));
        finish(face, false);
      }
    }
    const used = new Set<string>();
    for (const t of s.minis) {
      if (!t.name) continue;
      const withArt = !!(t.art && art.get(t.art));
      // Topo da ficha: disco de 0,12; ou base de 0,08 + cápsula (0,42 + 2 × 0,192 do tamanho).
      const top = t.ground + (withArt ? 0.12 + 0.1 : 0.08 + t.size * (0.42 + 0.384));
      const label = this.label(t.name);
      label.position.set(t.x, top + 0.35, t.z);
      this.layers.minis.add(label);
      used.add(t.name);
    }
    // Esquece as etiquetas de nomes que sumiram do mapa.
    for (const [name, tex] of this.labels) if (!used.has(name)) { tex.dispose(); this.labels.delete(name); }
  }

  /** Etiqueta com o nome; a textura de cada nome é guardada entre reconstruções. */
  private label(text: string): Sprite {
    let tex = this.labels.get(text);
    if (!tex) { tex = makeLabelTexture(text); this.labels.set(text, tex); }
    const w = tex.image.width as number;
    const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false }));
    s.scale.set((w / 64) * 0.32, 0.32, 1);
    s.renderOrder = 10;
    return s;
  }
}

/**
 * Geometrias e materiais das miniaturas em escala 1 (token de 1 célula),
 * criados uma vez e reaproveitados. Para tokens com arte, este é o lugar
 * de um disco texturizado no topo da base.
 */
class SharedMinis {
  readonly baseGeo = shared(new CylinderGeometry(0.4, 0.42, 0.08, 28).translate(0, 0.04, 0));
  readonly bodyGeo = shared(new CapsuleGeometry(0.192, 0.42, 6, 16).translate(0, 0.08 + 0.192 + 0.21, 0));
  readonly baseMat = shared(new MeshStandardMaterial({ color: 0x23211f, roughness: 0.6 }));
  readonly bodyMat = shared(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }));
  /** Ficha com retrato: disco (cor por instância) e a arte por cima. */
  readonly discGeo = shared(new CylinderGeometry(0.4, 0.416, 0.12, 36).translate(0, 0.06, 0));
  readonly discMat = shared(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  readonly faceGeo = shared(new CircleGeometry(0.352, 36).rotateX(-Math.PI / 2).translate(0, 0.123, 0));
  private faces = new Map<string, MeshStandardMaterial>();

  faceMaterial(key: string, map: Texture) {
    let mat = this.faces.get(key);
    if (!mat) {
      mat = shared(new MeshStandardMaterial({ map, transparent: true, alphaTest: 0.05, roughness: 0.7 }));
      this.faces.set(key, mat);
    }
    return mat;
  }

  dispose() {
    for (const x of [this.baseGeo, this.bodyGeo, this.baseMat, this.bodyMat, this.discGeo, this.discMat, this.faceGeo, ...this.faces.values()]) x.dispose();
  }
}

function shared<T extends BufferGeometry | Material>(x: T): T {
  x.userData.shared = true;
  return x;
}

/** UVs da caixa proporcionais ao tamanho: a textura cobre 2 × 2 células, como no 2D. */
function scaleBoxUv(g: BoxGeometry, len: number, height: number, thick: number) {
  const uv = g.attributes.uv;
  // Ordem das faces: +x, -x, +y, -y, +z, -z (4 vértices cada).
  const dims: Array<[number, number]> = [[thick, height], [thick, height], [len, thick], [len, thick], [len, height], [len, height]];
  for (let f = 0; f < 6; f++) {
    const [u, v] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * u) / 2, (uv.getY(i) * v) / 2);
    }
  }
}

function makeLabelTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '600 44px system-ui, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 36;
  c.width = w;
  c.height = 64;
  g.font = font;
  g.fillStyle = 'rgba(20, 18, 16, 0.78)';
  g.beginPath();
  g.roundRect(0, 0, w, 64, 18);
  g.fill();
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, 18, 34);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
