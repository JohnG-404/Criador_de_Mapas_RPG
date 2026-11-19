import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cell } from '../core/grid/GridSystem';
import { SquareGrid } from '../core/grid/SquareGrid';
import { MapView } from '../render/MapView';

const MAP_COLS = 200;
const MAP_ROWS = 200;
const CELL_PX = 32;
const CELL_METERS = 1.5;

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const grid = useMemo(() => new SquareGrid(MAP_COLS, MAP_ROWS, CELL_PX), []);
  const [hover, setHover] = useState<Cell | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    const view = new MapView(grid, { showGrid: true }, { onHoverCell: setHover, onZoomChange: setZoom });
    viewRef.current = view;
    void view.mount(hostRef.current!);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [grid]);

  useEffect(() => {
    viewRef.current?.setOptions({ showGrid });
  }, [showGrid]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={22} height={22} />
          <span>Atlas Board</span>
          <span className="tag">fase 0</span>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Visualização">
          <button onClick={() => viewRef.current?.zoomOut()} title="Diminuir zoom (−)" aria-label="Diminuir zoom">−</button>
          <span className="zoom" data-testid="zoom-label">{Math.round(zoom * 100)}%</span>
          <button onClick={() => viewRef.current?.zoomIn()} title="Aumentar zoom (+)" aria-label="Aumentar zoom">+</button>
          <button onClick={() => viewRef.current?.fitToMap()} title="Enquadrar mapa (0)">Enquadrar</button>
          <label className="toggle">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            Grid
          </label>
        </div>
      </header>
      <main className="stage" ref={hostRef} />
      <footer className="statusbar">
        <span>Mapa {MAP_COLS}×{MAP_ROWS} · grid quadrado · 1 célula = {CELL_METERS.toLocaleString('pt-BR')} m</span>
        <span data-testid="hover-cell">
          {hover ? `Célula ${hover.col + 1}, ${hover.row + 1}` : 'Passe o mouse sobre o mapa'}
        </span>
        <span className="hint">Arraste para mover · roda do mouse para zoom · 0 enquadra</span>
      </footer>
    </div>
  );
}
