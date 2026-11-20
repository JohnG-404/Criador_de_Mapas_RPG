// Dados 3D em tela cheia + skins (visuais) dos dados.
// O resultado já vem sorteado do servidor; aqui o dado é arremessado, quica, gira
// e termina com a face sorteada virada para a câmera. A animação nunca muda o resultado.
// Portado do rolador de dados do projeto (rolador-dados/public/dados3d.js).
// No Atlas Board o resultado é sorteado no navegador de quem rola (core/dice/dice.ts).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './dados3d.css';

const SUPORTADOS = new Set([4, 6, 8, 10, 12, 20, 100]);
const MAX_DADOS = 12;
const FOV = 30;
const DURACAO = 1.45; // segundos até o dado parar
const ESPACO = 2.7; // distância entre dados lado a lado

const V = THREE.Vector3;

// ============================================================
// Ruído procedural (para pedra, osso, madeira, lava...)
// ============================================================
function criarRuido(semente) {
  let s = semente;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = Float32Array.from({ length: 256 }, () => rnd());
  function n2(x, y) {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const xf = x - xi; const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
    const h = (i, j) => val[perm[perm[(xi + i) & 255] + ((yi + j) & 255)]];
    const a = h(0, 0); const b = h(1, 0); const c = h(0, 1); const d = h(1, 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oitavas = 4) {
    let t = 0; let amp = 0.5; let f = 1; let norma = 0;
    for (let o = 0; o < oitavas; o++) { t += amp * n2(x * f, y * f); norma += amp; amp *= 0.5; f *= 2; }
    return t / norma;
  }
  return { n2, fbm, rnd };
}

const TAM_TEX = 256;
const cacheTex = new Map();
function textura(chave, desenhar, cor = true) {
  if (cacheTex.has(chave)) return cacheTex.get(chave);
  const cv = document.createElement('canvas');
  cv.width = cv.height = TAM_TEX;
  const ctx = cv.getContext('2d');
  desenhar(ctx, TAM_TEX);
  const tex = new THREE.CanvasTexture(cv);
  if (cor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cacheTex.set(chave, tex);
  return tex;
}

function pintarPixels(ctx, s, fn) {
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const [r, g, b] = fn(x / s, y / s);
      const i = (y * s + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function rachaduras(ctx, s, R, qtd, cor, largura) {
  ctx.strokeStyle = cor;
  ctx.lineCap = 'round';
  for (let k = 0; k < qtd; k++) {
    let x = R.rnd() * s; let y = R.rnd() * s; let ang = R.rnd() * Math.PI * 2;
    ctx.lineWidth = largura * (0.5 + R.rnd());
    ctx.beginPath(); ctx.moveTo(x, y);
    const passos = 10 + Math.floor(R.rnd() * 14);
    for (let i = 0; i < passos; i++) {
      ang += (R.rnd() - 0.5) * 1.1;
      x += Math.cos(ang) * 9; y += Math.sin(ang) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const TEXTURAS = {
  pedra: () => textura('pedra', (ctx, s) => {
    const R = criarRuido(11);
    pintarPixels(ctx, s, (u, v) => {
      const n = R.fbm(u * 6, v * 6, 5);
      const pinta = R.n2(u * 70, v * 70) > 0.8 ? -22 : 0;
      const b = 48 + n * 70 + pinta;
      return [b + 3, b + 4, b + 7];
    });
    rachaduras(ctx, s, R, 4, 'rgba(25,22,20,.55)', 1.6);
  }),
  osso: () => textura('osso', (ctx, s) => {
    const R = criarRuido(23);
    pintarPixels(ctx, s, (u, v) => {
      const n = R.fbm(u * 4, v * 4, 4) - 0.5;
      const poro = R.n2(u * 90, v * 90) > 0.86 ? -34 : 0;
      return [226 + n * 44 + poro, 211 + n * 44 + poro, 176 + n * 40 + poro];
    });
    rachaduras(ctx, s, R, 7, 'rgba(95,70,40,.45)', 1);
  }),
  escamas: () => textura('escamas', (ctx, s) => {
    ctx.fillStyle = '#a8761e';
    ctx.fillRect(0, 0, s, s);
    const w = 16; const h = 10;
    for (let lin = -1; lin < s / h + 2; lin++) {
      for (let col = -1; col < s / w + 1; col++) {
        const x = col * w + (lin % 2 ? w / 2 : 0) + w / 2;
        const y = lin * h;
        const g = ctx.createLinearGradient(0, y, 0, y + w / 2);
        g.addColorStop(0, '#ffe9a6'); g.addColorStop(0.5, '#e0aa48'); g.addColorStop(1, '#b07c26');
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.arc(x, y, w / 2, Math.PI, 0, true);
        ctx.closePath();
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(90,55,10,.45)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }),
  lava: () => textura('lava', (ctx, s) => {
    const R = criarRuido(37);
    pintarPixels(ctx, s, (u, v) => {
      const n = R.fbm(u * 5, v * 5, 5);
      const fenda = Math.abs(R.fbm(u * 3 + 10, v * 3, 4) - 0.5);
      const b = 26 + n * 45;
      if (fenda < 0.045) return [150, 45, 12];
      return [b + 10, b * 0.7, b * 0.55];
    });
  }),
  lavaBrilho: () => textura('lavaBrilho', (ctx, s) => {
    const R = criarRuido(37); // mesma semente da textura "lava": as fendas coincidem
    pintarPixels(ctx, s, (u, v) => {
      const fenda = Math.abs(R.fbm(u * 3 + 10, v * 3, 4) - 0.5);
      if (fenda >= 0.05) return [0, 0, 0];
      const k = 1 - fenda / 0.05;
      return [255 * k, 150 * k * k, 30 * k * k * k];
    });
  }),
  madeira: () => textura('madeira', (ctx, s) => {
    const R = criarRuido(53);
    pintarPixels(ctx, s, (u, v) => {
      const n = R.fbm(u * 3, v * 8, 4);
      const anel = (Math.sin((u * 14 + n * 5) * Math.PI) + 1) / 2;
      const fibra = R.n2(u * 4, v * 140) * 0.35;
      const t = Math.min(1, Math.pow(anel, 3) + fibra);
      return [176 - t * 90, 122 - t * 70, 69 - t * 44];
    });
  }),
  gelo: () => textura('gelo', (ctx, s) => {
    const R = criarRuido(71);
    pintarPixels(ctx, s, (u, v) => {
      const n = R.fbm(u * 5, v * 5, 5);
      return [190 + n * 65, 222 + n * 33, 246 + n * 9];
    });
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    for (let k = 0; k < 40; k++) {
      const x = R.rnd() * s; const y = R.rnd() * s; const a = R.rnd() * Math.PI; const l = 8 + R.rnd() * 30;
      ctx.lineWidth = 0.6 + R.rnd();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
  }),
  nebulosaVermelha: () => textura('nebulosaVermelha', (ctx, s) => {
    const R = criarRuido(89);
    pintarPixels(ctx, s, (u, v) => {
      const q = R.fbm(u * 3, v * 3, 4);
      const n = R.fbm(u * 3 + q * 2.5, v * 3 + q * 2.5, 4);
      const k = n < 0.4 ? n * 0.5 : n;
      return [40 + k * 215, 4 + k * 22, 12 + k * 30];
    });
  }),
};

// ============================================================
// Skins
// ============================================================
// corpo(cor) devolve os parâmetros do material do dado; numero define o estilo dos números.
const SKINS = {
  classico: {
    nome: 'Resina Clássica', desc: 'Na sua cor de jogador, com números dourados.',
    corpo: (cor) => ({ tipo: 'fisico', color: new THREE.Color(cor).multiplyScalar(0.8), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12 }),
    numero: { tipo: 'gradiente', cores: ['#fff1c4', '#f0c65e', '#b8872a'] },
    aresta: { cor: 0xe2b85a, op: 0.55 },
  },
  obsidiana: {
    nome: 'Obsidiana Real', desc: 'Vidro vulcânico negro, ouro e um aro gravado.',
    corpo: () => ({ tipo: 'fisico', color: 0x120d0a, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }),
    numero: { tipo: 'gradiente', cores: ['#fff4cc', '#f2c75a', '#a87618'], ornamento: 'aro', ornCor: 'rgba(240,198,94,.6)' },
    aresta: { cor: 0xf0c65e, op: 0.75 },
  },
  runica: {
    nome: 'Pedra Rúnica', desc: 'Granito antigo com runas que brilham em azul.',
    corpo: () => ({ tipo: 'padrao', map: TEXTURAS.pedra(), bumpMap: TEXTURAS.pedra(), bumpScale: 3, roughness: 0.95, metalness: 0 }),
    numero: { tipo: 'brilho', cores: ['#e6fdff', '#7ae9ff'], glow: '#22c8ff', intensidade: 1.6, ornamento: 'runas', ornCor: 'rgba(122,233,255,.75)' },
    aresta: { cor: 0x6fe7ff, op: 0.3 },
  },
  osso: {
    nome: 'Osso Ancestral', desc: 'Marfim rachado pelo tempo, números entalhados.',
    corpo: () => ({ tipo: 'padrao', map: TEXTURAS.osso(), bumpMap: TEXTURAS.osso(), bumpScale: 1.5, roughness: 0.75, metalness: 0 }),
    numero: { tipo: 'gravado', cor: '#3b2414', luz: 'rgba(255,248,225,.8)', ornamento: 'aro', ornCor: 'rgba(80,50,25,.45)' },
    aresta: null,
  },
  dragao: {
    nome: 'Ouro do Dragão', desc: 'Escamas de ouro maciço, números em rubi.',
    corpo: () => ({ tipo: 'fisico', map: TEXTURAS.escamas(), bumpMap: TEXTURAS.escamas(), bumpScale: 1, color: 0xffe2a0, metalness: 1, roughness: 0.32, envMapIntensity: 2.4 }),
    numero: { tipo: 'brilho', cores: ['#ff8a8a', '#d01020'], glow: '#ff2030', intensidade: 0.9, ornamento: 'aro', ornCor: 'rgba(120,10,15,.85)' },
    aresta: { cor: 0xfff0b0, op: 0.35 },
  },
  brasa: {
    nome: 'Brasa Infernal', desc: 'Rocha vulcânica com fendas de lava viva.',
    corpo: () => ({ tipo: 'padrao', map: TEXTURAS.lava(), emissiveMap: TEXTURAS.lavaBrilho(), emissive: 0xff6a1a, emissiveIntensity: 2.2, roughness: 0.85, metalness: 0 }),
    numero: { tipo: 'brilho', cores: ['#fff6c0', '#ffb020'], glow: '#ff5a00', intensidade: 1.8, ornamento: 'chamas', ornCor: 'rgba(255,140,30,.8)' },
    aresta: { cor: 0xff7a20, op: 0.45 },
  },
  cristal: {
    nome: 'Cristal Arcano', desc: 'Ametista translúcida com um núcleo de magia.',
    corpo: () => ({ tipo: 'fisico', color: 0x9a6cf8, transparent: true, opacity: 0.5, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }),
    nucleo: 0xd7b8ff,
    numero: { tipo: 'brilho', cores: ['#ffffff', '#efe2ff'], glow: '#b98cff', intensidade: 1.4, ornamento: 'estrelas', ornCor: 'rgba(240,226,255,.85)' },
    aresta: { cor: 0xf0e2ff, op: 0.7 },
  },
  elfica: {
    nome: 'Madeira Élfica', desc: 'Carvalho entalhado com folhas de hera.',
    corpo: () => ({ tipo: 'padrao', map: TEXTURAS.madeira(), bumpMap: TEXTURAS.madeira(), bumpScale: 1.2, roughness: 0.62, metalness: 0 }),
    numero: { tipo: 'gravado', cor: '#1f3a0c', luz: 'rgba(255,236,170,.75)', ornamento: 'folhas', ornCor: 'rgba(40,85,18,.85)' },
    aresta: { cor: 0x3d5a1a, op: 0.45 },
  },
  gelo: {
    nome: 'Gelo Eterno', desc: 'Geada translúcida das montanhas do norte.',
    corpo: () => ({ tipo: 'fisico', map: TEXTURAS.gelo(), color: 0x7cc4ff, emissive: 0x0b3a66, emissiveIntensity: 0.6, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0, clearcoat: 1 }),
    nucleo: 0xbfeaff,
    numero: { tipo: 'brilho', cores: ['#ffffff', '#d9f4ff'], glow: '#6fd0ff', intensidade: 1.1, ornamento: 'aro', ornCor: 'rgba(255,255,255,.6)' },
    aresta: { cor: 0xffffff, op: 0.65 },
  },
  vampiro: {
    nome: 'Sangue de Vampiro', desc: 'Vidro carmesim com redemoinhos e prata.',
    corpo: () => ({ tipo: 'fisico', map: TEXTURAS.nebulosaVermelha(), color: 0xff6b7a, transparent: true, opacity: 0.78, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }),
    nucleo: 0x2a0006,
    numero: { tipo: 'gradiente', cores: ['#ffffff', '#dcdce4', '#8a8a98'], ornamento: 'aro', ornCor: 'rgba(220,220,230,.55)' },
    aresta: { cor: 0xdcdce4, op: 0.55 },
  },
};

export const LISTA_SKINS = Object.entries(SKINS).map(([id, s]) => ({ id, nome: s.nome, descricao: s.desc }));

function skinDe(id, papel) {
  return SKINS[id] ? id : (papel === 'mestre' ? 'obsidiana' : 'classico');
}

// ============================================================
// Geometria dos dados
// ============================================================
function geometriaD10() {
  const c36 = Math.cos(Math.PI / 5);
  const z = 0.105;
  const h = (z * (1 + c36)) / (1 - c36); // altura dos polos que deixa as faces planas
  const anel = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    anel.push(new V(Math.cos(a), i % 2 ? -z : z, Math.sin(a)));
  }
  const topo = new V(0, h, 0);
  const base = new V(0, -h, 0);
  const tris = [];
  for (let i = 0; i < 10; i += 2) {
    const [a, b, c] = [anel[i], anel[(i + 1) % 10], anel[(i + 2) % 10]];
    tris.push([topo, a, b], [topo, b, c]);
  }
  for (let i = 1; i < 10; i += 2) {
    const [a, b, c] = [anel[i], anel[(i + 1) % 10], anel[(i + 2) % 10]];
    tris.push([base, a, b], [base, b, c]);
  }
  const pos = [];
  tris.forEach(([a, b, c]) => {
    const n = new V().subVectors(b, a).cross(new V().subVectors(c, a));
    if (n.dot(new V().add(a).add(b).add(c)) < 0) [b, c] = [c, b];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function geometriaBase(lados) {
  let g;
  switch (lados) {
    case 4: g = new THREE.TetrahedronGeometry(1.3); break;
    case 6: g = new THREE.BoxGeometry(1.3, 1.3, 1.3); break;
    case 8: g = new THREE.OctahedronGeometry(1.1); break;
    case 10: g = geometriaD10(); g.scale(1.05, 1.05, 1.05); break;
    case 12: g = new THREE.DodecahedronGeometry(1.05); break;
    default: g = new THREE.IcosahedronGeometry(1.1);
  }
  return g.index ? g.toNonIndexed() : g;
}

const chaveNormal = (n) => [n.x, n.y, n.z].map((x) => Math.round(x * 40) + 0).join(',');

// Agrupa os triângulos em faces e calcula centro, orientação e tamanho de cada face.
// Também gera coordenadas de textura planas por face (cada face mostra um pedaço diferente da textura).
function analisarFaces(geo) {
  const pos = geo.attributes.position;
  const grupos = new Map();
  const triFace = [];
  const a = new V(); const b = new V(); const c = new V();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    const n = new V().subVectors(b, a).cross(new V().subVectors(c, a)).normalize();
    if (n.dot(new V().add(a).add(b).add(c)) < 0) n.negate();
    const chave = chaveNormal(n);
    if (!grupos.has(chave)) grupos.set(chave, { n, vertices: new Map(), indice: grupos.size });
    const g = grupos.get(chave);
    [a, b, c].forEach((v) => g.vertices.set(v.toArray().map((x) => x.toFixed(3)).join(','), v.clone()));
    triFace.push(g.indice);
  }
  const faces = [...grupos.values()].map(({ n, vertices }) => {
    const vs = [...vertices.values()];
    const centro = vs.reduce((s, v) => s.add(v), new V()).divideScalar(vs.length);
    const e1 = new V().subVectors(vs[0], centro).normalize();
    const e2 = new V().crossVectors(n, e1);
    vs.sort((p, q) => {
      const dp = new V().subVectors(p, centro); const dq = new V().subVectors(q, centro);
      return Math.atan2(dp.dot(e2), dp.dot(e1)) - Math.atan2(dq.dot(e2), dq.dot(e1));
    });
    let inraio = Infinity;
    for (let i = 0; i < vs.length; i++) {
      const p = vs[i]; const q = vs[(i + 1) % vs.length];
      const aresta = new V().subVectors(q, p);
      inraio = Math.min(inraio, new V().subVectors(centro, p).cross(aresta).length() / aresta.length());
    }
    // "Para cima" do número: vértice mais distante (pipa, triângulo, pentágono) ou meio de aresta (quadrado)
    const dists = vs.map((v) => v.distanceTo(centro));
    const regular = Math.max(...dists) - Math.min(...dists) < 1e-3;
    let cima;
    if (regular && vs.length % 2 === 0) cima = new V().addVectors(vs[0], vs[1]).multiplyScalar(0.5).sub(centro);
    else cima = new V().subVectors(vs[dists.indexOf(Math.max(...dists))], centro);
    cima.sub(n.clone().multiplyScalar(cima.dot(n))).normalize();
    return { n, centro, cima, inraio, triangulo: vs.length === 3 };
  });
  // UVs planos por face
  const uv = new Float32Array(pos.count * 2);
  for (let t = 0; t < pos.count; t++) {
    const f = faces[triFace[Math.floor(t / 3)]];
    const x = new V().crossVectors(f.cima, f.n);
    const d = new V().fromBufferAttribute(pos, t).sub(f.centro);
    const desloc = triFace[Math.floor(t / 3)] * 0.137;
    uv[t * 2] = d.dot(x) * 0.42 + 0.5 + desloc;
    uv[t * 2 + 1] = d.dot(f.cima) * 0.42 + 0.5 + desloc * 1.7;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return faces;
}

// Numeração: faces opostas somam N+1, como num dado de verdade.
function ordemDosRotulos(faces) {
  const N = faces.length;
  const idx = new Array(N).fill(-1);
  let k = 0;
  for (let i = 0; i < N; i++) {
    if (idx[i] >= 0) continue;
    idx[i] = k;
    const oposta = faces.findIndex((f, j) => idx[j] < 0 && f.n.dot(faces[i].n) < -0.99);
    if (oposta >= 0) idx[oposta] = N - 1 - k;
    k++;
  }
  return idx;
}

const cacheBase = new Map();
function base(ladosGeo) {
  if (!cacheBase.has(ladosGeo)) {
    const geo = geometriaBase(ladosGeo);
    const faces = analisarFaces(geo);
    cacheBase.set(ladosGeo, { geo, faces, rotuloDaFace: ordemDosRotulos(faces), arestas: new THREE.EdgesGeometry(geo, 10) });
  }
  return cacheBase.get(ladosGeo);
}

// ============================================================
// Números (texturas desenhadas em canvas, com ornamentos por skin)
// ============================================================
const RUNAS = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';

function desenharOrnamento(ctx, s, est) {
  if (!est.ornamento) return;
  const c = s / 2;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = est.ornCor;
  switch (est.ornamento) {
    case 'aro':
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(c, c, s * 0.43, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(c, c, s * 0.385, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'runas':
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c, c, s * 0.445, 0, Math.PI * 2); ctx.stroke();
      ctx.font = `700 ${Math.round(s * 0.1)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = est.glow; ctx.shadowBlur = 8;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        ctx.fillText(RUNAS[(i * 5) % RUNAS.length], c + Math.cos(a) * s * 0.37, c + Math.sin(a) * s * 0.37);
      }
      break;
    case 'folhas': {
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c, c + s * 0.05, s * 0.36, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
      const folha = (x, y, ang) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.beginPath(); ctx.ellipse(0, 0, s * 0.055, s * 0.022, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      };
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.24 + i * 0.13);
        const x = c + Math.cos(a) * s * 0.36; const y = c + s * 0.05 + Math.sin(a) * s * 0.36;
        folha(x, y, a + (i % 2 ? 0.9 : -0.9));
      }
      break;
    }
    case 'chamas':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = c + Math.cos(a) * s * 0.4; const y = c + Math.sin(a) * s * 0.4;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
        ctx.shadowColor = est.glow; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.06);
        ctx.quadraticCurveTo(s * 0.035, 0, 0, s * 0.035);
        ctx.quadraticCurveTo(-s * 0.035, 0, 0, -s * 0.06);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'estrelas': {
      const estrela = (x, y, r) => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 ? r * 0.28 : r;
          const a = (i / 8) * Math.PI * 2;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
      };
      ctx.shadowColor = est.glow; ctx.shadowBlur = 10;
      [[0.2, 0.22, 0.05], [0.8, 0.26, 0.035], [0.18, 0.75, 0.03], [0.82, 0.78, 0.05], [0.5, 0.1, 0.028], [0.5, 0.9, 0.028]]
        .forEach(([x, y, r]) => estrela(x * s, y * s, r * s));
      break;
    }
    default: break;
  }
  ctx.restore();
}

function texturaNumero(texto, idSkin) {
  const chave = `num|${idSkin}|${texto}`;
  if (cacheTex.has(chave)) return cacheTex.get(chave);
  const est = SKINS[idSkin].numero;
  return textura(chave, (ctx, s) => {
    desenharOrnamento(ctx, s, est);
    const tamanho = texto.length >= 3 ? 84 : texto.length === 2 ? 112 : 140;
    ctx.font = `700 ${tamanho}px Cinzel, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = s / 2 + tamanho * 0.06;
    const sublinhar = texto === '6' || texto === '9';
    const barra = () => { if (sublinhar) ctx.fillRect(s / 2 - 24, s / 2 + tamanho * 0.47, 48, 9); };

    if (est.tipo === 'gravado') {
      // Entalhe: borda clara embaixo (pega luz) e número escuro por cima
      ctx.fillStyle = est.luz;
      ctx.fillText(texto, s / 2, y + 3); ctx.save(); ctx.translate(0, 3); barra(); ctx.restore();
      ctx.fillStyle = est.cor;
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = -1;
      ctx.fillText(texto, s / 2, y); barra();
      return;
    }
    const grad = ctx.createLinearGradient(0, s * 0.25, 0, s * 0.75);
    est.cores.forEach((cor, i) => grad.addColorStop(i / (est.cores.length - 1), cor));
    ctx.fillStyle = grad;
    if (est.tipo === 'brilho') {
      ctx.shadowColor = est.glow; ctx.shadowBlur = 26;
      ctx.fillText(texto, s / 2, y); barra();
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    }
    ctx.fillText(texto, s / 2, y); barra();
  });
}

const planoNumero = new THREE.PlaneGeometry(1, 1);

// ============================================================
// Construção de um dado
// ============================================================
function materialCorpo(idSkin, cor) {
  const { tipo, ...p } = SKINS[idSkin].corpo(cor);
  const m = tipo === 'fisico' ? new THREE.MeshPhysicalMaterial(p) : new THREE.MeshStandardMaterial(p);
  m.flatShading = true;
  return m;
}

function materialNumero(idSkin, texto) {
  const est = SKINS[idSkin].numero;
  const tex = texturaNumero(texto, idSkin);
  const brilho = est.tipo === 'brilho';
  return new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex,
    emissive: brilho ? 0xffffff : 0x000000, emissiveIntensity: brilho ? est.intensidade : 0,
    transparent: true, metalness: brilho ? 0 : (est.metal ?? 0.5), roughness: 0.3,
    polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  });
}

function criarDado(info, idSkin, cor) {
  const skin = SKINS[idSkin];
  const b = base(info.geo);
  const matCorpo = materialCorpo(idSkin, cor);
  const corpo = new THREE.Mesh(b.geo, matCorpo);
  const materiais = [matCorpo];
  const matsNumero = [];

  if (skin.nucleo) {
    // Núcleo brilhante visto através do corpo translúcido
    const matNucleo = new THREE.MeshBasicMaterial({ color: skin.nucleo });
    const nucleo = new THREE.Mesh(b.geo, matNucleo);
    nucleo.scale.setScalar(0.5);
    corpo.add(nucleo);
    materiais.push(matNucleo);
  }
  if (skin.aresta) {
    const matAresta = new THREE.LineBasicMaterial({ color: skin.aresta.cor, transparent: true, opacity: skin.aresta.op });
    corpo.add(new THREE.LineSegments(b.arestas, matAresta));
    materiais.push(matAresta);
    matsNumero.push(matAresta);
  }

  b.faces.forEach((f, i) => {
    const mat = materialNumero(idSkin, info.rotulos[b.rotuloDaFace[i]]);
    materiais.push(mat);
    matsNumero.push(mat);
    const m = new THREE.Mesh(planoNumero, mat);
    m.scale.setScalar(f.inraio * (f.triangulo ? 1.9 : 1.55));
    m.position.copy(f.centro).addScaledVector(f.n, 0.004);
    const x = new V().crossVectors(f.cima, f.n);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, f.cima, f.n));
    corpo.add(m);
  });

  const d = {
    corpo, matCorpo, matsNumero, base: b, geo: info.geo, mantido: info.mantido ?? true,
    qFinal: new THREE.Quaternion(), apoio: b.faces[0].centro.length(),
    descartar() { materiais.forEach((m) => m.dispose()); },
  };
  if (info.alvo != null) mirar(d, info.alvo);
  return d;
}

// Define qual face fica virada para a câmera no fim: a sorteada pelo servidor, com o número em pé.
function mirar(d, alvo) {
  const b = d.base;
  const i = Math.max(0, b.rotuloDaFace.indexOf(alvo));
  const f = b.faces[i];
  const x = new V().crossVectors(f.cima, f.n);
  const qFace = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, f.cima, f.n));
  d.qFinal = new THREE.Quaternion()
    .setFromAxisAngle(new V(0, 0, 1), (Math.random() - 0.5) * 0.4)
    .multiply(qFace.invert());
  d.apoio = f.centro.length();
}

function iluminar(cena, renderizador) {
  const pmrem = new THREE.PMREMGenerator(renderizador);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environmentIntensity = 0.3;
  cena.add(new THREE.HemisphereLight(0xffe8c0, 0x2a1608, 0.4));
  const chave = new THREE.DirectionalLight(0xffd9a0, 2.2);
  chave.position.set(-4, 6, 10);
  cena.add(chave);
  const contra = new THREE.PointLight(0xffb347, 40, 30);
  contra.position.set(5, -4, 6);
  cena.add(contra);
}

function novoRenderizador(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  return r;
}

// ============================================================
// Palco (tela cheia da rolagem)
// ============================================================
let renderer, scene, camera, palco, disponivel = true;
let elTopo, elTotal, elDetalhe, elCrit;

function iniciar() {
  if (renderer || !disponivel) return !!renderer;
  try {
    palco = document.createElement('div');
    palco.className = 'palco';
    palco.setAttribute('role', 'dialog');
    palco.setAttribute('aria-label', 'Rolagem de dados');
    palco.innerHTML = `
      <div class="palco-brilho"></div>
      <canvas></canvas>
      <div class="palco-topo"></div>
      <div class="palco-resultado">
        <div class="palco-crit"></div>
        <div class="palco-total"></div>
        <div class="palco-detalhe"></div>
      </div>
      <div class="palco-dica">Toque para fechar</div>`;
    document.body.append(palco);
    elTopo = palco.querySelector('.palco-topo');
    elTotal = palco.querySelector('.palco-total');
    elDetalhe = palco.querySelector('.palco-detalhe');
    elCrit = palco.querySelector('.palco-crit');

    renderer = novoRenderizador(palco.querySelector('canvas'));
    scene = new THREE.Scene();
    iluminar(scene, renderer);
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    ajustarTamanho();
    window.addEventListener('resize', ajustarTamanho);
    return true;
  } catch (e) {
    console.warn('Dados 3D indisponíveis neste aparelho:', e);
    disponivel = false;
    if (palco) palco.remove();
    return false;
  }
}

function ajustarTamanho() {
  if (!renderer) return;
  renderer.setPixelRatio(qualidade());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

// ---------- Qualidade automática ----------
// Começa em até 1,5x a resolução da tela. Se o aparelho não aguentar ~50 quadros por segundo,
// baixa a resolução e lembra disso para as próximas rolagens.
const NIVEIS = [1.5, 1.25, 1, 0.8, 0.65];
let nivel = (() => { try { return Math.min(NIVEIS.length - 1, Math.max(0, Number(localStorage.getItem('qualidade3d')) || 0)); } catch { return 0; } })();
function qualidade() { return Math.min(window.devicePixelRatio || 1, NIVEIS[nivel]); }
function baixarQualidade() {
  if (nivel >= NIVEIS.length - 1) return;
  nivel++;
  try { localStorage.setItem('qualidade3d', String(nivel)); } catch { /* ignora */ }
  ajustarTamanho();
}

// ---------- Lista de dados ----------
const DEZENAS = ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
const UNIDADES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const cacheNumeros = new Map();
function numeros(lados) {
  if (!cacheNumeros.has(lados)) cacheNumeros.set(lados, Array.from({ length: lados }, (_, i) => String(i + 1)));
  return cacheNumeros.get(lados);
}

function listaDeDados(rol) {
  const lista = [];
  rol.termos.filter((t) => t.tipo === 'dado').forEach((t) => {
    t.valores.forEach((v, j) => {
      const mantido = t.mantidos[j];
      if (t.lados === 100) {
        lista.push({ geo: 10, rotulos: DEZENAS, alvo: Math.floor(v / 10) % 10, mantido });
        lista.push({ geo: 10, rotulos: UNIDADES, alvo: v % 10, mantido });
      } else {
        lista.push({ geo: t.lados, rotulos: numeros(t.lados), alvo: v - 1, mantido });
      }
    });
  });
  return lista;
}

// Lê só os tipos de dado da expressão (sem resultado), para começar a girar antes da resposta do servidor.
function dadosDaExpressao(expressao) {
  const e = String(expressao || '').toLowerCase().replace(/\s+/g, '');
  const re = /(\d*)d(\d+|%)(?:k[hl]\d+)?/g;
  const lista = [];
  let m;
  while ((m = re.exec(e))) {
    const qtd = m[1] === '' ? 1 : parseInt(m[1], 10);
    const lados = m[2] === '%' ? 100 : parseInt(m[2], 10);
    if (!SUPORTADOS.has(lados) || qtd < 1 || qtd > MAX_DADOS) return null;
    for (let i = 0; i < qtd; i++) {
      if (lados === 100) lista.push({ geo: 10, rotulos: DEZENAS }, { geo: 10, rotulos: UNIDADES });
      else lista.push({ geo: lados, rotulos: numeros(lados) });
    }
    if (lista.length > MAX_DADOS) return null;
  }
  return lista.length ? lista : null;
}

export function suporta(rol) {
  const termos = rol.termos.filter((t) => t.tipo === 'dado');
  if (!termos.length || !termos.every((t) => SUPORTADOS.has(t.lados))) return false;
  return termos.reduce((s, t) => s + t.qtd * (t.lados === 100 ? 2 : 1), 0) <= MAX_DADOS;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ---------- Sessão: uma rolagem na tela ----------
function preencherTopo(meta) {
  elTopo.replaceChildren();
  const autor = document.createElement('div');
  autor.className = 'palco-autor';
  autor.textContent = meta.nome;
  autor.style.setProperty('--cor', meta.cor === 'mestre' ? 'var(--ouro)' : meta.cor);
  const sub = document.createElement('div');
  sub.className = 'palco-sub';
  sub.textContent = [meta.rotulo, meta.expressao].filter(Boolean).join(' · ');
  elTopo.append(autor, sub);
  if (meta.oculta) {
    const tag = document.createElement('div');
    tag.className = 'palco-oculta';
    tag.textContent = 'Rolagem oculta · só você vê';
    elTopo.append(tag);
  }
}

function criarSessao(infos, meta) {
  preencherTopo(meta);
  elTotal.textContent = '';
  elDetalhe.replaceChildren();
  elCrit.textContent = '';
  palco.classList.remove('pousou', 'critico', 'falha', 'saindo');

  const idSkin = skinDe(meta.skin, meta.papel);
  const corDado = meta.cor === 'mestre' ? '#3a2a1a' : meta.cor;
  const dados = infos.map((info) => criarDado(info, idSkin, corDado));
  const n = dados.length;
  const colunas = Math.min(n, Math.max(1, Math.round(Math.sqrt(n * camera.aspect * 1.6))));
  const linhas = Math.ceil(n / colunas);
  const tg = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const meiaL = (colunas * ESPACO) / 2 + 0.9;
  const meiaA = (linhas * ESPACO) / 2 + 0.9;
  const dist = Math.max(7.2, meiaA / (tg * 0.6), meiaL / (tg * camera.aspect * 0.92));
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  const visivelA = dist * tg;
  const visivelL = visivelA * camera.aspect;
  const subir = visivelA * 0.06;

  dados.forEach((d, i) => {
    const col = i % colunas;
    const lin = Math.floor(i / colunas);
    const naLinha = Math.min(colunas, n - lin * colunas);
    d.final = new V((col - (naLinha - 1) / 2) * ESPACO, ((linhas - 1) / 2 - lin) * ESPACO + subir, 0);
    // Posição "na mão": agitando na parte de baixo da tela enquanto o resultado não chega
    d.mao = new V(d.final.x * 0.55, d.final.y * 0.3 - visivelA * 0.42, d.apoio + 1.2);
    d.eixoMao = new V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    d.corpo.position.copy(d.mao);
    d.corpo.quaternion.setFromAxisAngle(d.eixoMao, Math.random() * 6);
    d.atraso = i * 0.07;
    d.altura = 3.2 + Math.random() * 1.2;
    d.lado = Math.random() < 0.5 ? -1 : 1;
    scene.add(d.corpo);
  });

  // Prepara os materiais na placa de vídeo ANTES de começar, para o primeiro quadro não travar.
  renderer.compile(scene, camera);

  return {
    dados, meta, fase: 'mao', inicioArremesso: null, encerrado: false, aoFim: null,
    visivelA, visivelL, n, timerFechar: null, quadros: 0, tempoQuadros: 0, ultimo: null,
  };
}

const qTmp = new THREE.Quaternion();
const qRel = new THREE.Quaternion();

// Recebe o resultado do servidor e arremessa os dados até a face sorteada.
function resolverSessao(s, rol, infos, opcoes) {
  const meta = { ...s.meta, ...metaDe(rol, opcoes) };
  preencherTopo(meta);
  elTotal.textContent = String(rol.total);
  elDetalhe.replaceChildren(...(opcoes.detalhe ? [opcoes.detalhe] : []));
  elCrit.textContent = rol.destaque === 'critico' ? 'Crítico!' : rol.destaque === 'falha' ? 'Falha crítica' : '';
  s.rol = rol;
  s.proprio = !!opcoes.proprio;
  const vindoDaMao = s.fase === 'mao' && s.ultimo !== null;
  s.dados.forEach((d, i) => {
    mirar(d, infos[i].alvo);
    d.mantido = infos[i].mantido;
    if (vindoDaMao) {
      // Continua o giro de onde está: calcula a rotação que leva da posição atual até a face final
      d.inicio = d.corpo.position.clone();
      qRel.copy(d.qFinal).invert().multiply(d.corpo.quaternion);
      if (qRel.w < 0) { qRel.x = -qRel.x; qRel.y = -qRel.y; qRel.z = -qRel.z; qRel.w = -qRel.w; }
      const ang = 2 * Math.acos(Math.min(1, qRel.w));
      const sen = Math.sqrt(Math.max(0, 1 - qRel.w * qRel.w));
      d.eixo = sen < 1e-4 ? d.eixoMao.clone() : new V(qRel.x / sen, qRel.y / sen, qRel.z / sen);
      d.voltas = ang + Math.PI * 4;
      d.atraso = 0;
    } else {
      // Arremessado de fora da tela, de baixo, por um dos lados
      d.inicio = new V(d.lado * (s.visivelL + 2.5), -s.visivelA - 1.5 + Math.random() * s.visivelA, 0);
      d.eixo = new V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      d.voltas = Math.PI * (5 + Math.random() * 2.5);
    }
  });
  s.duracao = vindoDaMao ? DURACAO * 0.85 : DURACAO;
  s.fimDosDados = s.duracao + (s.n - 1) * (vindoDaMao ? 0 : 0.07);
  s.fase = 'arremesso';
  s.inicioArremesso = null;
}

function iniciarLaco(s) {
  palco.addEventListener('click', s.fechar = () => fecharSessao(s));
  document.addEventListener('keydown', s.teclar = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') fecharSessao(s); });
  palco.classList.add('ativo', 'visivel');

  const giro = new THREE.Quaternion();
  function quadro(agora) {
    if (s.encerrado) return;
    // Mede o desempenho (ignora o primeiro quadro) e baixa a resolução se estiver lento
    if (s.ultimo !== null) {
      const dt = agora - s.ultimo;
      if (dt < 250) { s.quadros++; s.tempoQuadros += dt; }
      if (s.quadros === 24) {
        if (s.tempoQuadros / s.quadros > 21) baixarQualidade();
        s.quadros = 0; s.tempoQuadros = 0;
      }
    }
    const dtSeg = s.ultimo === null ? 0 : Math.min(0.05, (agora - s.ultimo) / 1000);
    s.ultimo = agora;

    if (s.fase === 'mao') {
      const t = agora / 1000;
      s.dados.forEach((d, i) => {
        qTmp.setFromAxisAngle(d.eixoMao, dtSeg * 11);
        d.corpo.quaternion.premultiply(qTmp);
        d.corpo.position.set(
          d.mao.x + Math.sin(t * 19 + i) * 0.12,
          d.mao.y + Math.abs(Math.sin(t * 13 + i * 1.7)) * 0.35,
          d.mao.z,
        );
      });
    } else {
      if (s.inicioArremesso === null) s.inicioArremesso = agora;
      const t = (agora - s.inicioArremesso) / 1000;
      s.dados.forEach((d) => {
        const l = THREE.MathUtils.clamp((t - d.atraso) / s.duracao, 0, 1);
        const e = easeOut(l);
        d.corpo.position.lerpVectors(d.inicio, d.final, e);
        const zBase = THREE.MathUtils.lerp(d.inicio.z, d.apoio, e);
        d.corpo.position.z = zBase + d.altura * Math.abs(Math.cos(l * Math.PI * 2.5)) * Math.pow(1 - l, 2.2);
        giro.setFromAxisAngle(d.eixo, d.voltas * (1 - e));
        d.corpo.quaternion.copy(d.qFinal).multiply(giro);
      });
      if (s.fase === 'arremesso' && t >= s.fimDosDados) aoPousar(s);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);
}

function aoPousar(s) {
  s.fase = 'pousado';
  const rol = s.rol;
  s.dados.forEach((d) => {
    if (d.mantido) return;
    d.matCorpo.color.lerp(new THREE.Color('#5a5048'), 0.75);
    d.matCorpo.transparent = true;
    d.matCorpo.opacity = Math.min(d.matCorpo.opacity, 0.45);
    if (d.matCorpo.emissiveIntensity) d.matCorpo.emissiveIntensity *= 0.15;
    d.matsNumero.forEach((m) => { m.opacity = 0.35; if (m.emissiveIntensity) m.emissiveIntensity *= 0.3; });
  });
  if (rol.destaque === 'critico') {
    s.dados.forEach((d) => {
      if (!d.mantido) return;
      d.matsNumero.forEach((m) => { if (m.emissive) { m.emissive.set('#ffd36a'); m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.2); } });
    });
  }
  palco.classList.add('pousou');
  if (rol.destaque) palco.classList.add(rol.destaque);
  // Tempo parado na tela: menor para rolagens dos outros e quando há outras na fila
  let espera = s.proprio ? 1500 : 1100;
  if (fila.length) espera = 650;
  if (rol.destaque) espera += 800;
  s.timerFechar = setTimeout(() => fecharSessao(s), espera);
}

function fecharSessao(s) {
  if (s.encerrado) return;
  s.encerrado = true;
  clearTimeout(s.timerFechar);
  clearTimeout(s.timerEspera);
  palco.removeEventListener('click', s.fechar);
  document.removeEventListener('keydown', s.teclar);
  if (preRolagem === s) preRolagem = null;
  palco.classList.add('saindo');
  palco.classList.remove('visivel');
  setTimeout(() => {
    s.dados.forEach((d) => { scene.remove(d.corpo); d.descartar(); });
    renderer.clear();
    palco.classList.remove('ativo');
    ocupado = false;
    if (s.aoFim) s.aoFim();
    proximo();
  }, 200);
}

function metaDe(rol, opcoes = {}) {
  return {
    nome: opcoes.nome || rol.autor, cor: opcoes.cor || '#7a1f1f', skin: rol.skin, papel: rol.papel,
    oculta: rol.oculta, rotulo: rol.rotulo, expressao: rol.expressao,
  };
}

// ---------- Fila de exibição (uma rolagem por vez) ----------
const fila = [];
let ocupado = false;
let preRolagem = null;

// Chamado no clique: abre a tela e começa a agitar os dados na hora. Devolve um código do pedido.
export function preRolar(expressao, meta = {}) {
  if (ocupado || fila.length || !iniciar()) return null;
  const infos = dadosDaExpressao(expressao);
  if (!infos) return null;
  const s = criarSessao(infos, { ...meta, expressao: String(expressao).toLowerCase().replace(/\s+/g, '') });
  s.token = Math.random().toString(36).slice(2, 12);
  ocupado = true;
  preRolagem = s;
  // Se o servidor não responder, fecha sozinho
  s.timerEspera = setTimeout(() => fecharSessao(s), 8000);
  iniciarLaco(s);
  return s.token;
}

export function cancelarPreRolagem(token) {
  if (preRolagem && preRolagem.token === token) fecharSessao(preRolagem);
}

export function mostrar(rol, opcoes = {}) {
  return new Promise((resolver) => {
    if (!suporta(rol) || !iniciar()) { resolver(false); return; }
    // Resultado do pedido que já está girando na tela
    if (preRolagem && rol.pedido && rol.pedido === preRolagem.token) {
      const s = preRolagem;
      const infos = listaDeDados(rol);
      const iguais = infos.length === s.dados.length && infos.every((info, i) => info.geo === s.dados[i].geo);
      if (iguais) {
        preRolagem = null;
        clearTimeout(s.timerEspera);
        s.aoFim = () => resolver(true);
        resolverSessao(s, rol, infos, opcoes);
        return;
      }
      fecharSessao(s); // não bateu (caso raro): fecha e mostra do jeito normal
    }
    if (fila.length >= 3) { resolver(false); return; }
    fila.push({ rol, opcoes, resolver });
    proximo();
  });
}

function proximo() {
  if (ocupado || !fila.length) return;
  const item = fila.shift();
  ocupado = true;
  try {
    const infos = listaDeDados(item.rol);
    const s = criarSessao(infos, metaDe(item.rol, item.opcoes));
    s.aoFim = () => item.resolver(true);
    resolverSessao(s, item.rol, infos, item.opcoes);
    iniciarLaco(s);
  } catch (e) {
    console.error(e);
    ocupado = false;
    item.resolver(false);
    proximo();
  }
}

// ---------- Pré-aquecimento ----------
// Gera texturas e prepara os materiais do visual escolhido enquanto o navegador está ocioso,
// para a primeira rolagem já sair lisa.
// A cor não muda o programa da placa de vídeo, então basta aquecer uma vez por visual.
const aquecidos = new Map();
export function preaquecer(skin, papel, cor = '#7a1f1f') {
  const id = skinDe(skin, papel);
  if (aquecidos.has(id)) return;
  aquecidos.set(id, null);
  const tarefa = async () => {
    if (!iniciar()) return;
    const d = criarDado({ geo: 20, rotulos: numeros(20), alvo: 19 }, id, cor === 'mestre' ? '#3a2a1a' : cor);
    const cena = new THREE.Scene();
    cena.environment = scene.environment;
    cena.environmentIntensity = scene.environmentIntensity;
    scene.children.filter((o) => o.isLight).forEach((l) => cena.add(l.clone()));
    cena.add(d.corpo);
    const cam = camera.clone();
    cam.position.set(0, 0, 8);
    cam.lookAt(0, 0, 0);
    // compileAsync compila sem travar a página (quando o navegador permite)
    try {
      if (renderer.compileAsync) await renderer.compileAsync(cena, cam);
      else renderer.compile(cena, cam);
    } catch (e) { console.warn(e); }
    cena.remove(d.corpo);
    // Mantém os materiais vivos (sem descartar) para a placa de vídeo não esquecer o que compilou
    aquecidos.set(id, d);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(tarefa, { timeout: 600 });
  else setTimeout(tarefa, 100);
}

// ============================================================
// Vitrine: galeria para escolher a skin, com um d20 girando em cada cartão
// ============================================================
let vitrine = null;

function montarVitrine() {
  const el = document.createElement('div');
  el.className = 'vitrine';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'vitrine-titulo');
  el.innerHTML = `
    <div class="vitrine-painel pergaminho">
      <header class="vitrine-topo">
        <div>
          <h2 id="vitrine-titulo">Escolha seus dados</h2>
          <p>Todos na mesa verão suas rolagens com este visual.</p>
        </div>
        <button type="button" class="vitrine-fechar" aria-label="Fechar">✕</button>
      </header>
      <div class="vitrine-grade"></div>
    </div>
    <canvas class="vitrine-canvas" aria-hidden="true"></canvas>`;
  document.body.append(el);
  const grade = el.querySelector('.vitrine-grade');
  const cartoes = LISTA_SKINS.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skin-cartao';
    b.dataset.skin = s.id;
    b.innerHTML = '<span class="skin-palco"></span><span class="skin-nome"></span><span class="skin-desc"></span><span class="skin-uso">Em uso</span>';
    b.querySelector('.skin-nome').textContent = s.nome;
    b.querySelector('.skin-desc').textContent = s.descricao;
    grade.append(b);
    return { id: s.id, el: b, palcoEl: b.querySelector('.skin-palco'), dado: null, impulso: 0, hover: false };
  });

  const r = novoRenderizador(el.querySelector('.vitrine-canvas'));
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  r.setScissorTest(true);
  const cena = new THREE.Scene();
  iluminar(cena, r);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 5.4);

  vitrine = { el, grade, cartoes, r, cena, cam, aberta: false, cor: '#7a1f1f', aoEscolher: null, fechar: null };

  cartoes.forEach((c) => {
    c.el.addEventListener('mouseenter', () => { c.hover = true; });
    c.el.addEventListener('mouseleave', () => { c.hover = false; });
    c.el.addEventListener('click', () => {
      c.impulso = 1;
      marcarSelecionada(c.id);
      if (vitrine.aoEscolher) vitrine.aoEscolher(c.id);
    });
  });
  el.querySelector('.vitrine-fechar').addEventListener('click', () => vitrine.fechar());
  el.addEventListener('click', (e) => { if (e.target === el) vitrine.fechar(); });
  return vitrine;
}

function marcarSelecionada(id) {
  vitrine.cartoes.forEach((c) => {
    c.el.classList.toggle('ativo', c.id === id);
    c.el.setAttribute('aria-pressed', String(c.id === id));
  });
}

function prepararDadosVitrine(cor) {
  vitrine.cartoes.forEach((c, i) => {
    if (c.dado && !(c.id === 'classico' && vitrine.cor !== cor)) return;
    if (c.dado) { vitrine.cena.remove(c.dado.corpo); c.dado.descartar(); }
    c.dado = criarDado({ geo: 20, rotulos: Array.from({ length: 20 }, (_, k) => String(k + 1)), alvo: 19, mantido: true }, c.id, cor);
    c.dado.corpo.position.set(0, 0, 0);
    c.dado.corpo.rotation.set(0.4, i * 0.7, 0);
    c.dado.corpo.visible = false;
    vitrine.cena.add(c.dado.corpo);
  });
  vitrine.cor = cor;
}

function quadroVitrine(agora) {
  if (!vitrine.aberta) return;
  const { r, cena, cam, grade, cartoes } = vitrine;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const tam = r.getSize(new THREE.Vector2());
  if (tam.x !== W || tam.y !== H) r.setSize(W, H, false);
  r.setScissor(0, 0, W, H);
  r.setClearColor(0x000000, 0);
  r.clear();
  const limite = grade.getBoundingClientRect();
  cartoes.forEach((c, i) => {
    const rc = c.palcoEl.getBoundingClientRect();
    const topo = Math.max(rc.top, limite.top);
    const baixo = Math.min(rc.bottom, limite.bottom);
    if (baixo <= topo || rc.right < 0 || rc.left > W || !c.dado) return;
    c.impulso *= 0.96;
    const vel = (c.hover ? 2.2 : 0.6) + c.impulso * 14;
    c.dado.corpo.rotation.y += 0.016 * vel;
    c.dado.corpo.rotation.x = 0.35 + Math.sin(agora * 0.0006 + i) * 0.35;
    cartoes.forEach((o) => { if (o.dado) o.dado.corpo.visible = o === c; });
    r.setViewport(rc.left, H - rc.bottom, rc.width, rc.height);
    r.setScissor(rc.left, H - baixo, rc.width, baixo - topo);
    cam.aspect = rc.width / rc.height;
    cam.updateProjectionMatrix();
    r.render(cena, cam);
  });
  requestAnimationFrame(quadroVitrine);
}

export function abrirVitrine({ atual, papel, cor = '#7a1f1f', aoEscolher } = {}) {
  return new Promise((resolver) => {
    try { if (!vitrine) montarVitrine(); } catch (e) { console.warn('Galeria 3D indisponível:', e); resolver(); return; }
    prepararDadosVitrine(cor);
    marcarSelecionada(skinDe(atual, papel));
    vitrine.aoEscolher = aoEscolher;
    const anterior = document.activeElement;
    const teclar = (e) => { if (e.key === 'Escape') vitrine.fechar(); };
    vitrine.fechar = () => {
      if (!vitrine.aberta) return;
      vitrine.aberta = false;
      vitrine.el.classList.remove('aberta');
      document.removeEventListener('keydown', teclar);
      if (anterior && anterior.focus) anterior.focus();
      resolver();
    };
    document.addEventListener('keydown', teclar);
    vitrine.aberta = true;
    vitrine.el.classList.add('aberta');
    vitrine.el.querySelector('.skin-cartao.ativo')?.focus();
    requestAnimationFrame(quadroVitrine);
  });
}

document.fonts && document.fonts.load('700 120px Cinzel').catch(() => {});
