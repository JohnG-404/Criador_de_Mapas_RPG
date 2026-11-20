import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial,
  PlaneGeometry, Quaternion, SphereGeometry, Vector3, type Material, type Object3D, type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Prop } from './sceneData';

/** Objetos de forma orgânica: as fatias afinam para cima (cúpula). */
const DOME = new Set(['arvore', 'arbusto', 'rochas', 'pedregulho', 'pedra', 'rocha-grande', 'rocha-escura', 'pedra-vermelha', 'rochas-quebradas', 'samambaia']);
const SHADES = 5;
const Y_AXIS = new Vector3(0, 1, 0);

/** Quantas fatias empilhadas um objeto dessa altura recebe. */
export function sliceCount(height: number) {
  return Math.max(3, Math.min(28, Math.round(height * 20)));
}

/**
 * Monta os objetos do mapa com poucas chamadas de desenho: objetos iguais
 * (mesmo desenho e mesmo número de fatias) viram um InstancedMesh só, e as
 * fatias de cada um ficam numa geometria única, com o sombreado por vértice.
 * Antes eram até 28 malhas e 5 materiais por objeto.
 */
export class PropBuilder {
  private materials = new Map<string, Material>();
  private geometries = new Map<string, BufferGeometry>();

  build(props: Prop[], tex: Map<string, Texture>): Object3D[] {
    const groups = new Map<string, Prop[]>();
    const push = (k: string, p: Prop) => { const a = groups.get(k); if (a) a.push(p); else groups.set(k, [p]); };
    for (const p of props) {
      if (p.asset === 'tocha' && p.height > 0) { push('torch', p); continue; }
      if (!tex.get(p.asset)) continue;
      if (p.height <= 0) { push(`flat|${p.asset}`, p); continue; }
      if (p.trunk) push('trunk', p);
      const ratio = p.base > 0 ? (p.base / p.height).toFixed(2) : '0';
      push(`slices|${p.asset}|${sliceCount(p.height)}|${ratio}|${p.trunk ? 1 : 0}`, p);
    }
    const out: Object3D[] = [];
    for (const [key, list] of groups) {
      const [kind, asset, n, ratio, trunk] = key.split('|');
      if (kind === 'torch') out.push(...this.torches(list));
      else if (kind === 'trunk') out.push(this.trunks(list));
      else if (kind === 'flat') out.push(this.flats(asset, list, tex.get(asset)!));
      else out.push(...this.sliced(asset, Number(n), Number(ratio), trunk === '1', list, tex.get(asset)!));
    }
    return out;
  }

  /** Libera tudo que fica guardado entre reconstruções. */
  dispose() {
    this.materials.forEach((m) => m.dispose());
    this.geometries.forEach((g) => g.dispose());
    this.materials.clear();
    this.geometries.clear();
  }

  private material(key: string, make: () => Material): Material {
    let m = this.materials.get(key);
    if (!m) { m = make(); m.userData.shared = true; this.materials.set(key, m); }
    return m;
  }

  private geometry(key: string, make: () => BufferGeometry): BufferGeometry {
    let g = this.geometries.get(key);
    if (!g) { g = make(); g.userData.shared = true; this.geometries.set(key, g); }
    return g;
  }

  private instanced(geo: BufferGeometry, mat: Material, list: Prop[], place: (p: Prop, m: Matrix4) => void, cast: boolean, receive: boolean) {
    const mesh = new InstancedMesh(geo, mat, list.length);
    const m = new Matrix4();
    list.forEach((p, i) => { place(p, m); mesh.setMatrixAt(i, m); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    return mesh;
  }

  private sliced(asset: string, n: number, ratio: number, trunk: boolean, list: Prop[], tex: Texture): InstancedMesh[] {
    const mat = this.material(`slice|${asset}`, () => new MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide, roughness: 0.85, vertexColors: true }));
    const dome = DOME.has(asset);
    // Corpo (todas as fatias menos a de cima) só projeta sombra; a de cima também recebe, como antes.
    const body = this.geometry(`slices|${asset}|${n}|${ratio}|${trunk}|body`, () => sliceGeometry(n, ratio, dome, trunk, 0, n - 1));
    const top = this.geometry(`slices|${asset}|${n}|${ratio}|${trunk}|top`, () => sliceGeometry(n, ratio, dome, trunk, n - 1, n));
    const q = new Quaternion(), pos = new Vector3(), sc = new Vector3();
    const place = (p: Prop, m: Matrix4) => {
      q.setFromAxisAngle(Y_AXIS, p.rotY);
      m.compose(pos.set(p.x, p.ground + 0.004, p.z), q, sc.set(p.w, p.height, p.d));
    };
    return [this.instanced(body, mat, list, place, true, false), this.instanced(top, mat, list, place, true, true)];
  }

  private trunks(list: Prop[]): InstancedMesh {
    const geo = this.geometry('trunk', () => new CylinderGeometry(0.75, 1, 1, 10).translate(0, 0.5, 0));
    const mat = this.material('trunk', () => new MeshStandardMaterial({ color: 0x5a4230, roughness: 1 }));
    const q = new Quaternion(), pos = new Vector3(), sc = new Vector3();
    return this.instanced(geo, mat, list, (p, m) => {
      const t = p.trunk!;
      m.compose(pos.set(p.x, p.ground, p.z), q, sc.set(t.radius, t.height, t.radius));
    }, true, false);
  }

  private flats(asset: string, list: Prop[], tex: Texture): InstancedMesh {
    const geo = this.geometry('flat', () => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    const mat = this.material(`flat|${asset}`, () => new MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.02, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    const q = new Quaternion(), pos = new Vector3(), sc = new Vector3();
    return this.instanced(geo, mat, list, (p, m) => {
      q.setFromAxisAngle(Y_AXIS, p.rotY);
      m.compose(pos.set(p.x, p.ground + 0.01, p.z), q, sc.set(p.w, 1, p.d));
    }, false, true);
  }

  /** Tocha: haste de madeira com chama que brilha. Geometria em escala 1 (altura 1,1). */
  private torches(list: Prop[]): InstancedMesh[] {
    const parts: Array<[string, () => BufferGeometry, () => Material, boolean]> = [
      ['torch-pole', () => new CylinderGeometry(0.035, 0.05, 0.75, 8).translate(0, 0.375, 0), () => new MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 }), true],
      ['torch-cup', () => new CylinderGeometry(0.08, 0.05, 0.1, 10).translate(0, 0.78, 0), () => new MeshStandardMaterial({ color: 0x2d2a27, metalness: 0.6, roughness: 0.5 }), false],
      ['torch-flame', () => new SphereGeometry(0.075, 12, 10).scale(1, 1.6, 1).translate(0, 0.9, 0), () => new MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a1e, emissiveIntensity: 2.2 }), false],
    ];
    const q = new Quaternion(), pos = new Vector3(), sc = new Vector3();
    const place = (p: Prop, m: Matrix4) => {
      const k = p.height / 1.1;
      q.setFromAxisAngle(Y_AXIS, p.rotY);
      m.compose(pos.set(p.x, p.ground, p.z), q, sc.set(k, k, k));
    };
    return parts.map(([key, geo, mat, cast]) => this.instanced(this.geometry(key, geo), this.material(key, mat), list, place, cast, false));
  }
}

/**
 * Fatias [from, to) de um objeto em escala unitária (1 × 1 de base, 1 de altura),
 * numa geometria só. A cor de cada vértice escurece as fatias de baixo.
 */
export function sliceGeometry(n: number, ratio: number, dome: boolean, trunk: boolean, from: number, to: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3();
  const shade = new Color();
  for (let i = from; i < to; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    let s = 1, rot = 0;
    if (dome) {
      // Copa de árvore é mais larga um pouco acima da base; pedras e arbustos são cúpulas.
      const c = trunk ? 0.3 : 0;
      s = Math.sqrt(Math.max(0.1, 1 - ((t - c) / (1 - c + 0.08)) ** 2));
      // Gira cada fatia um pouco, para a borda não virar listras verticais.
      rot = ((i * 137.5) % 360) * (Math.PI / 180);
    }
    q.setFromAxisAngle(Y_AXIS, rot);
    m.compose(pos.set(0, ratio + t, 0), q, sc.set(s, 1, s));
    g.applyMatrix4(m);
    const k = 0.5 + 0.5 * (Math.round(t * (SHADES - 1)) / (SHADES - 1));
    shade.setRGB(k, k, k);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let v = 0; v < colors.length; v += 3) { colors[v] = shade.r; colors[v + 1] = shade.g; colors[v + 2] = shade.b; }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(g);
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}
