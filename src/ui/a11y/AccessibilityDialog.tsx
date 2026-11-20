import { useEffect, useRef, useSyncExternalStore } from 'react';
import { TOOLS } from '../../editor/Editor';
import {
  getA11y, resetA11y, setA11y, subscribeA11y, UI_SCALES,
  type ColorVision, type ContrastChoice, type FontChoice, type MotionChoice,
} from './settings';

export function useA11y() {
  return useSyncExternalStore(subscribeA11y, getA11y);
}

const FONT_OPTIONS: { id: FontChoice; name: string; desc: string }[] = [
  { id: 'tematica', name: 'Temática', desc: 'Títulos e botões com letras de pergaminho' },
  { id: 'simples', name: 'Simples', desc: 'Toda a interface com a fonte do sistema' },
  { id: 'legivel', name: 'Alta legibilidade', desc: 'Atkinson Hyperlegible, feita para baixa visão' },
];

const VISION_OPTIONS: { id: ColorVision; name: string; desc: string }[] = [
  { id: 'normal', name: 'Sem filtro', desc: 'Cores originais' },
  { id: 'protanopia', name: 'Protanopia', desc: 'Dificuldade com vermelho' },
  { id: 'deuteranopia', name: 'Deuteranopia', desc: 'Dificuldade com verde' },
  { id: 'tritanopia', name: 'Tritanopia', desc: 'Dificuldade com azul e amarelo' },
];

const MOTION_OPTIONS: { id: MotionChoice; name: string }[] = [
  { id: 'sistema', name: 'Seguir o sistema' },
  { id: 'reduzir', name: 'Reduzir' },
  { id: 'normal', name: 'Animações completas' },
];

type Shortcut = [keys: string[], action: string];

/** Atalhos que funcionam com uma tecla só (podem ser desligados). */
const SINGLE_KEY: Shortcut[] = [
  ...TOOLS.map((t): Shortcut => [[t.key.toUpperCase()], t.name]),
  [['1', '9'], 'Escolher terreno (1 a 9)'],
  [['[', ']'], 'Diminuir e aumentar o pincel ou a seleção'],
  [['R', 'Shift+R'], 'Girar a seleção'],
  [['+', '−'], 'Aumentar e diminuir o zoom'],
  [['0'], 'Enquadrar o mapa'],
];

/** Atalhos que continuam ativos sempre. */
const ALWAYS: Shortcut[] = [
  [['Ctrl+Z'], 'Desfazer'],
  [['Ctrl+Shift+Z', 'Ctrl+Y'], 'Refazer'],
  [['Ctrl+S'], 'Salvar arquivo'],
  [['Ctrl+O'], 'Abrir arquivo'],
  [['Ctrl+Alt+A'], 'Abrir estas configurações'],
  [['Setas'], 'Mover o mapa'],
  [['Espaço'], 'Segure e arraste para mover o mapa'],
  [['Delete'], 'Apagar a seleção'],
  [['Esc'], 'Limpar régua ou seleção, fechar diálogos'],
];

function Shortcuts({ list }: { list: Shortcut[] }) {
  return (
    <dl className="shortcut-list">
      {list.map(([keys, action]) => (
        <div key={action}>
          <dt>{keys.map((k, i) => <span key={k}>{i > 0 && ' '}<kbd>{k}</kbd></span>)}</dt>
          <dd>{action}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Configurações de acessibilidade: tamanho, fonte, contraste, cores, movimento e teclado. Tudo vale na hora. */
export function AccessibilityDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const s = useA11y();

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const scaleIndex = Math.max(0, UI_SCALES.findIndex((v) => Math.abs(v - s.uiScale) < 0.01));

  return (
    <dialog ref={ref} className="dialog dialog-wide a11y-dialog" aria-labelledby="a11y-title">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); onClose(); }}>
        <h2 id="a11y-title">Acessibilidade</h2>
        <p className="help">As mudanças valem na hora e ficam salvas neste navegador, também na janela dos jogadores.</p>

        <section className="a11y-section" aria-labelledby="a11y-size">
          <h3 id="a11y-size">Tamanho e texto</h3>
          <label className="a11y-range">
            <span>Tamanho da interface <output>{Math.round(s.uiScale * 100)}%</output></span>
            <input
              type="range"
              min={0}
              max={UI_SCALES.length - 1}
              step={1}
              value={scaleIndex}
              aria-label="Tamanho da interface"
              aria-valuetext={`${Math.round(s.uiScale * 100)}%`}
              onChange={(e) => setA11y({ uiScale: UI_SCALES[Number(e.target.value)] })}
            />
          </label>
          <fieldset className="choice-cards">
            <legend>Fonte</legend>
            {FONT_OPTIONS.map((o) => (
              <label key={o.id} className={`choice-card font-${o.id}${s.font === o.id ? ' active' : ''}`}>
                <input type="radio" name="a11y-font" checked={s.font === o.id} onChange={() => setA11y({ font: o.id })} />
                <strong>{o.name}</strong>
                <span>{o.desc}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="a11y-section" aria-labelledby="a11y-colors">
          <h3 id="a11y-colors">Cores e contraste</h3>
          <label className="switch">
            <input
              type="checkbox"
              checked={s.contrast === 'alto'}
              onChange={(e) => setA11y({ contrast: (e.target.checked ? 'alto' : 'normal') as ContrastChoice })}
            />
            <span className="switch-track" aria-hidden="true" />
            <span>Alto contraste</span>
          </label>
          <fieldset className="choice-cards four">
            <legend>Filtro para daltonismo (no mapa)</legend>
            {VISION_OPTIONS.map((o) => (
              <label key={o.id} className={`choice-card${s.colorVision === o.id ? ' active' : ''}`}>
                <input type="radio" name="a11y-vision" checked={s.colorVision === o.id} onChange={() => setA11y({ colorVision: o.id })} />
                <span className={`vision-sample cv-${o.id}`} aria-hidden="true"><i /><i /><i /><i /></span>
                <strong>{o.name}</strong>
                <span>{o.desc}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="a11y-section" aria-labelledby="a11y-motion">
          <h3 id="a11y-motion">Movimento e foco</h3>
          <fieldset className="segmented-radio">
            <legend>Animações da interface</legend>
            {MOTION_OPTIONS.map((o) => (
              <label key={o.id} className={s.motion === o.id ? 'active' : ''}>
                <input type="radio" name="a11y-motion" checked={s.motion === o.id} onChange={() => setA11y({ motion: o.id })} />
                {o.name}
              </label>
            ))}
          </fieldset>
          <label className="switch">
            <input type="checkbox" checked={s.strongFocus} onChange={(e) => setA11y({ strongFocus: e.target.checked })} />
            <span className="switch-track" aria-hidden="true" />
            <span>Destacar o foco do teclado</span>
          </label>
        </section>

        <section className="a11y-section" aria-labelledby="a11y-keys">
          <h3 id="a11y-keys">Atalhos de teclado</h3>
          <label className="switch">
            <input type="checkbox" checked={s.letterShortcuts} onChange={(e) => setA11y({ letterShortcuts: e.target.checked })} />
            <span className="switch-track" aria-hidden="true" />
            <span>Atalhos de uma tecla só</span>
          </label>
          <p className="help">
            Desligue se você usa leitor de tela, ditado por voz ou costuma apertar teclas sem querer. Os atalhos com Ctrl continuam funcionando.
          </p>
          <div className="shortcut-columns">
            <div className={s.letterShortcuts ? '' : 'dimmed'}>
              <h4>Uma tecla</h4>
              <Shortcuts list={SINGLE_KEY} />
            </div>
            <div>
              <h4>Sempre ativos</h4>
              <Shortcuts list={ALWAYS} />
            </div>
          </div>
        </section>

        <div className="actions">
          <button type="button" className="danger-text" onClick={resetA11y}>Restaurar padrão</button>
          <button type="submit" className="primary">Fechar</button>
        </div>
      </form>
    </dialog>
  );
}
