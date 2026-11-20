import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TERRAINS } from '../core/doc/terrain';
import type { Cell } from '../core/grid/GridSystem';
import { Editor } from '../editor/Editor';
import { loadAutosave, readMapFile, saveMapFile, startAutosave } from '../editor/persistence';
import { PLAYER_QUERY, startPlayerBroadcast } from '../editor/playerSync';
import { MapView } from '../render/MapView';
import type { GeneratorKind } from '../core/procgen';
import { ExportDialog } from './ExportDialog';
import { GenerateDialog } from './GenerateDialog';
import { NewMapDialog } from './NewMapDialog';
import { ToolPanel } from './ToolPanel';
import { useShortcuts } from './useShortcuts';

const View3DPanel = lazy(() => import('./View3DPanel').then((m) => ({ default: m.View3DPanel })));

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const [editor] = useState(() => {
    const ed = new Editor();
    const saved = loadAutosave();
    if (saved) ed.loadDocument(saved);
    return ed;
  });
  const state = useSyncExternalStore(editor.subscribe, editor.getState);
  const [hover, setHover] = useState<Cell | null>(null);
  const [zoom, setZoom] = useState(1);
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [show3d, setShow3d] = useState(false);
  const close3d = useCallback(() => setShow3d(false), []);
  const [lastGen, setLastGen] = useState<{ kind: GeneratorKind; seed: string } | null>(null);
  const dialogOpen = newMapOpen || genOpen || exportOpen;
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const broadcastRef = useRef<ReturnType<typeof startPlayerBroadcast> | null>(null);

  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.error ? 6000 : 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    let warned = false;
    const stopAutosave = startAutosave(editor, (ok) => {
      if (!ok && !warned) {
        warned = true;
        notify('Não foi possível salvar automaticamente no navegador. Use Salvar para guardar o arquivo.', true);
      }
    });
    const broadcast = startPlayerBroadcast(editor);
    broadcastRef.current = broadcast;
    return () => { stopAutosave(); broadcast.stop(); broadcastRef.current = null; };
  }, [editor, notify]);

  const save = useCallback(async () => {
    try {
      if (await saveMapFile(editor.doc)) notify('Mapa salvo');
    } catch {
      notify('Não foi possível salvar o arquivo.', true);
    }
  }, [editor, notify]);

  const open = useCallback(() => fileRef.current?.click(), []);


  const openPlayerWindow = () => {
    window.open(`${location.pathname}?${PLAYER_QUERY}`, 'atlas-board-jogadores', 'popup,width=1280,height=800');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || dialogOpen) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); void save(); }
      else if (k === 'o') { e.preventDefault(); open(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, open, dialogOpen]);

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

  useShortcuts(editor, !dialogOpen);

  const doc = editor.doc;
  const opts = doc.options;
  const hoverTerrain = hover ? TERRAINS.find((t) => t.id === doc.terrain.getCell(hover))?.name ?? 'Vazio' : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={22} height={22} />
          <span>Atlas Board</span>
          <span className="tag">fase 7</span>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Arquivo e histórico">
          <button onClick={() => setNewMapOpen(true)}>Novo mapa</button>
          <button onClick={() => setGenOpen(true)} title="Gerar masmorra, caverna ou região a partir de uma semente">Gerar</button>
          <button onClick={open} title="Abrir arquivo .rpgmap (Ctrl+O)">Abrir</button>
          <button onClick={() => void save()} title="Salvar arquivo .rpgmap (Ctrl+S)">Salvar</button>
          <button onClick={() => setExportOpen(true)} title="Imagem PNG, arquivo para mesa virtual ou PDF para imprimir">Exportar</button>
          <input
            ref={fileRef}
            type="file"
            accept=".rpgmap,application/json"
            hidden
            data-testid="open-file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                editor.loadDocument(await readMapFile(file));
                notify(`Aberto: ${file.name}`);
              } catch (err) {
                notify((err as Error).message || 'Não foi possível abrir o arquivo.', true);
              }
            }}
          />
          <span className="sep" />
          <button onClick={() => editor.undo()} disabled={!state.canUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
          <button onClick={() => editor.redo()} disabled={!state.canRedo} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">↷</button>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Visualização">
          <button onClick={() => viewRef.current?.zoomOut()} title="Diminuir zoom (−)" aria-label="Diminuir zoom">−</button>
          <span className="zoom" data-testid="zoom-label">{Math.round(zoom * 100)}%</span>
          <button onClick={() => viewRef.current?.zoomIn()} title="Aumentar zoom (+)" aria-label="Aumentar zoom">+</button>
          <button onClick={() => viewRef.current?.fitToMap()} title="Enquadrar mapa (0)">Enquadrar</button>
          <span className="sep" />
          <button onClick={openPlayerWindow} title="Abre uma janela só com o mapa e a névoa opaca, para mostrar aos jogadores">
            Janela dos jogadores
          </button>
          <button
            onClick={() => {
              const rect = viewRef.current?.visibleRect();
              if (rect && broadcastRef.current) {
                broadcastRef.current.showView(rect);
                notify('Os jogadores agora veem esta área');
              }
            }}
            title="A janela dos jogadores passa a mostrar exatamente a área que você está vendo"
          >
            Mostrar esta área
          </button>
          <button
            onClick={() => setShow3d((v) => !v)}
            aria-pressed={show3d}
            className={show3d ? 'active' : ''}
            title="Ver o mapa em 3D (paredes com altura, objetos em volume e miniaturas)"
          >
            Ver em 3D
          </button>
          <label className="toggle">
            <input type="checkbox" checked={state.showGrid} onChange={(e) => editor.setShowGrid(e.target.checked)} />
            Grid
          </label>
        </div>
      </header>
      <div className="workspace">
        <ToolPanel editor={editor} state={state} />
        <div className="stage-area">
          <main className="stage" ref={hostRef} />
          {show3d && viewRef.current && (
            <Suspense fallback={null}>
              <View3DPanel editor={editor} view={viewRef.current} showGrid={state.showGrid} docVersion={state.docVersion} onClose={close3d} />
            </Suspense>
          )}
        </div>
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
      {notice && (
        <div className={`notice${notice.error ? ' error' : ''}`} role={notice.error ? 'alert' : 'status'} data-testid="notice">
          {notice.text}
        </div>
      )}
      {exportOpen && viewRef.current && (
        <ExportDialog
          view={viewRef.current}
          doc={doc}
          showGrid={state.showGrid}
          onCancel={() => setExportOpen(false)}
          onDone={(msg, error) => { setExportOpen(false); notify(msg, error); }}
        />
      )}
      {genOpen && (
        <GenerateDialog
          hex={doc.grid.kind === 'hex'}
          initial={lastGen}
          onCancel={() => setGenOpen(false)}
          onGenerate={(kind, seedText, seed) => {
            editor.generate(kind, seed);
            setLastGen({ kind, seed: seedText });
            setGenOpen(false);
            notify(`Mapa gerado (semente ${seedText})`);
          }}
        />
      )}
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
