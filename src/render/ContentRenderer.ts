import { Assets, Container, FillPattern, Graphics, Matrix, Sprite, Text, Texture } from 'pixi.js';
import type { MapDocument } from '../core/doc/MapDocument';
import { objectAsset, type MapObject, type Token } from '../core/doc/objects';
import { wallStyleOf, type WallSegment } from '../core/doc/walls';
import { FLAT_OBJECTS, OBJECT_TEXTURE_URLS, WALL_TEXTURE_URLS } from './objectTextures';
import { TOKEN_ART_URLS } from './tokenArt';

const SHADOW = { x: 3, y: 4, alpha: 0.38 };

/**
 * Desenha paredes, portas, objetos e tokens. Cada camada é um Container
 * (para ligar/desligar a visibilidade) e é refeita quando a camada do
 * documento avisa que mudou.
 */
export class ContentRenderer {
  readonly objects = new Container();
  readonly walls = new Container();
  readonly tokens = new Container();
  readonly notes = new Container();
  /** Passagens para outros mapas (só o mestre vê). */
  readonly links = new Container();
  private linkViews = new Map<string, { root: Container; key: string }>();
  private noteViews = new Map<string, { root: Container; key: string }>();
  private wallGfx = new Graphics();
  private objectTextures = new Map<string, Texture>();
  private tokenTextures = new Map<string, Texture>();
  private wallPatterns = new Map<string, FillPattern>();
  private objectSprites = new Map<string, { sprite: Sprite; shadow: Sprite | null; key: string }>();
  private tokenViews = new Map<string, { root: Container; key: string }>();
  private unsub: Array<() => void> = [];
  onChange: (() => void) | null = null;

  /** Na janela dos jogadores, só os personagens de jogador mostram a barra de PV. */
  constructor(private doc: MapDocument, private playerView = false) {
    this.walls.addChild(this.wallGfx);
  }

  async load() {
    await Promise.all(
      Object.entries(TOKEN_ART_URLS).map(async ([key, url]) => {
        const tex = await Assets.load<Texture>(url);
        tex.source.scaleMode = 'linear';
        tex.source.autoGenerateMipmaps = true;
        tex.source.updateMipmaps();
        this.tokenTextures.set(key, tex);
      }),
    );
    await Promise.all(
      Object.entries(OBJECT_TEXTURE_URLS).map(async ([key, url]) => {
        const tex = await Assets.load<Texture>(url);
        tex.source.scaleMode = 'linear';
        tex.source.autoGenerateMipmaps = true;
        tex.source.updateMipmaps();
        this.objectTextures.set(key, tex);
      }),
    );
    await Promise.all(
      Object.entries(WALL_TEXTURE_URLS).map(async ([key, url]) => {
        const wallTex = await Assets.load<Texture>(url);
        const pattern = new FillPattern(wallTex, 'repeat');
        const s = (this.doc.grid.cellSize * 2) / wallTex.width;
        pattern.setTransform(new Matrix().scale(s, s));
        this.wallPatterns.set(key, pattern);
      }),
    );
  }

  start() {
    this.drawWalls();
    this.syncObjects();
    this.syncTokens();
    this.syncNotes();
    this.syncLinks();
    this.unsub.push(this.doc.notes.onChange(() => { this.syncNotes(); this.onChange?.(); }));
    this.unsub.push(this.doc.links.onChange(() => { this.syncLinks(); this.onChange?.(); }));
    this.unsub.push(this.doc.walls.onChange(() => { this.drawWalls(); this.onChange?.(); }));
    this.unsub.push(this.doc.objects.onChange(() => { this.syncObjects(); this.onChange?.(); }));
    this.unsub.push(this.doc.assets.onChange(() => this.loadCustomAssets()));
    this.loadCustomAssets();
    this.unsub.push(this.doc.tokens.onChange(() => { this.syncTokens(); this.onChange?.(); }));
  }

  destroy() {
    this.unsub.forEach((fn) => fn());
    this.objects.destroy({ children: true });
    this.walls.destroy({ children: true });
    this.tokens.destroy({ children: true });
    this.notes.destroy({ children: true });
    this.links.destroy({ children: true });
  }

  /** Decodifica as imagens importadas pelo usuário e cria as texturas. */
  private loadingCustom = new Set<string>();
  private loadCustomAssets() {
    for (const a of this.doc.assets.all()) {
      if (this.objectTextures.has(a.id) || this.loadingCustom.has(a.id)) continue;
      this.loadingCustom.add(a.id);
      const img = new Image();
      img.src = a.data;
      img.decode().then(() => {
        const tex = Texture.from(img);
        tex.source.scaleMode = 'linear';
        this.objectTextures.set(a.id, tex);
        this.loadingCustom.delete(a.id);
        this.syncObjects();
        this.onChange?.();
      }).catch(() => this.loadingCustom.delete(a.id));
    }
  }

  // ---- passagens para outros mapas
  private syncLinks() {
    const seen = new Set<string>();
    const cell = this.doc.grid.cellSize;
    for (const l of this.doc.links.all()) {
      seen.add(l.id);
      const key = JSON.stringify(l);
      const existing = this.linkViews.get(l.id);
      if (existing?.key === key) continue;
      existing?.root.destroy({ children: true });
      const root = new Container();
      root.position.set(l.x, l.y);
      const r = cell * 0.36;
      const color = l.target ? 0x2a8f86 : 0x8a8f99;
      const g = new Graphics();
      g.circle(1.5, 2, r).fill({ color: 0x000000, alpha: 0.35 });
      g.circle(0, 0, r).fill(color).stroke({ width: 1.5, color: 0xffffff, alpha: 0.9 });
      // degraus descendo para a direita, com uma seta: "leva a outro lugar"
      const s = r * 0.5;
      g.moveTo(-s * 1.1, -s * 0.9).lineTo(-s * 0.4, -s * 0.9).lineTo(-s * 0.4, -s * 0.2).lineTo(s * 0.3, -s * 0.2).lineTo(s * 0.3, s * 0.5).lineTo(s * 1.1, s * 0.5);
      g.moveTo(-s * 0.9, s * 0.95).lineTo(s * 0.2, s * 0.95).moveTo(-0.1 * s, s * 0.65).lineTo(s * 0.2, s * 0.95).lineTo(-0.1 * s, s * 1.25);
      g.stroke({ width: Math.max(1, cell * 0.05), color: 0xffffff, cap: 'round', join: 'round' });
      root.addChild(g);
      const text = l.label.trim() || (l.target ? 'Passagem' : 'Passagem sem destino');
      const label = new Text({
        text: text.length > 28 ? text.slice(0, 27) + '…' : text,
        resolution: 4,
        style: { fontFamily: 'system-ui, sans-serif', fontWeight: '600', fontSize: Math.max(7, cell * 0.26), fill: 0xd9fff9, stroke: { color: 0x000000, width: 3, join: 'round' } },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, r + 2);
      root.addChild(label);
      this.links.addChild(root);
      this.linkViews.set(l.id, { root, key });
    }
    for (const [id, v] of this.linkViews) {
      if (seen.has(id)) continue;
      v.root.destroy({ children: true });
      this.linkViews.delete(id);
    }
  }

  // ---- notas do mestre
  private syncNotes() {
    const seen = new Set<string>();
    const cell = this.doc.grid.cellSize;
    for (const n of this.doc.notes.all()) {
      seen.add(n.id);
      const key = JSON.stringify(n);
      const existing = this.noteViews.get(n.id);
      if (existing?.key === key) continue;
      existing?.root.destroy({ children: true });
      const root = new Container();
      root.position.set(n.x, n.y);
      const s = cell * 0.62;
      const g = new Graphics();
      // papel com a ponta dobrada e um alfinete
      g.poly([-s / 2 + 2, -s / 2 + 3, s / 2 + 2, -s / 2 + 3, s / 2 + 2, s / 2 + 3, -s / 2 + 2, s / 2 + 3]).fill({ color: 0x000000, alpha: 0.35 });
      g.poly([-s / 2, -s / 2, s / 2, -s / 2, s / 2, s / 4, s / 4, s / 2, -s / 2, s / 2]).fill(0xf3e2a4).stroke({ width: 1, color: 0x6b5a2a });
      g.poly([s / 2, s / 4, s / 4, s / 4, s / 4, s / 2]).fill(0xd8c27a).stroke({ width: 1, color: 0x6b5a2a });
      for (let i = 0; i < 3; i++) g.moveTo(-s * 0.32, -s * 0.18 + i * s * 0.18).lineTo(s * (i === 2 ? 0.05 : 0.3), -s * 0.18 + i * s * 0.18);
      g.stroke({ width: 1, color: 0x8a7640, alpha: 0.8 });
      g.circle(0, -s / 2, s * 0.11).fill(0xb8322c).stroke({ width: 0.8, color: 0x4a1210 });
      root.addChild(g);
      const title = n.text.split('\n')[0].trim();
      if (title) {
        const label = new Text({
          text: title.length > 28 ? title.slice(0, 27) + '…' : title,
          resolution: 4,
          style: { fontFamily: 'system-ui, sans-serif', fontWeight: '600', fontSize: Math.max(7, cell * 0.26), fill: 0xfff4cf, stroke: { color: 0x000000, width: 3, join: 'round' } },
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, s / 2 + 2);
        root.addChild(label);
      }
      this.notes.addChild(root);
      this.noteViews.set(n.id, { root, key });
    }
    for (const [id, v] of this.noteViews) {
      if (seen.has(id)) continue;
      v.root.destroy({ children: true });
      this.noteViews.delete(id);
    }
  }

  // ---- paredes e portas
  private drawWalls() {
    const g = this.wallGfx.clear();
    const cell = this.doc.grid.cellSize;
    const w = cell * 0.3;
    const all = this.doc.walls.all();
    const walls = all.filter((s) => s.kind === 'wall');
    const doors = all.filter((s) => s.kind === 'door');
    const path = (segs: WallSegment[], dx: number, dy: number) => { for (const s of segs) g.moveTo(s.a.x + dx, s.a.y + dy).lineTo(s.b.x + dx, s.b.y + dy); };
    if (walls.length) {
      path(walls, SHADOW.x, SHADOW.y);
      g.stroke({ width: w + 3, color: 0x000000, alpha: SHADOW.alpha, cap: 'round', join: 'round' });
      path(walls, 0, 0);
      g.stroke({ width: w + 3, color: 0x221d18, cap: 'round', join: 'round' });
      // Um traço por tema, cada um com a sua textura.
      const byStyle = new Map<string, WallSegment[]>();
      for (const s of walls) {
        const k = wallStyleOf(s);
        byStyle.set(k, [...(byStyle.get(k) ?? []), s]);
      }
      for (const [style, segs] of byStyle) {
        path(segs, 0, 0);
        const pattern = this.wallPatterns.get(style);
        if (pattern) g.stroke({ width: w, fill: pattern, cap: 'round', join: 'round' });
        else g.stroke({ width: w, color: 0x6d6a63, cap: 'round', join: 'round' });
      }
      path(walls, 0, 0);
      g.stroke({ width: w, color: 0x000000, alpha: 0.12, cap: 'round', join: 'round' });
    }
    for (const d of doors) this.drawDoor(g, d, cell);
  }

  private drawDoor(g: Graphics, d: WallSegment, cell: number) {
    const dx = d.b.x - d.a.x;
    const dy = d.b.y - d.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;  // ao longo da porta
    const nx = -uy, ny = ux;             // perpendicular
    const t = cell * 0.17;               // espessura
    const jamb = cell * 0.12;
    const quad = (s0: number, s1: number, half: number) => [
      d.a.x + ux * s0 + nx * half, d.a.y + uy * s0 + ny * half,
      d.a.x + ux * s1 + nx * half, d.a.y + uy * s1 + ny * half,
      d.a.x + ux * s1 - nx * half, d.a.y + uy * s1 - ny * half,
      d.a.x + ux * s0 - nx * half, d.a.y + uy * s0 - ny * half,
    ];
    if (d.open) {
      // Porta aberta: a folha gira ~80° em torno da dobradiça (lado "a"), para dentro do lado +n.
      const ang = (80 * Math.PI) / 180;
      const vx = ux * Math.cos(ang) + nx * Math.sin(ang);
      const vy = uy * Math.cos(ang) + ny * Math.sin(ang);
      const wx = -vy, wy = vx;
      const hx = d.a.x + ux * jamb, hy = d.a.y + uy * jamb;
      const L = len - jamb * 2;
      const leaf = [
        hx + wx * t / 2, hy + wy * t / 2, hx + vx * L + wx * t / 2, hy + vy * L + wy * t / 2,
        hx + vx * L - wx * t / 2, hy + vy * L - wy * t / 2, hx - wx * t / 2, hy - wy * t / 2,
      ];
      g.poly(leaf.map((v, i) => v + (i % 2 ? SHADOW.y : SHADOW.x))).fill({ color: 0x000000, alpha: SHADOW.alpha });
      g.poly(leaf).fill(0x7a5230).stroke({ width: 1.2, color: 0x2b1a0e });
      // arco tracejado indicando o giro
      g.moveTo(hx + ux * L, hy + uy * L)
        .arc(hx, hy, L, Math.atan2(uy, ux), Math.atan2(vy, vx))
        .stroke({ width: 0.8, color: 0x2b1a0e, alpha: 0.35 });
    } else {
      const shadowed = quad(jamb, len - jamb, t / 2).map((v, i) => v + (i % 2 ? SHADOW.y : SHADOW.x));
      g.poly(shadowed).fill({ color: 0x000000, alpha: SHADOW.alpha });
      g.poly(quad(jamb, len - jamb, t / 2)).fill(0x7a5230).stroke({ width: 1.2, color: 0x2b1a0e });
      // tábuas
      const planks = 3;
      for (let i = 1; i < planks; i++) {
        const off = -t / 2 + (t * i) / planks;
        g.moveTo(d.a.x + ux * jamb + nx * off, d.a.y + uy * jamb + ny * off)
          .lineTo(d.a.x + ux * (len - jamb) + nx * off, d.a.y + uy * (len - jamb) + ny * off);
      }
      g.stroke({ width: 0.8, color: 0x3d2614, alpha: 0.8 });
    }
    // batentes de pedra nas pontas
    for (const [s0, s1] of [[0, jamb], [len - jamb, len]]) {
      g.poly(quad(s0, s1, cell * 0.18)).fill(0x5d5953).stroke({ width: 1.2, color: 0x221d18 });
    }
    // maçaneta
    if (!d.open) {
      const k = len - jamb - cell * 0.18;
      g.circle(d.a.x + ux * k + nx * t * 0.25, d.a.y + uy * k + ny * t * 0.25, cell * 0.035).fill(0xc9a548);
    }
  }

  // ---- objetos
  private syncObjects() {
    const items = this.doc.objects.all();
    const seen = new Set<string>();
    items.forEach((o, index) => {
      seen.add(o.id);
      const key = JSON.stringify(o);
      let view = this.objectSprites.get(o.id);
      if (!view) {
        const tex = this.objectTextures.get(o.asset);
        if (!tex) return;
        const shadow = FLAT_OBJECTS.has(o.asset) ? null : new Sprite(tex);
        if (shadow) { shadow.tint = 0x000000; shadow.alpha = SHADOW.alpha; shadow.anchor.set(0.5); this.objects.addChild(shadow); }
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        this.objects.addChild(sprite);
        view = { sprite, shadow, key: '' };
        this.objectSprites.set(o.id, view);
      }
      if (view.key !== key) this.placeObject(view, o);
      view.key = key;
      // ordem de desenho: tapetes no fundo, depois a ordem de criação
      const z = (FLAT_OBJECTS.has(o.asset) ? 0 : 10_000) + index * 2;
      if (view.shadow) view.shadow.zIndex = z;
      view.sprite.zIndex = z + 1;
    });
    for (const [id, view] of this.objectSprites) {
      if (seen.has(id)) continue;
      view.sprite.destroy();
      view.shadow?.destroy();
      this.objectSprites.delete(id);
    }
    this.objects.sortableChildren = true;
  }

  private placeObject(view: { sprite: Sprite; shadow: Sprite | null }, o: MapObject) {
    const a = objectAsset(o.asset);
    if (!a) return;
    const cell = this.doc.grid.cellSize;
    for (const s of [view.sprite, view.shadow]) {
      if (!s) continue;
      s.width = a.w * cell * o.scale;
      s.height = a.h * cell * o.scale;
      s.rotation = (o.rot * Math.PI) / 180;
      s.position.set(o.x, o.y);
    }
    if (view.shadow) view.shadow.position.set(o.x + SHADOW.x * o.scale * 1.4, o.y + SHADOW.y * o.scale * 1.4);
  }

  // ---- tokens
  private syncTokens() {
    const seen = new Set<string>();
    for (const t of this.doc.tokens.all()) {
      seen.add(t.id);
      const key = JSON.stringify(t);
      const existing = this.tokenViews.get(t.id);
      if (existing?.key === key) continue;
      existing?.root.destroy({ children: true });
      const root = this.buildToken(t);
      this.tokens.addChild(root);
      this.tokenViews.set(t.id, { root, key });
    }
    for (const [id, v] of this.tokenViews) {
      if (seen.has(id)) continue;
      v.root.destroy({ children: true });
      this.tokenViews.delete(id);
    }
  }

  private buildToken(t: Token) {
    const cell = this.doc.grid.cellSize;
    const r = (t.size * cell) / 2 * 0.9;
    const root = new Container();
    root.position.set(t.x, t.y);
    const g = new Graphics();
    g.circle(SHADOW.x, SHADOW.y, r).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(0, 0, r).fill(0x1b1712);
    g.circle(0, 0, r - 1.5).fill(0xd8c38a);
    const art = t.template ? this.tokenTextures.get(t.template) : undefined;
    if (art) {
      // Retrato: anel na cor do token e fundo escuro, arte recortada no círculo.
      g.circle(0, 0, r - 1.5).fill(t.color);
      g.circle(0, 0, r - Math.max(3, r * 0.14)).fill(0x2b3324);
      root.addChild(g);
      const inner = r - Math.max(3, r * 0.14);
      const sprite = new Sprite(art);
      sprite.anchor.set(0.5);
      sprite.width = sprite.height = inner * 2 * 1.04;
      const mask = new Graphics().circle(0, 0, inner).fill(0xffffff);
      sprite.mask = mask;
      root.addChild(sprite, mask);
    } else {
      g.circle(0, 0, r - 3.5).fill(t.color);
      // brilho sutil em cima à esquerda, para parecer uma ficha
      g.circle(-r * 0.3, -r * 0.35, r * 0.45).fill({ color: 0xffffff, alpha: 0.12 });
      root.addChild(g);
    }
    if (t.sheet && (!this.playerView || t.pc)) root.addChild(hpBar(t.sheet.hp, t.sheet.hpMax, r));
    if (art) {
      if (t.name.length) root.addChild(nameLabel(t.name, cell, r));
      return root;
    }
    const label = new Text({
      text: initials(t.name),
      resolution: 4,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '700',
        fontSize: Math.max(8, r * 0.85),
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2, join: 'round' },
      },
    });
    label.anchor.set(0.5);
    root.addChild(label);
    if (t.name.length > 2) {
      const name = new Text({
        text: t.name,
        resolution: 4,
        style: { fontFamily: 'system-ui, sans-serif', fontWeight: '600', fontSize: Math.max(7, cell * 0.28), fill: 0xffffff, stroke: { color: 0x000000, width: 3, join: 'round' } },
      });
      name.anchor.set(0.5, 0);
      name.position.set(0, r + 2);
      root.addChild(name);
    }
    return root;
  }
}

/** Barra de PV logo acima do token: verde, amarela e vermelha conforme cai. */
function hpBar(hp: number, max: number, r: number) {
  const k = Math.max(0, Math.min(1, hp / Math.max(1, max)));
  const w = r * 1.5, h = Math.max(3, r * 0.16);
  const g = new Graphics();
  g.roundRect(-w / 2 - 1, -r - h - 3, w + 2, h + 2, 2).fill({ color: 0x000000, alpha: 0.75 });
  if (k > 0) g.roundRect(-w / 2, -r - h - 2, w * k, h, 1.5).fill(k > 0.5 ? 0x4caf50 : k > 0.25 ? 0xe0b030 : 0xd9412f);
  return g;
}

function nameLabel(text: string, cell: number, r: number) {
  const name = new Text({
    text,
    resolution: 4,
    style: { fontFamily: 'system-ui, sans-serif', fontWeight: '600', fontSize: Math.max(7, cell * 0.28), fill: 0xffffff, stroke: { color: 0x000000, width: 3, join: 'round' } },
  });
  name.anchor.set(0.5, 0);
  name.position.set(0, r + 2);
  return name;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.length <= 2 ? name.toUpperCase() : name[0].toUpperCase();
}
