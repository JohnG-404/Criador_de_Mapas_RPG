import { useEffect, useRef, useState } from 'react';
import type { NewMapOptions } from '../core/doc/MapDocument';
import { TERRAINS } from '../core/doc/terrain';
import type { GridKind } from '../core/grid/GridSystem';

const MAX_SIDE = 1000;

const DEFAULT_WARNING = 'O mapa atual será substituído. Use Salvar antes se quiser guardá-lo.';

export function NewMapDialog({ onCreate, onCancel, title = 'Novo mapa', warning = DEFAULT_WARNING, defaultName = 'Mapa sem título' }: {
  onCreate: (o: NewMapOptions) => void;
  onCancel: () => void;
  title?: string;
  /** Aviso no topo (null = nenhum, ex.: mapa novo dentro da campanha). */
  warning?: string | null;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [gridKind, setGridKind] = useState<GridKind>('square');
  const [cols, setCols] = useState(60);
  const [rows, setRows] = useState(40);
  const [fill, setFill] = useState(TERRAINS[0].id);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancelEvt = (e: Event) => { e.preventDefault(); onCancel(); };
    d.addEventListener('cancel', onCancelEvt);
    return () => d.removeEventListener('cancel', onCancelEvt);
  }, [onCancel]);

  const clamp = (v: number) => Math.min(MAX_SIDE, Math.max(1, Math.round(v || 1)));
  const valid = cols >= 1 && rows >= 1 && cols <= MAX_SIDE && rows <= MAX_SIDE;

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="new-map-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onCreate({ name: name.trim() || 'Mapa sem título', gridKind, cols: clamp(cols), rows: clamp(rows), fill, cellMeters: 1.5 });
        }}
      >
        <h2 id="new-map-title">{title}</h2>
        {warning && <p className="warn">{warning}</p>}
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <fieldset>
          <legend>Grid</legend>
          <label className="radio">
            <input type="radio" name="grid" checked={gridKind === 'square'} onChange={() => setGridKind('square')} /> Quadrado
          </label>
          <label className="radio">
            <input type="radio" name="grid" checked={gridKind === 'hex'} onChange={() => setGridKind('hex')} /> Hexagonal
          </label>
        </fieldset>
        <div className="row">
          <label>
            Largura (células)
            <input type="number" min={1} max={MAX_SIDE} value={cols} onChange={(e) => setCols(Number(e.target.value))} />
          </label>
          <label>
            Altura (células)
            <input type="number" min={1} max={MAX_SIDE} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
          </label>
        </div>
        <label>
          Terreno inicial
          <select value={fill} onChange={(e) => setFill(Number(e.target.value))}>
            <option value={0}>Vazio</option>
            {TERRAINS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="actions">
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="primary" disabled={!valid}>Criar mapa</button>
        </div>
      </form>
    </dialog>
  );
}
