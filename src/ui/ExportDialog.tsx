import { useEffect, useRef, useState } from 'react';
import type { MapDocument } from '../core/doc/MapDocument';
import type { MapView } from '../render/MapView';
import { exportPdfFile, exportPngFile, exportUvttFile, printPageCount } from './exporters';

type Kind = 'png' | 'uvtt' | 'pdf';

interface Props {
  view: MapView;
  doc: MapDocument;
  showGrid: boolean;
  onDone: (message: string, error?: boolean) => void;
  onCancel: () => void;
}

const CELL_SIZES = [
  { mm: 25.4, label: '1 polegada (miniaturas)' },
  { mm: 20, label: '2 cm' },
  { mm: 15, label: '1,5 cm' },
];

export function ExportDialog({ view, doc, showGrid, onDone, onCancel }: Props) {
  const [kind, setKind] = useState<Kind>('png');
  const [grid, setGrid] = useState(showGrid);
  const [cellMm, setCellMm] = useState(25.4);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const hex = doc.grid.kind === 'hex';

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancelEvt = (e: Event) => { e.preventDefault(); if (!busy) onCancel(); };
    d.addEventListener('cancel', onCancelEvt);
    return () => d.removeEventListener('cancel', onCancelEvt);
  }, [onCancel, busy]);

  const run = async () => {
    setBusy('Gerando…');
    try {
      let ok = false;
      if (kind === 'png') ok = await exportPngFile(view, doc, grid);
      else if (kind === 'uvtt') ok = await exportUvttFile(view, doc);
      else ok = await exportPdfFile(view, doc, { grid, cellMm, onProgress: (d, t) => setBusy(`Gerando folha ${d} de ${t}…`) });
      if (ok) onDone(kind === 'png' ? 'Imagem exportada' : kind === 'uvtt' ? 'Arquivo para mesa virtual exportado' : 'PDF para impressão exportado');
      else onCancel();
    } catch {
      onDone('Não foi possível exportar.', true);
    }
  };

  const options: { kind: Kind; name: string; description: string }[] = [
    { kind: 'png', name: 'Imagem PNG', description: 'O mapa inteiro em alta resolução, sem névoa nem notas.' },
    {
      kind: 'uvtt',
      name: 'Mesa virtual (.dd2vtt)',
      description: hex
        ? 'Formato Universal VTT. Mesas virtuais esperam grid quadrado: a imagem vai certa, mas o grid delas não vai casar com os hexágonos.'
        : 'Formato Universal VTT com paredes, portas e luzes. Abre no Foundry, Roll20, Owlbear Rodeo, Fantasy Grounds e outros.',
    },
    { kind: 'pdf', name: 'PDF para imprimir', description: 'Em escala real, dividido em folhas A4, para jogar com miniaturas sobre o papel.' },
  ];

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="export-title">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (!busy) void run(); }}>
        <h2 id="export-title">Exportar mapa</h2>
        <div className="gen-kinds" role="radiogroup" aria-label="Formato">
          {options.map((o) => (
            <label key={o.kind} className={`gen-kind${kind === o.kind ? ' active' : ''}`}>
              <input type="radio" name="export-kind" checked={kind === o.kind} onChange={() => setKind(o.kind)} />
              <strong>{o.name}</strong>
              <span>{o.description}</span>
            </label>
          ))}
        </div>
        {kind !== 'uvtt' && (
          <label className="radio">
            <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Incluir o grid
          </label>
        )}
        {kind === 'pdf' && (
          <label>
            Tamanho de cada célula no papel
            <select value={cellMm} onChange={(e) => setCellMm(Number(e.target.value))}>
              {CELL_SIZES.map((c) => <option key={c.mm} value={c.mm}>{c.label}</option>)}
            </select>
            <small>{printPageCount(doc, cellMm)} folhas A4. Imprima em "tamanho real" (100%), sem ajustar à página.</small>
          </label>
        )}
        <div className="actions">
          {busy && <span className="busy" role="status">{busy}</span>}
          <button type="button" onClick={onCancel} disabled={!!busy}>Cancelar</button>
          <button type="submit" className="primary" disabled={!!busy}>Exportar</button>
        </div>
      </form>
    </dialog>
  );
}
