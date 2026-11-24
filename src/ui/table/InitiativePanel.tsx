import { useEffect, useReducer, useState } from 'react';
import type { Editor } from '../../editor/Editor';
import type { Token } from '../../core/doc/objects';
import { initiativeExpr } from '../../core/sheets/systems';
import { tokenArtUrl } from '../../render/tokenArt';
import type { DiceTable } from '../../table/DiceTable';

/** Redesenha quando a iniciativa ou os tokens do mapa atual mudam. */
function useInitiative(editor: Editor, docVersion: number) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const d = editor.doc;
    const a = d.initiative.onChange(force);
    const b = d.tokens.onChange(force);
    force();
    return () => { a(); b(); };
  }, [editor, docVersion]);
  return editor.doc.initiative.get();
}

export function TokenThumb({ t }: { t: Token }) {
  const art = tokenArtUrl(t);
  return art
    ? <img className="token-thumb" src={art} alt="" style={{ borderColor: t.color }} />
    : <span className="token-thumb" style={{ background: t.color }}>{t.name.slice(0, 1).toUpperCase()}</span>;
}

/**
 * Ordem de iniciativa. Mestre: rola, edita, passa a vez. Jogadores (gm = false):
 * só veem a ordem, sem os inimigos escondidos pela névoa.
 */
export function InitiativePanel({ editor, docVersion, dice, gm, onFocus }: {
  editor: Editor;
  docVersion: number;
  dice: DiceTable;
  gm: boolean;
  onFocus?: (t: Token) => void;
}) {
  const ini = useInitiative(editor, docVersion);
  const doc = editor.doc;
  const selected = gm ? editor.selectedToken() : null;
  const inList = new Set(ini.entries.map((e) => e.id));
  const rows = ini.entries.map((e, i) => ({ e, i, t: doc.tokens.get(e.id) })).filter((r): r is typeof r & { t: Token } => !!r.t);
  const current = rows.find((r) => r.i === ini.turn)?.t;

  // Rolagens da iniciativa vão para a crônica (sem 3D); inimigos seguem a escolha de oculta.
  const roller = (expr: string, t: Token) => {
    const r = dice.roll(expr, { rotulo: `Iniciativa · ${t.name}`, oculta: !t.pc && dice.hidden, anim: false });
    return typeof r === 'string' ? 0 : r.total;
  };
  const go = (dir: 1 | -1) => {
    if (dir > 0) editor.nextTurn(); else editor.prevTurn();
    const s = editor.doc.initiative.get();
    const t = editor.doc.tokens.get(s.entries[s.turn]?.id ?? '');
    if (t) onFocus?.(t);
  };
  const candidates = doc.tokens.all().filter((t) => !inList.has(t.id) && (t.sheet || t.pc)).length;

  return (
    <div className="initiative" data-testid="initiative">
      {rows.length > 0 && (
        <div className="ini-head">
          <strong data-testid="ini-round">Rodada {ini.round}</strong>
          {current && <span>Vez de <b>{current.name}</b></span>}
        </div>
      )}
      {gm && rows.length > 0 && (
        <div className="row-buttons ini-turns">
          <button onClick={() => go(-1)} title="Voltar a vez">◀ Anterior</button>
          <button className="primary" onClick={() => go(1)} title="Passar a vez">Próxima ▶</button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="help">
          {gm
            ? 'Ponha tokens com ficha no mapa e clique em Rolar iniciativa. Cada um rola com o próprio bônus (Destreza no D&D, Agilidade no horror).'
            : 'O mestre ainda não começou um combate.'}
        </p>
      ) : (
        <ol className="ini-list">
          {rows.map(({ e, i, t }) => (
            <IniRow key={e.id} t={t} value={e.value} active={i === ini.turn} gm={gm} editor={editor}
              onFocus={() => { if (gm) editor.selectToken(t.id); onFocus?.(t); }}
              onReroll={() => editor.rollInitiative([t.id], roller)} />
          ))}
        </ol>
      )}
      {gm && (
        <div className="ini-actions">
          <button className="primary" disabled={!candidates} onClick={() => editor.rollInitiative(undefined, roller)}
            title="Rola para os tokens com ficha (e personagens) que ainda não estão na lista">
            🎲 Rolar iniciativa{candidates ? ` (${candidates})` : ''}
          </button>
          {selected && !inList.has(selected.id) && (
            <button onClick={() => editor.rollInitiative([selected.id], roller)}>Pôr {selected.name} na ordem ({initiativeExpr(selected.sheet)})</button>
          )}
          {rows.length > 0 && <button className="danger-text" onClick={() => editor.clearInitiative()}>Encerrar combate</button>}
        </div>
      )}
    </div>
  );
}

function IniRow({ t, value, active, gm, editor, onFocus, onReroll }: {
  t: Token; value: number; active: boolean; gm: boolean; editor: Editor; onFocus: () => void; onReroll: () => void;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const showHp = t.sheet && (gm || t.pc);
  const down = t.sheet && t.sheet.hp <= 0;
  return (
    <li className={`ini-row${active ? ' active' : ''}${down ? ' down' : ''}`} data-testid="ini-row" aria-current={active ? 'true' : undefined}>
      <TokenThumb t={t} />
      <div className="ini-info">
        <button className="ini-name" onClick={onFocus} title="Mostrar no mapa">{t.name}</button>
        <span className="ini-meta">
          {showHp && <span>PV {t.sheet!.hp}/{t.sheet!.hpMax}</span>}
          {t.sheet?.conds?.map((c) => <span key={c} className="cond-chip">{c}</span>)}
        </span>
      </div>
      {gm ? (
        <>
          <input className="ini-value" type="number" value={v} aria-label={`Iniciativa de ${t.name}`}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => { const n = Number(v); if (v !== '' && Number.isFinite(n) && n !== value) editor.setInitiativeValue(t.id, n); else setV(String(value)); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          <button className="icon" onClick={onReroll} title="Rolar de novo" aria-label={`Rolar de novo para ${t.name}`}>🎲</button>
          <button className="icon" onClick={() => editor.removeFromInitiative(t.id)} title="Tirar da ordem" aria-label={`Tirar ${t.name} da ordem`}>×</button>
        </>
      ) : (
        <span className="ini-value">{value}</span>
      )}
    </li>
  );
}
