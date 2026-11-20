import { useEffect, useState } from 'react';
import type { Editor } from '../editor/Editor';
import { bonus, isValidExpression } from '../core/dice/dice';
import { SYSTEMS, tokenTemplate, type Attack, type TokenSheet, type TokenSystem } from '../core/doc/tokenTemplates';
import {
  attrCheck, attrValue, dndMod, dndSkillBonus, initiativeExpr, profBonus, RULES, saveBonus, sheetDefaults, sheetSystem, skillCheck,
} from '../core/sheets/systems';
import type { DiceTable } from '../table/DiceTable';
import { TokenThumb } from './table/InitiativePanel';

/**
 * Ficha completa do token selecionado: atributos, perícias, ataques,
 * condições e notas. Cada teste rola direto no rolador da mesa.
 * Não é um <dialog> modal porque o dado 3D precisa aparecer por cima.
 */
export function SheetDialog({ editor, dice, onClose, notify }: { editor: Editor; dice: DiceTable; onClose: () => void; notify?: (text: string, error?: boolean) => void }) {
  const tok = editor.selectedToken();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.palco.ativo, .vitrine.aberta')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { if (!tok?.sheet) onClose(); }, [tok, onClose]);
  if (!tok?.sheet) return null;

  const s = tok.sheet;
  const tpl = tokenTemplate(tok.template);
  const sys = sheetSystem(s, tpl?.system);
  const rules = RULES[sys];
  const dnd = sys === 'dnd';
  const set = (patch: Partial<TokenSheet>) => editor.updateTokenSheet(patch);
  const roll = (expr: string, what: string) => {
    if (!expr) return;
    const r = dice.quick(expr, `${tok.name} · ${what}`.slice(0, 40));
    if (typeof r === 'string') notify?.(r, true);
  };
  const attrs = rules.attrs.map((_, i) => attrValue({ ...s, sys }, i));
  const sheet = { ...s, sys };
  const changeSystem = (next: TokenSystem) => {
    if (next === sys) return;
    const d = sheetDefaults(next);
    set({ ...d, hp: s.hp, hpMax: s.hpMax, skills: undefined, saves: undefined, ...(next === 'dnd' ? { san: undefined, sanMax: undefined, energy: undefined, energyMax: undefined } : {}) });
  };

  return (
    <div className="sheet-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet-dialog" role="dialog" aria-modal="false" aria-labelledby="sheet-title" data-testid="sheet-dialog">
        <header className="sheet-top">
          <TokenThumb t={tok} />
          <div className="sheet-title">
            <h2 id="sheet-title">{tok.name}</h2>
            <span>{tpl ? tpl.name : 'Token'}{s.cr ? ` · ND ${s.cr}` : ''}</span>
          </div>
          <label className="mini">
            Sistema
            <select value={sys} onChange={(e) => changeSystem(e.target.value as TokenSystem)}>
              {(Object.keys(SYSTEMS) as TokenSystem[]).map((k) => <option key={k} value={k}>{SYSTEMS[k].name}</option>)}
            </select>
          </label>
          <Num label="Nível" value={s.level ?? 1} onChange={(v) => set({ level: v })} min={0} />
          {dnd && <Num label="Prof." value={profBonus(s)} onChange={(v) => set({ prof: v })} min={0} />}
          <button className="sheet-close" onClick={onClose} aria-label="Fechar ficha">×</button>
        </header>

        <div className="sheet-body">
          <div className="sheet-col">
            <h3>Recursos</h3>
            <div className="res-grid">
              <Num label="PV" value={s.hp} onChange={(v) => set({ hp: v })} testId="full-hp" />
              <Num label="PV máx." value={s.hpMax} onChange={(v) => set({ hpMax: v })} min={1} />
              <Num label={SYSTEMS[sys].def} value={s.def} onChange={(v) => set({ def: v })} />
              <Num label="Desloc. (m)" value={s.move} onChange={(v) => set({ move: v })} />
              {!dnd && <Num label="Sanidade" value={s.san ?? 0} onChange={(v) => set({ san: v, sanMax: s.sanMax ?? v })} />}
              {!dnd && <Num label="San. máx." value={s.sanMax ?? 0} onChange={(v) => set({ sanMax: v, san: s.san ?? v })} />}
              {!dnd && <Num label="Energia" value={s.energy ?? 0} onChange={(v) => set({ energy: v, energyMax: s.energyMax ?? v })} />}
              {!dnd && <Num label="Ener. máx." value={s.energyMax ?? 0} onChange={(v) => set({ energyMax: v, energy: s.energy ?? v })} />}
              <div className="res-ini">
                <Num label="Bônus inic." value={s.initBonus ?? 0} onChange={(v) => set({ initBonus: v })} />
                <button className="roll-btn" onClick={() => roll(initiativeExpr(sheet), 'Iniciativa')} title={`Rolar iniciativa (${initiativeExpr(sheet)})`}>🎲 {initiativeExpr(sheet)}</button>
              </div>
            </div>

            <h3>Atributos</h3>
            <div className={`attr-grid n${rules.attrs.length}`}>
              {rules.attrs.map((a, i) => (
                <div key={a.key} className="attr" title={a.name}>
                  <span className="attr-short">{a.short}</span>
                  <input type="number" min={rules.attrMin} max={rules.attrMax} value={attrs[i]} aria-label={a.name}
                    onChange={(e) => { const next = [...attrs]; next[i] = Number(e.target.value) || 0; set({ attrs: next }); }} />
                  <button className="roll-btn" onClick={() => roll(attrCheck(sheet, i), a.name)} title={`Teste de ${a.name} (${attrCheck(sheet, i)})`}>
                    {dnd ? bonus(dndMod(attrs[i])) || '+0' : attrs[i] <= 0 ? '2d20↓' : `${attrs[i]}d20`}
                  </button>
                </div>
              ))}
            </div>
            {!dnd && <p className="help">Atributo = quantidade de d20, fica o maior. Atributo 0 rola 2d20 e fica o menor (↓).</p>}

            {dnd && (
              <>
                <h3>Salvaguardas</h3>
                <div className="save-grid">
                  {rules.attrs.map((a, i) => (
                    <div key={a.key} className="save">
                      <label title="Proficiente">
                        <input type="checkbox" checked={!!s.saves?.includes(i)}
                          onChange={(e) => set({ saves: e.target.checked ? [...(s.saves ?? []), i] : (s.saves ?? []).filter((x) => x !== i) })} />
                        {a.short}
                      </label>
                      <button className="roll-btn" onClick={() => roll(`1d20${bonus(saveBonus(sheet, i))}`, `Salvaguarda de ${a.name}`)}>{bonus(saveBonus(sheet, i)) || '+0'}</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h3>Condições</h3>
            <div className="cond-list">
              {rules.conditions.map((c) => {
                const on = !!s.conds?.includes(c);
                return (
                  <button key={c} className={`cond-chip${on ? ' on' : ''}`} aria-pressed={on}
                    onClick={() => set({ conds: on ? (s.conds ?? []).filter((x) => x !== c) : [...(s.conds ?? []), c] })}>{c}</button>
                );
              })}
            </div>
          </div>

          <div className="sheet-col">
            <h3>Perícias</h3>
            <ul className="skill-list">
              {rules.skills.map((k) => {
                const lvl = s.skills?.[k.key] ?? 0;
                const expr = skillCheck(sheet, k);
                return (
                  <li key={k.key} className={lvl ? 'trained' : ''}>
                    <span className="skill-name">{k.name} <small>{rules.attrs[k.attr].short}</small></span>
                    <select value={lvl} aria-label={`Treino em ${k.name}`}
                      onChange={(e) => {
                        const next = { ...(s.skills ?? {}) };
                        const n = Number(e.target.value);
                        if (n) next[k.key] = n; else delete next[k.key];
                        set({ skills: next });
                      }}>
                      {rules.skillLevels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                    <button className="roll-btn" onClick={() => roll(expr, k.name)} title={`Rolar ${expr}`}>
                      {dnd ? bonus(dndSkillBonus(sheet, k)) || '+0' : expr.replace('d20kl1', 'd20↓').replace('d20kh1', 'd20')}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="sheet-col">
            <h3>Ataques</h3>
            <Attacks attacks={s.attacks ?? []} onChange={(attacks) => set({ attacks })} roll={roll} />
            <h3><label htmlFor="sheet-notes">Notas</label></h3>
            <Notes value={s.notes ?? ''} onSave={(notes) => set({ notes })} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Num({ label, value, onChange, min, testId }: { label: string; value: number; onChange: (v: number) => void; min?: number; testId?: string }) {
  return (
    <label className="mini">
      {label}
      <input type="number" value={value} min={min} data-testid={testId} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

function Attacks({ attacks, onChange, roll }: { attacks: Attack[]; onChange: (a: Attack[]) => void; roll: (expr: string, what: string) => void }) {
  const [draft, setDraft] = useState(attacks);
  useEffect(() => setDraft(attacks), [attacks]);
  const edit = (i: number, patch: Partial<Attack>) => setDraft((d) => d.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const save = () => { if (JSON.stringify(draft) !== JSON.stringify(attacks)) onChange(draft); };
  return (
    <div className="attacks">
      {draft.map((a, i) => (
        <div key={i} className="attack">
          <input className="atk-name" value={a.name} placeholder="Nome" maxLength={40} aria-label="Nome do ataque" onChange={(e) => edit(i, { name: e.target.value })} onBlur={save} />
          <input className={`atk-roll${a.roll && !isValidExpression(a.roll) ? ' bad' : ''}`} value={a.roll} placeholder="Teste" maxLength={40} aria-label="Teste do ataque" onChange={(e) => edit(i, { roll: e.target.value })} onBlur={save} />
          <input className={`atk-dmg${a.dmg && !isValidExpression(a.dmg) ? ' bad' : ''}`} value={a.dmg} placeholder="Dano" maxLength={40} aria-label="Dano do ataque" onChange={(e) => edit(i, { dmg: e.target.value })} onBlur={save} />
          <div className="atk-buttons">
            <button className="roll-btn" disabled={!a.roll} onClick={() => roll(a.roll, a.name || 'Ataque')}>🎲 Teste</button>
            <button className="roll-btn" disabled={!a.dmg} onClick={() => roll(a.dmg, `Dano · ${a.name || 'ataque'}`)}>🎲 Dano</button>
            <button className="icon" onClick={() => onChange(attacks.filter((_, j) => j !== i))} aria-label={`Apagar ${a.name || 'ataque'}`}>×</button>
          </div>
        </div>
      ))}
      <button className="add-attack" onClick={() => onChange([...attacks, { name: 'Novo ataque', roll: '1d20', dmg: '1d6' }])}>+ Ataque</button>
    </div>
  );
}

function Notes({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <textarea id="sheet-notes" className="sheet-notes" value={text} maxLength={4000} placeholder="Equipamento, magias, rituais, ganchos…"
      onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== value) onSave(text); }} />
  );
}
