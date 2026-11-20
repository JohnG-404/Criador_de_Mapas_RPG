/**
 * Configurações de acessibilidade: guardadas no navegador e aplicadas como
 * atributos em <html>, para que o CSS (theme.css) e o editor reajam a elas.
 * Valem para o editor e para a janela dos jogadores (mesmo navegador).
 */

export type FontChoice = 'tematica' | 'simples' | 'legivel';
export type ContrastChoice = 'normal' | 'alto';
export type MotionChoice = 'sistema' | 'reduzir' | 'normal';
export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface A11ySettings {
  /** Escala da interface (painéis, barras e diálogos). O mapa não muda. */
  uiScale: number;
  font: FontChoice;
  contrast: ContrastChoice;
  motion: MotionChoice;
  /** Filtro de correção de cores aplicado ao mapa. */
  colorVision: ColorVision;
  /** Contorno de foco mais grosso e visível ao navegar pelo teclado. */
  strongFocus: boolean;
  /** Atalhos de uma tecla só (letras, números, [ ] e R). */
  letterShortcuts: boolean;
}

export const UI_SCALES = [0.85, 1, 1.15, 1.3, 1.5] as const;

export const DEFAULT_A11Y: A11ySettings = {
  uiScale: 1,
  font: 'tematica',
  contrast: 'normal',
  motion: 'sistema',
  colorVision: 'normal',
  strongFocus: false,
  letterShortcuts: true,
};

const STORAGE_KEY = 'atlas-board:acessibilidade';

const FONTS: FontChoice[] = ['tematica', 'simples', 'legivel'];
const CONTRASTS: ContrastChoice[] = ['normal', 'alto'];
const MOTIONS: MotionChoice[] = ['sistema', 'reduzir', 'normal'];
const VISIONS: ColorVision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];

function pick<T>(list: readonly T[], v: unknown, fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

/** Lê um objeto qualquer (ex.: JSON salvo) e devolve configurações válidas. */
export function sanitizeA11y(raw: unknown): A11ySettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const scale = Number(r.uiScale);
  return {
    uiScale: Number.isFinite(scale) ? Math.min(1.5, Math.max(0.85, scale)) : DEFAULT_A11Y.uiScale,
    font: pick(FONTS, r.font, DEFAULT_A11Y.font),
    contrast: pick(CONTRASTS, r.contrast, DEFAULT_A11Y.contrast),
    motion: pick(MOTIONS, r.motion, DEFAULT_A11Y.motion),
    colorVision: pick(VISIONS, r.colorVision, DEFAULT_A11Y.colorVision),
    strongFocus: typeof r.strongFocus === 'boolean' ? r.strongFocus : DEFAULT_A11Y.strongFocus,
    letterShortcuts: typeof r.letterShortcuts === 'boolean' ? r.letterShortcuts : DEFAULT_A11Y.letterShortcuts,
  };
}

function load(): A11ySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeA11y(JSON.parse(raw)) : { ...DEFAULT_A11Y };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

let current: A11ySettings = typeof localStorage === 'undefined' ? { ...DEFAULT_A11Y } : load();
const listeners = new Set<() => void>();

export function getA11y(): A11ySettings {
  return current;
}

export function subscribeA11y(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setA11y(patch: Partial<A11ySettings>) {
  current = sanitizeA11y({ ...current, ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Navegação privada ou armazenamento cheio: vale só nesta sessão.
  }
  applyA11y();
  listeners.forEach((fn) => fn());
}

export function resetA11y() {
  setA11y({ ...DEFAULT_A11Y });
}

/** Aplica as configurações atuais ao documento. Chamado no início e a cada mudança. */
export function applyA11y(root: HTMLElement = document.documentElement) {
  const s = current;
  root.dataset.font = s.font;
  root.dataset.contrast = s.contrast;
  root.dataset.motion = s.motion;
  root.dataset.colorVision = s.colorVision;
  root.dataset.focus = s.strongFocus ? 'forte' : 'normal';
  root.style.setProperty('--ui-scale', String(s.uiScale));
  ensureColorFilters();
}

/** Mantém janelas abertas no mesmo navegador (editor e jogadores) em sincronia. */
export function syncA11yAcrossWindows() {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    current = load();
    applyA11y();
    listeners.forEach((fn) => fn());
  });
}

// ---- filtros de cor para daltonismo

type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Simulação de visão dicromática (Machado, Oliveira e Fernandes, 2009, severidade 1), em RGB linear. */
const SIMULATION: Record<Exclude<ColorVision, 'normal'>, Mat3> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

/** Para onde vai a informação de cor perdida (o "erro" da simulação). */
const SHIFT: Record<Exclude<ColorVision, 'normal'>, Mat3> = {
  protanopia: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  deuteranopia: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  tritanopia: [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0],
};

function mul(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    let v = 0;
    for (let k = 0; k < 3; k++) v += a[r * 3 + k] * b[k * 3 + c];
    out[r * 3 + c] = v;
  }
  return out;
}

/**
 * Matriz de correção (daltonização): M = I + E·(I − S). As cores que a pessoa
 * confundiria são empurradas para canais que ela distingue.
 */
export function daltonizeMatrix(kind: Exclude<ColorVision, 'normal'>): Mat3 {
  const s = SIMULATION[kind];
  const iMinusS = s.map((v, i) => (i % 4 === 0 ? 1 : 0) - v) as Mat3;
  const shifted = mul(SHIFT[kind], iMinusS);
  return shifted.map((v, i) => (i % 4 === 0 ? 1 : 0) + v) as Mat3;
}

/** Valores para <feColorMatrix type="matrix"> (4×5, alfa intacto). */
export function feColorMatrixValues(m: Mat3): string {
  const f = (v: number) => (Math.round(v * 10000) / 10000).toString();
  return [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0, 0, 0, 1, 0,
  ].map(f).join(' ');
}

const FILTERS_ID = 'atlas-color-filters';

function ensureColorFilters() {
  if (typeof document === 'undefined' || document.getElementById(FILTERS_ID)) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.id = FILTERS_ID;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
    const filter = document.createElementNS(ns, 'filter');
    filter.id = `cv-${kind}`;
    filter.setAttribute('color-interpolation-filters', 'linearRGB');
    const fe = document.createElementNS(ns, 'feColorMatrix');
    fe.setAttribute('type', 'matrix');
    fe.setAttribute('values', feColorMatrixValues(daltonizeMatrix(kind)));
    filter.appendChild(fe);
    svg.appendChild(filter);
  }
  document.body.appendChild(svg);
}
