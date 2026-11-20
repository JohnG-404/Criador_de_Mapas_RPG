import { useRef, useState, useSyncExternalStore } from 'react';
import type { DieTerm } from '../../core/dice/dice';
import { loadDice3d, type DiceTable, type Mode3d } from '../../table/DiceTable';
import { playerColor, SKIN_NAMES, type Rolagem } from '../../table/rolls';
import { DiceIcon } from './DiceIcon';

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const MODES: { id: Mode3d; label: string; title?: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'minhas', label: 'Só as minhas' },
  { id: 'desligado', label: 'Sem 3D', title: 'Mostra só na crônica, sem o dado 3D na tela' },
];

/** Rolador de dados da mesa (portado do rolador-dados) e a crônica das rolagens. */
export function DicePanel({ dice }: { dice: DiceTable }) {
  useSyncExternalStore(dice.subscribe, dice.getVersion);
  const [qtd, setQtd] = useState(1);
  const [mod, setMod] = useState(0);
  const [expr, setExpr] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState(dice.name);
  const gm = dice.papel === 'mestre';
  const needsName = !gm && !dice.name;

  // Aquece o dado 3D no primeiro toque no painel (não ao abrir: um contexto WebGL
  // a mais só para quem vai rolar), para a 1ª rolagem não engasgar.
  const warm = useRef(false);
  const warmUp = () => {
    if (warm.current || dice.mode === 'desligado') return;
    warm.current = true;
    void loadDice3d().then((m) => m?.preaquecer(dice.effectiveSkin, dice.papel, gm ? 'mestre' : dice.color));
  };

  const modText = mod === 0 ? '' : mod > 0 ? `+${mod}` : `${mod}`;
  const roll = (e: string) => {
    if (needsName) { setError('Digite seu nome antes de rolar.'); return; }
    const r = dice.roll(e, { rotulo: label, oculta: dice.hidden });
    setError(typeof r === 'string' ? r : '');
  };

  const chooseSkin = () => {
    void loadDice3d().then((m) => {
      if (!m) { setError('O dado 3D não carregou neste navegador.'); return; }
      void m.abrirVitrine({ atual: dice.effectiveSkin, papel: dice.papel, cor: gm ? '#3a2a1a' : dice.color, aoEscolher: (id) => dice.setSkin(id) });
    });
  };

  const history = [...dice.log.all()].sort((a, b) => (b.horaRevelada ?? b.hora) - (a.horaRevelada ?? a.hora));

  return (
    <div className="dice-panel" onPointerDown={warmUp}>
      {needsName || !gm ? (
        <label className="dice-name">
          <span>Seu nome</span>
          <input
            value={name}
            maxLength={24}
            placeholder="Ex.: Aragorn"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => dice.setName(name)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </label>
      ) : null}
      <div className="dice-steppers">
        <Stepper label="Quantidade" value={String(qtd)} dec={() => setQtd((q) => Math.max(1, q - 1))} inc={() => setQtd((q) => Math.min(20, q + 1))} names={['Menos dados', 'Mais dados']} />
        <Stepper label="Modificador" value={mod >= 0 ? `+${mod}` : `−${-mod}`} dec={() => setMod((m) => Math.max(-99, m - 1))} inc={() => setMod((m) => Math.min(99, m + 1))} names={['Diminuir modificador', 'Aumentar modificador']} />
      </div>
      <div className="dice-buttons">
        {SIDES.map((s) => (
          <button key={s} className={s === 20 ? 'd20' : ''} onClick={() => roll(`${qtd}d${s}${modText}`)} aria-label={`Rolar d${s}`}>
            <span className="dice-icon-wrap"><DiceIcon sides={s} label={s === 100 ? '%' : s} /></span>
            <span>d{s}</span>
          </button>
        ))}
      </div>
      <div className="dice-adv">
        <button onClick={() => roll(`2d20kh1${modText}`)}>Vantagem <small>2d20, o maior</small></button>
        <button onClick={() => roll(`2d20kl1${modText}`)}>Desvantagem <small>2d20, o menor</small></button>
      </div>
      <form className="dice-free" onSubmit={(e) => { e.preventDefault(); if (expr.trim()) roll(expr.trim()); }}>
        <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="Livre: 2d6+1d4+3, 4d6kh3" maxLength={60} aria-label="Expressão livre" />
        <button type="submit" className="primary">Rolar</button>
      </form>
      <input className="dice-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Descrição (opcional): Ataque, Furtividade…" maxLength={40} aria-label="Descrição da rolagem" />
      {gm && (
        <label className="dice-hidden">
          <input type="checkbox" checked={dice.hidden} onChange={(e) => dice.setHidden(e.target.checked)} />
          <span>🔒 Rolagem oculta <small>só você vê</small></span>
        </label>
      )}
      {error && <p className="dice-error" role="alert">{error}</p>}
      <div className="dice-prefs">
        <button type="button" className="dice-skin" onClick={chooseSkin}>
          <span className="skin-amostra" data-skin={dice.effectiveSkin} style={{ ['--cor-jogador' as string]: gm ? '#3a2a1a' : dice.color }} aria-hidden="true" />
          <span><strong>{SKIN_NAMES[dice.effectiveSkin]}</strong><small>Meus dados · trocar o visual</small></span>
        </button>
        <div className="segmented three" role="radiogroup" aria-label="Quando mostrar o dado 3D">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={dice.mode === m.id} className={dice.mode === m.id ? 'active' : ''} title={m.title} onClick={() => dice.setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <h3>Crônica das rolagens</h3>
      {history.length === 0 ? (
        <p className="help">Nenhum dado rolado ainda.</p>
      ) : (
        <ol className="roll-list" data-testid="roll-list">
          {history.map((r) => <RollItem key={r.id} r={r} dice={dice} />)}
        </ol>
      )}
    </div>
  );
}

function Stepper({ label, value, dec, inc, names }: { label: string; value: string; dec: () => void; inc: () => void; names: [string, string] }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <div>
        <button onClick={dec} aria-label={names[0]}>−</button>
        <span className="stepper-value">{value}</span>
        <button onClick={inc} aria-label={names[1]}>+</button>
      </div>
    </div>
  );
}

function RollItem({ r, dice }: { r: Rolagem; dice: DiceTable }) {
  const rolling = dice.isRolling(r.id);
  const first = r.termos.find((t): t is DieTerm => t.tipo === 'dado');
  const cls = ['roll', r.oculta && 'hidden-roll', !rolling && r.destaque, rolling && 'rolling'].filter(Boolean).join(' ');
  return (
    <li className={cls} style={{ ['--cor-jogador' as string]: playerColor(r.autor, r.papel) }} data-testid="roll">
      <span className="roll-icon"><DiceIcon sides={first?.lados ?? 20} /></span>
      <div className="roll-head">
        <span className="roll-author">{r.papel === 'mestre' ? `👑 ${r.autor}` : r.autor}</span>
        {r.rotulo && <span className="roll-label">{r.rotulo}</span>}
        {r.oculta && <span className="roll-tag">Oculta</span>}
        {r.revelada && <span className="roll-tag outline">Revelada</span>}
        {!rolling && r.destaque && <span className={`roll-tag ${r.destaque}`}>{r.destaque === 'critico' ? 'Crítico!' : 'Falha crítica'}</span>}
        <span className="roll-time">{new Date(r.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="roll-total" data-testid="roll-total">{rolling ? '…' : r.total}</div>
      <div className="roll-detail">
        {r.termos.map((t, i) => (
          <span key={i}>
            {i > 0 || t.sinal < 0 ? (t.sinal < 0 ? ' − ' : ' + ') : ''}
            {t.tipo === 'mod' ? t.valor : (
              <>
                <code>{t.qtd}d{t.lados}{t.manter ?? ''}</code> [
                {t.valores.map((v, j) => (
                  <span key={j}>
                    {j > 0 && ', '}
                    <span className={!t.mantidos[j] ? 'dropped' : v === t.lados ? 'max' : v === 1 ? 'min' : ''}>{v}</span>
                  </span>
                ))}]
              </>
            )}
          </span>
        ))}
      </div>
      {r.oculta && dice.papel === 'mestre' && (
        <div className="roll-actions"><button onClick={() => dice.reveal(r.id)}>Revelar para a mesa</button></div>
      )}
    </li>
  );
}
