import { DiceError } from '../core/dice/dice';
import { cleanName, cleanRoll, makeRoll, playerColor, RollLog, SKIN_NAMES, type Papel, type Rolagem } from './rolls';

export type Mode3d = 'todas' | 'minhas' | 'desligado';

const KEY_NAME = 'atlas-board:nome';
const KEY_SKIN = 'atlas-board:dados-skin';
const KEY_MODE = 'atlas-board:dados-3d';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* aba anônima: só não lembra */ }
}

type Dice3d = typeof import('../dice3d/dados3d.js');
let dice3d: Promise<Dice3d | null> | null = null;
/** Carrega o dado 3D (three.js) só quando a primeira rolagem acontece. */
export function loadDice3d(): Promise<Dice3d | null> {
  dice3d ??= import('../dice3d/dados3d.js').catch(() => null);
  return dice3d;
}

/**
 * A mesa de dados de uma tela (mestre ou jogador): rola, guarda a crônica,
 * anima o dado 3D e manda as rolagens públicas para os outros.
 * As rolagens ocultas do mestre nunca são enviadas.
 */
export class DiceTable {
  readonly log = new RollLog();
  private sendFns = new Set<(r: Rolagem) => void>();
  /** Rolagens com o dado 3D ainda girando (o total fica escondido na crônica). */
  private rolling = new Set<string>();
  private listeners = new Set<() => void>();
  private version = 0;
  name: string;
  skin: string | null;
  mode: Mode3d;
  /** Mestre: as próximas rolagens saem ocultas (só ele vê). Começa ligado, como no rolador. */
  hidden: boolean;
  /** Clarão de crítico/falha sem o 3D (o painel escuta). */
  onFlash: ((kind: 'critico' | 'falha') => void) | null = null;

  constructor(readonly papel: Papel) {
    this.name = cleanName(read(KEY_NAME)) || (papel === 'mestre' ? 'Mestre' : '');
    const s = read(KEY_SKIN);
    this.skin = s && SKIN_NAMES[s] ? s : null;
    const m = read(KEY_MODE);
    this.mode = m === 'minhas' || m === 'desligado' ? m : 'todas';
    this.hidden = papel === 'mestre';
    this.log.subscribe(() => this.emit());
  }

  /** Visual efetivo: o escolhido, ou o padrão de cada papel. */
  get effectiveSkin() { return this.skin ?? (this.papel === 'mestre' ? 'obsidiana' : 'classico'); }
  get color() { return playerColor(this.name, this.papel); }

  setName(name: string) { this.name = cleanName(name); write(KEY_NAME, this.name); this.emit(); }
  setSkin(skin: string) { this.skin = SKIN_NAMES[skin] ? skin : null; write(KEY_SKIN, skin); this.emit(); }
  setHidden(hidden: boolean) { this.hidden = hidden && this.papel === 'mestre'; this.emit(); }
  setMode(mode: Mode3d) { this.mode = mode; write(KEY_MODE, mode); this.emit(); }

  /** Liga um canal de saída (sala online, janela dos jogadores). Devolve como desligar. */
  addSender(fn: (r: Rolagem) => void) {
    this.sendFns.add(fn);
    return () => { this.sendFns.delete(fn); };
  }

  /**
   * Rola e mostra. Devolve a rolagem, ou a mensagem de erro da expressão.
   * anim: false põe direto na crônica (ex.: iniciativa de vários tokens).
   */
  roll(expr: string, opts: { rotulo?: string; oculta?: boolean; anim?: boolean } = {}): Rolagem | string {
    let r: Rolagem;
    try {
      r = makeRoll(expr, { autor: this.name, papel: this.papel, skin: this.effectiveSkin }, opts);
    } catch (e) {
      if (e instanceof DiceError) return e.message;
      throw e;
    }
    this.add(r, opts.anim !== false);
    if (!r.oculta) this.sendFns.forEach((fn) => fn(r));
    return r;
  }

  /** Mestre: mostra para a mesa uma rolagem oculta. */
  reveal(id: string) {
    const r = this.log.get(id);
    if (!r?.oculta || this.papel !== 'mestre') return;
    const shown: Rolagem = { ...r, oculta: false, revelada: true, horaRevelada: Date.now() };
    this.log.upsert(shown);
    this.sendFns.forEach((fn) => fn(shown));
  }

  /** Rolagem com a escolha atual de oculta (fichas, botões rápidos). */
  quick(expr: string, rotulo: string) { return this.roll(expr, { rotulo, oculta: this.hidden }); }

  /** Rolagem que chegou de outra tela. */
  receive(raw: unknown) {
    const r = cleanRoll(raw);
    // Só existe um mestre: o que chega na tela dele é sempre de jogador.
    if (r) this.add(this.papel === 'mestre' ? { ...r, papel: 'jogador' } : r, true);
  }

  /** Histórico que chegou ao entrar na mesa: sem animação. */
  receiveHistory(list: unknown) {
    if (!Array.isArray(list)) return;
    for (const raw of list.slice(-100)) {
      const r = cleanRoll(raw);
      if (r && !this.log.get(r.id)) this.log.upsert(r);
    }
  }

  isRolling = (id: string) => this.rolling.has(id);

  private add(r: Rolagem, animate: boolean) {
    const mine = r.autor === this.name && r.papel === this.papel;
    if (!this.log.upsert(r)) return;
    if (!animate || this.mode === 'desligado') return;
    if (this.mode === 'minhas' && !mine) return;
    this.rolling.add(r.id);
    this.emit();
    const done = (shown: boolean) => {
      this.rolling.delete(r.id);
      if (!shown && r.destaque) this.onFlash?.(r.destaque);
      this.emit();
    };
    void loadDice3d().then((m) => {
      if (!m || !m.suporta(r)) return done(false);
      const nome = r.papel === 'mestre' ? `👑 ${r.autor}` : r.autor;
      return m.mostrar(r, { nome, cor: r.papel === 'mestre' ? 'mestre' : playerColor(r.autor, r.papel), detalhe: detailElement(r), proprio: mine }).then(done);
    }).catch(() => done(false));
  }

  // ---- estado observável para o React
  getVersion = () => this.version;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  private emit() { this.version++; this.listeners.forEach((fn) => fn()); }
}

/** Detalhe dos dados para a tela 3D: "2d6 [4, 2] + 3", com máximos e mínimos marcados. */
export function detailElement(r: Rolagem): HTMLElement {
  const d = document.createElement('div');
  d.className = 'r-detalhe';
  r.termos.forEach((t, i) => {
    if (i > 0 || t.sinal < 0) d.append(t.sinal < 0 ? ' − ' : ' + ');
    if (t.tipo === 'mod') { d.append(String(t.valor)); return; }
    const code = document.createElement('code');
    code.textContent = `${t.qtd}d${t.lados}${t.manter ?? ''}`;
    d.append(code, ' [');
    t.valores.forEach((v, j) => {
      if (j > 0) d.append(', ');
      const s = document.createElement('span');
      s.className = !t.mantidos[j] ? 'descartado' : v === t.lados ? 'max' : v === 1 ? 'min' : '';
      s.textContent = String(v);
      d.append(s);
    });
    d.append(']');
  });
  return d;
}
