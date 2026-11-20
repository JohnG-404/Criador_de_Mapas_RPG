import {
  ACESFilmicToneMapping, BoxGeometry, Float32BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, Color, CylinderGeometry,
  DirectionalLight, DoubleSide, Fog, Group, HemisphereLight, Matrix4, Mesh, MeshStandardMaterial, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, SphereGeometry, RepeatWrapping, Scene, SRGBColorSpace, Sprite, SpriteMaterial, Texture,
  TextureLoader, Vector3, WebGLRenderer, type Material,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDocument } from '../core/doc/MapDocument';
import { isCustomAsset, objectAsset } from '../core/doc/objects';
import { OBJECT_TEXTURE_URLS, WALL_TEXTURE_URLS } from '../render/objectTextures';
import { buildSceneData, groundHeights, type Box, type Prop, type SceneData, type WallHeight } from './sceneData';

/** Objetos de forma orgânica: as fatias afinam para cima (cúpula). */
const DOME = new Set(['arvore', 'arbusto', 'rochas', 'pedregulho', 'pedra', 'rocha-grande', 'rocha-escura', 'pedra-vermelha', 'rochas-quebradas', 'samambaia']);
const SHADES = 5;

export interface View3DOptions {
  /** Imagem do chão (terreno + grid) do mapa inteiro. */
  ground: () => HTMLCanvasElement;
  wallHeight: WallHeight;
  onReady?: () => void;
}

/**
 * Vista 3D do mapa (three.js): chão com a textura do 2D e a água afundada,
 * paredes e portas extrudadas, objetos em volume (fatias empilhadas do
 * próprio desenho) e tokens como miniaturas. Só leitura: observa o documento.
 */
export class View3D {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(45, 1, 0.05, 2000);
  private controls: OrbitControls;
  private sun = new DirectionalLight(0xfff1dc, 2.6);
  private loader = new TextureLoader();
  private textures = new Map<string, Promise<Texture>>();
  private world = new Group();
  private groundTex: CanvasTexture | null = null;
  private resize: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private rebuildTimer = 0;
  private unsub: Array<() => void> = [];
  private builds = 0;
  private disposed = false;
  private framed = false;

  constructor(private host: HTMLElement, private doc: MapDocument, private opts: View3DOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.dataset.testid = 'map-3d';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new Color(0xb9cfe0);
    this.scene.add(new HemisphereLight(0xe8f0fc, 0x6b5a46, 1.7));
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target, this.world);

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
    void this.rebuild();
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
    void this.rebuild();
  }

  setDoc(doc: MapDocument) {
    if (doc === this.doc) return;
    this.doc = doc;
    this.framed = false;
    this.watch();
    void this.rebuild();
  }

  /** Volta a câmera para a vista inicial. */
  resetCamera() {
    this.framed = false;
    this.frame(buildSceneData(this.doc, this.opts.wallHeight));
  }

  /** Redesenha a textura do chão (o grid foi ligado ou desligado). */
  refreshGround() { this.scheduleRebuild(0); }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.rebuildTimer);
    this.unsub.forEach((f) => f());
    this.resize.disconnect();
    this.controls.dispose();
    this.clearWorld();
    this.groundTex?.dispose();
    for (const p of this.textures.values()) void p.then((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private watch() {
    this.unsub.forEach((f) => f());
    const d = this.doc;
    const again = () => this.scheduleRebuild(250);
    this.unsub = [d.walls.onChange(again), d.objects.onChange(again), d.tokens.onChange(again), d.terrain.onChange(again), d.assets.onChange(again)];
  }

  private scheduleRebuild(ms: number) {
    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => void this.rebuild(), ms);
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

  private clearWorld() {
    this.world.traverse((o) => {
      if (o instanceof Mesh || o instanceof Sprite) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats as Material[]) {
          if (m instanceof SpriteMaterial) m.map?.dispose();
          m.dispose();
        }
      }
    });
    this.world.clear();
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

  private async rebuild() {
    const build = ++this.builds;
    const s = buildSceneData(this.doc, this.opts.wallHeight);
    const groundCanvas = this.opts.ground();
    // Carrega as texturas antes de trocar a cena, para não piscar.
    const wallStyles = new Set(s.boxes.map((b) => b.style));
    const wallTex = new Map<string, Texture>();
    const propTex = new Map<string, Texture>();
    await Promise.all([
      ...[...wallStyles, 'madeira'].map(async (k) => {
        const url = WALL_TEXTURE_URLS[k];
        if (url) wallTex.set(k, await this.texture(`wall:${k}`, url, true));
      }),
      ...[...new Set(s.props.map((p) => p.asset))].map(async (k) => {
        const t = this.propTexture(k);
        if (t) propTex.set(k, await t.catch(() => null as unknown as Texture));
      }),
    ]);
    if (this.disposed || build !== this.builds) return;

    this.clearWorld();
    this.groundTex?.dispose();
    this.groundTex = new CanvasTexture(groundCanvas);
    this.groundTex.colorSpace = SRGBColorSpace;
    this.groundTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.addGround(s, this.groundTex);
    this.addWalls(s.boxes, wallTex);
    for (const p of s.props) {
      const t = propTex.get(p.asset);
      if (t) this.addProp(p, t);
    }
    this.addMinis(s);
    this.placeSun(s);
    this.frame(s);
    this.dirty = true;
    this.renderer.domElement.dataset.ready = 'true';
    this.renderer.domElement.dataset.builds = String(build);
    this.opts.onReady?.();
  }

  private placeSun(s: SceneData) {
    const size = Math.max(s.width, s.depth);
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
    const segX = Math.min(400, Math.ceil(s.width * 2));
    const segZ = Math.min(400, Math.ceil(s.depth * 2));
    const g = new PlaneGeometry(s.width, s.depth, segX, segZ);
    g.rotateX(-Math.PI / 2);
    g.translate(s.width / 2, 0, s.depth / 2);
    const h = groundHeights(this.doc, segX, segZ);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, h[i]);
    g.computeVertexNormals();
    const ground = new Mesh(g, new MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    ground.receiveShadow = true;
    ground.castShadow = true;
    this.world.add(ground);

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
    this.world.add(new Mesh(skirt, new MeshStandardMaterial({ color: 0x3b3128, roughness: 1, side: DoubleSide })));

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
      this.world.add(water);
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
      groups.set(key, [...(groups.get(key) ?? []), g]);
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
      this.world.add(mesh);
    }
  }

  private addProp(p: Prop, tex: Texture) {
    const group = new Group();
    group.position.set(p.x, p.ground, p.z);
    group.rotation.y = p.rotY;
    if (p.height <= 0) {
      // Rente ao chão (tapete, imagens próprias): um plano só.
      const flat = new Mesh(
        new PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2),
        new MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      flat.position.y = 0.01;
      flat.receiveShadow = true;
      group.add(flat);
      this.world.add(group);
      return;
    }
    if (p.asset === 'tocha') {
      this.addTorch(group, p);
      this.world.add(group);
      return;
    }
    if (p.trunk) {
      const trunk = new Mesh(
        new CylinderGeometry(p.trunk.radius * 0.75, p.trunk.radius, p.trunk.height, 10),
        new MeshStandardMaterial({ color: 0x5a4230, roughness: 1 }),
      );
      trunk.position.y = p.trunk.height / 2;
      trunk.castShadow = true;
      group.add(trunk);
    }
    // Fatias empilhadas do próprio desenho: de longe parecem um volume sólido.
    const slices = Math.max(3, Math.min(28, Math.round(p.height * 20)));
    const dome = DOME.has(p.asset);
    const mats = Array.from({ length: SHADES }, (_, i) => {
      const k = 0.5 + 0.5 * (i / (SHADES - 1));
      return new MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide, roughness: 0.85, color: new Color(k, k, k) });
    });
    const plane = new PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2);
    for (let i = 0; i < slices; i++) {
      const t = slices === 1 ? 1 : i / (slices - 1);
      const mesh = new Mesh(i === 0 ? plane : plane.clone(), mats[Math.round(t * (SHADES - 1))]);
      mesh.position.y = p.base + p.height * t + 0.004;
      if (dome) {
        // Copa de árvore é mais larga um pouco acima da base; pedras e arbustos são cúpulas.
        const c = p.trunk ? 0.3 : 0;
        const sc = Math.sqrt(Math.max(0.1, 1 - ((t - c) / (1 - c + 0.08)) ** 2));
        mesh.scale.set(sc, 1, sc);
        // Gira cada fatia um pouco, para a borda não virar listras verticais.
        mesh.rotation.y = ((i * 137.5) % 360) * (Math.PI / 180);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = i === slices - 1;
      group.add(mesh);
    }
    this.world.add(group);
  }

  /** Tocha: haste de madeira com chama que brilha. */
  private addTorch(group: Group, p: Prop) {
    const k = p.height / 1.1;
    const pole = new Mesh(new CylinderGeometry(0.035 * k, 0.05 * k, 0.75 * k, 8), new MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 }));
    pole.position.y = 0.375 * k;
    pole.castShadow = true;
    const cup = new Mesh(new CylinderGeometry(0.08 * k, 0.05 * k, 0.1 * k, 10), new MeshStandardMaterial({ color: 0x2d2a27, metalness: 0.6, roughness: 0.5 }));
    cup.position.y = 0.78 * k;
    const flame = new Mesh(new SphereGeometry(0.075 * k, 12, 10), new MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a1e, emissiveIntensity: 2.2 }));
    flame.scale.y = 1.6;
    flame.position.y = 0.9 * k;
    group.add(pole, cup, flame);
  }

  private addMinis(s: SceneData) {
    const baseMat = new MeshStandardMaterial({ color: 0x23211f, roughness: 0.6 });
    for (const t of s.minis) {
      const r = t.size * 0.4;
      const base = new Mesh(new CylinderGeometry(r, r * 1.05, 0.08, 28), baseMat);
      base.position.set(t.x, t.ground + 0.04, t.z);
      const color = new Color(t.color);
      const body = new Mesh(new CapsuleGeometry(r * 0.48, t.size * 0.42, 6, 16), new MeshStandardMaterial({ color, roughness: 0.55 }));
      const bodyY = t.ground + 0.08 + r * 0.48 + t.size * 0.21;
      body.position.set(t.x, bodyY, t.z);
      for (const m of [base, body]) { m.castShadow = true; m.receiveShadow = true; this.world.add(m); }
      if (t.name) {
        const label = makeLabel(t.name);
        label.position.set(t.x, bodyY + t.size * 0.21 + r * 0.48 + 0.35, t.z);
        this.world.add(label);
      }
    }
  }
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

function makeLabel(text: string): Sprite {
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
  const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set((w / 64) * 0.32, 0.32, 1);
  s.renderOrder = 10;
  return s;
}
