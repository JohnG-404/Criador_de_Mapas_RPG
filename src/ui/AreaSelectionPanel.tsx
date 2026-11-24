import { TERRAINS } from '../core/doc/terrain';
import { AREA_KINDS, type AreaKind, type AreaSelection, type Editor, type EditorState } from '../editor/Editor';
import { AREA_COLORS } from '../render/MapView';

const KIND_NAMES: Record<AreaKind, [string, string]> = {
  terrain: ['célula', 'células'],
  objects: ['objeto', 'objetos'],
  tokens: ['token', 'tokens'],
  notes: ['nota', 'notas'],
  links: ['passagem', 'passagens'],
};

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function count(area: AreaSelection, k: AreaKind) {
  return k === 'terrain' ? area.cells.length : area[k].length;
}

/** Painel da seleção em área: o que entrou (por tipo, com filtro) e o que dá para fazer com isso. */
export function AreaSelectionPanel({ editor, state }: { editor: Editor; state: EditorState }) {
  const area = state.area!;
  const filter = state.areaFilter;
  const kinds = AREA_KINDS.filter((k) => count(area, k) > 0);
  const active = kinds.filter((k) => filter[k]);
  const summary = active.map((k) => `${count(area, k).toLocaleString('pt-BR')} ${KIND_NAMES[k][count(area, k) === 1 ? 0 : 1]}`).join(', ');
  const terrain = TERRAINS.find((t) => t.id === state.terrain);
  const cols = new Set(area.cells.map((c) => c.col)).size;
  const rows = new Set(area.cells.map((c) => c.row)).size;
  return (
    <section data-testid="area-panel" className="area-panel">
      <h2>Seleção em área</h2>
      {area.cells.length > 0 && <p className="help">Caixa de {cols} × {rows} células</p>}
      <ul className="area-kinds" aria-label="O que está selecionado">
        {kinds.map((k) => (
          <li key={k} className={filter[k] ? '' : 'off'}>
            <label>
              <input type="checkbox" checked={filter[k]} onChange={(e) => editor.setAreaFilter(k, e.target.checked)} />
              <span className="area-swatch" style={{ background: hex(AREA_COLORS[k]) }} aria-hidden="true" />
              <span className="area-name">{k === 'terrain' ? 'Terreno' : KIND_NAMES[k][1][0].toUpperCase() + KIND_NAMES[k][1].slice(1)}</span>
              <span className="area-count">{count(area, k).toLocaleString('pt-BR')}</span>
            </label>
          </li>
        ))}
      </ul>
      {!!area.covered?.length && (
        <div className="area-covered" role="status">
          <p>
            {area.covered.length === 1 ? '1 item já estava' : `${area.covered.length} itens já estavam`} no lugar e
            {area.covered.length === 1 ? ' ficou' : ' ficaram'} por baixo (marcados com <strong>!</strong> no mapa).
          </p>
          <button onClick={() => editor.includeCovered()}>Incluir na seleção</button>
        </div>
      )}
      <p className="help">Desmarque um tipo para tirá-lo da seleção sem perder o resto.</p>
      <div className="area-actions">
        {filter.terrain && area.cells.length > 0 && (
          <button onClick={() => editor.fillArea()} title="Pinta as células selecionadas com o terreno escolhido na paleta">
            Preencher com {terrain?.name ?? 'terreno'}
          </button>
        )}
        {area.cells.length > 0 && (
          <div className="row-buttons">
            <button onClick={() => editor.fogArea(false)}>Revelar névoa</button>
            <button onClick={() => editor.fogArea(true)}>Cobrir com névoa</button>
          </div>
        )}
        <button className="danger" disabled={!active.length} onClick={() => editor.deleteArea()}>
          Apagar {summary || 'nada'} (Del)
        </button>
        <button onClick={() => editor.clearSelection()}>Limpar seleção (Esc)</button>
      </div>
      <p className="help">
        Arraste dentro da caixa para mover tudo junto. <kbd>Shift</kbd> + arrastar soma outra área. <kbd>Ctrl</kbd>+<kbd>A</kbd> pega o mapa todo.
      </p>
    </section>
  );
}
