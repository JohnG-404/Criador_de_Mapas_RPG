import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../../editor/Editor';
import type { Token } from '../../core/doc/objects';
import type { DiceTable } from '../../table/DiceTable';
import { DicePanel } from './DicePanel';
import { InitiativePanel } from './InitiativePanel';

export type DockTab = 'dados' | 'iniciativa';

/** Painel lateral da mesa: dados e iniciativa (mestre e jogadores). */
export function TableDock({ editor, docVersion, dice, gm, tab, onTab, onClose, onFocus }: {
  editor: Editor;
  docVersion: number;
  dice: DiceTable;
  gm: boolean;
  tab: DockTab;
  onTab: (t: DockTab) => void;
  onClose: () => void;
  onFocus?: (t: Token) => void;
}) {
  return (
    <aside className="table-dock" aria-label="Mesa" data-testid="table-dock">
      <div className="dock-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'dados'} className={tab === 'dados' ? 'active' : ''} onClick={() => onTab('dados')}>Dados</button>
        <button role="tab" aria-selected={tab === 'iniciativa'} className={tab === 'iniciativa' ? 'active' : ''} onClick={() => onTab('iniciativa')}>Iniciativa</button>
        <button className="dock-close" onClick={onClose} aria-label="Fechar painel da mesa" title="Fechar">×</button>
      </div>
      <div className="dock-body" role="tabpanel">
        {tab === 'dados'
          ? <DicePanel dice={dice} />
          : <InitiativePanel editor={editor} docVersion={docVersion} dice={dice} gm={gm} onFocus={onFocus} />}
      </div>
    </aside>
  );
}

/** Clarão de crítico/falha quando a rolagem não passa pelo dado 3D. */
export function DiceFlash({ dice }: { dice: DiceTable }) {
  const [kind, setKind] = useState<'critico' | 'falha' | null>(null);
  const n = useRef(0);
  useEffect(() => {
    dice.onFlash = (k) => { n.current++; setKind(null); requestAnimationFrame(() => setKind(k)); };
    return () => { dice.onFlash = null; };
  }, [dice]);
  if (!kind || dice.mode === 'desligado') return null;
  return <div key={n.current} className={`flash ${kind}`} aria-hidden="true" onAnimationEnd={() => setKind(null)} />;
}
