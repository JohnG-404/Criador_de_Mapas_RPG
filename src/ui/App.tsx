import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TERRAINS } from '../core/doc/terrain';
import type { Cell } from '../core/grid/GridSystem';
import { Editor } from '../editor/Editor';
import { MapView } from '../render/MapView';
import { NewMapDialog } from './NewMapDialog';
import { ToolPanel } from './ToolPanel';
import { useShortcuts } from './useShortcuts';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const [editor] = useState(() => new Editor());
  const state = useSyncExternalStore(editor.subscribe, editor.getState);
  const [hover, setHover] = useState<Cell | null>(null);
  const [zoom, setZoom] = useState(1);
  const [newMapOpen, setNewMapOpen] = useState(false);

  useEffect(() => {
    const view = new MapView(editor, { onHoverCell: setHover, onZoomChange: setZoom });
    viewRef.current = view;
    // Acesso pelo console do navegador (e pelos testes de ponta a ponta).
    (window as unknown as { atlas?: unknown }).atlas = { editor, view };
    void view.mount(hostRef.current!);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [editor]);

  useShortcuts(editor, !newMapOpen);

  const doc = editor.doc;
  const opts = doc.options;
  const hoverTerrain = hover ? TERRAINS.find((t) => t.id === doc.terrain.getCell(hover))?.name ?? 'Vazio' : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={22} height={22} />
          <span>Atlas Board</span>
          <span className="tag">fase 2</span>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Arquivo e histórico">
          <button onClick={() => setNewMapOpen(true)}>Novo mapa</button>
          <span className="sep" />
          <button onClick={() => editor.undo()} disabled={!state.canUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
          <button onClick={() => editor.redo()} disabled={!state.canRedo} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">↷</button>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Visualização">
          <button onClick={() => viewRef.current?.zoomOut()} title="Diminuir zoom (−)" aria-label="Diminuir zoom">−</button>
          <span className="zoom" data-testid="zoom-label">{Math.round(zoom * 100)}%</span>
          <button onClick={() => viewRef.current?.zoomIn()} title="Aumentar zoom (+)" aria-label="Aumentar zoom">+</button>
          <button onClick={() => viewRef.current?.fitToMap()} title="Enquadrar mapa (0)">Enquadrar</button>
          <label className="toggle">
            <input type="checkbox" checked={state.showGrid} onChange={(e) => editor.setShowGrid(e.target.checked)} />
            Grid
          </label>
        </div>
      </header>
      <div className="workspace">
        <ToolPanel editor={editor} state={state} />
        <main className="stage" ref={hostRef} />
      </div>
      <footer className="statusbar">
        <span data-testid="map-info">
          {opts.name} · {opts.cols}×{opts.rows} · grid {opts.gridKind === 'hex' ? 'hexagonal' : 'quadrado'} · 1 célula ={' '}
          {opts.cellMeters.toLocaleString('pt-BR')} m
        </span>
        <span data-testid="content-counts">
          {plural(doc.walls.size, 'parede', 'paredes')} · {plural(doc.objects.size, 'objeto', 'objetos')} · {plural(doc.tokens.size, 'token', 'tokens')}
        </span>
        <span data-testid="hover-cell">
          {hover ? `Célula ${hover.col + 1}, ${hover.row + 1} · ${hoverTerrain}` : 'Passe o mouse sobre o mapa'}
        </span>
        <span className="hint">Botão direito ou Espaço + arrastar move o mapa · roda do mouse dá zoom</span>
      </footer>
      {newMapOpen && (
        <NewMapDialog
          onCancel={() => setNewMapOpen(false)}
          onCreate={(o) => {
            editor.newMap(o);
            setNewMapOpen(false);
          }}
        />
      )}
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
