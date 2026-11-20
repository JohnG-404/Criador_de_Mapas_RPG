import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TERRAINS } from '../core/doc/terrain';
import { parseCampaign } from '../core/doc/serialize';
import { ELEV_ZERO } from '../core/doc/elevation';
import type { Cell } from '../core/grid/GridSystem';
import { initialDesktopMap, isDesktop, openDesktopPlayerWindow } from '../desktop';
import { Editor } from '../editor/Editor';
import { loadAutosave, readMapFile, saveMapFile, startAutosave } from '../editor/persistence';
import { PLAYER_QUERY, startPlayerBroadcast } from '../editor/playerSync';
import { MapView } from '../render/MapView';
import type { GeneratorKind } from '../core/procgen';
import { ExportDialog } from './ExportDialog';
import { OnlineDialog } from './OnlineDialog';
import { CloudDialog } from './CloudDialog';
import { cloudRefFromUrl, loadFromCloud, setCurrentCloudMap } from '../online/cloud';
import { newRoomCode } from '../online/protocol';
import type { HostedRoom } from '../online/room';
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
    if (saved) ed.loadCampaign(saved);
    return ed;
  });
  const state = useSyncExternalStore(editor.subscribe, editor.getState);
  const [hover, setHover] = useState<Cell | null>(null);
  const [zoom, setZoom] = useState(1);
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [show3d, setShow3d] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const closeCloud = useCallback(() => setCloudOpen(false), []);
  const [room, setRoom] = useState<{ code: string; peers: number; status: 'connecting' | 'online' | 'error' } | null>(null);
  const roomRef = useRef<HostedRoom | null>(null);
  const closeOnline = useCallback(() => setOnlineOpen(false), []);
  const openRoom = useCallback(async () => {
    const code = newRoomCode();
    setRoom({ code, peers: 0, status: 'connecting' });
    try {
      const { hostRoom } = await import('../online/room');
      roomRef.current = await hostRoom(editor, code, {
        onPeers: (peers) => setRoom((r) => (r && r.code === code ? { ...r, peers } : r)),
        onStatus: (status) => setRoom((r) => (r && r.code === code ? { ...r, status } : r)),
      });
    } catch {
      setRoom((r) => (r ? { ...r, status: 'error' } : r));
    }
  }, [editor]);
  const stopRoom = useCallback(() => {
    roomRef.current?.stop();
    roomRef.current = null;
    setRoom(null);
  }, []);
  useEffect(() => () => roomRef.current?.stop(), []);
  const close3d = useCallback(() => setShow3d(false), []);
  const [lastGen, setLastGen] = useState<{ kind: GeneratorKind; seed: string } | null>(null);
  const dialogOpen = newMapOpen || genOpen || exportOpen || onlineOpen || cloudOpen;
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
      if (await saveMapFile(editor.campaign())) notify(editor.maps.length > 1 ? `Campanha salva (${editor.maps.length} mapas)` : 'Mapa salvo');
    } catch {
      notify('Não foi possível salvar o arquivo.', true);
    }
  }, [editor, notify]);

  const open = useCallback(() => fileRef.current?.click(), []);

  // Link de mapa na nuvem (?mapa=id#chave): abre o mapa e limpa o endereço.
  useEffect(() => {
    const ref = cloudRefFromUrl();
    if (!ref) return;
    history.replaceState(null, '', location.pathname);
    loadFromCloud(ref.id, ref.token)
      .then((c) => { editor.loadCampaign(c); notify(`Aberto da nuvem: ${editor.doc.options.name}`); })
      .catch((e: Error) => notify(e.message || 'Não foi possível abrir o mapa da nuvem.', true));
  }, [editor, notify]);


  // App de desktop: mapa aberto com duplo clique num arquivo .rpgmap.
  useEffect(() => {
    initialDesktopMap()
      .then((file) => {
        if (!file) return;
        editor.loadCampaign(parseCampaign(file.text));
        setCurrentCloudMap(null);
        notify(`Aberto: ${file.name}`);
      })
      .catch((e: Error) => notify(e.message || 'Não foi possível abrir o arquivo.', true));
  }, [editor, notify]);

  const openPlayerWindow = () => {
    if (isDesktop()) {
      openDesktopPlayerWindow(`${location.origin}${location.pathname}?${PLAYER_QUERY}`)
        .catch(() => notify('Não foi possível abrir a janela dos jogadores.', true));
      return;
    }
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
  const hoverLevel = hover ? doc.elevation.getCell(hover) - ELEV_ZERO : 0;
  const hoverTerrain = hover ? TERRAINS.find((t) => t.id === doc.terrain.getCell(hover))?.name ?? 'Vazio' : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={22} height={22} />
          <span>Atlas Board</span>
          <span className="tag">fase 8</span>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Arquivo e histórico">
          <button onClick={() => setNewMapOpen(true)}>Novo mapa</button>
          <button onClick={() => setGenOpen(true)} title="Gerar masmorra, caverna ou região a partir de uma semente">Gerar</button>
          <button onClick={open} title="Abrir arquivo .rpgmap (Ctrl+O)">Abrir</button>
          <button onClick={() => void save()} title="Salvar arquivo .rpgmap (Ctrl+S)">Salvar</button>
          <button onClick={() => setCloudOpen(true)} title="Salvar e abrir mapas na nuvem, para continuar em outro computador">Nuvem</button>
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
                editor.loadCampaign(await readMapFile(file));
                setCurrentCloudMap(null);
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
              if (editor.doc !== editor.playerDoc) {
                notify(`Os jogadores estão em ${editor.playerDoc.options.name}. Use "Levar os jogadores para este mapa" primeiro.`, true);
              } else if (rect && broadcastRef.current) {
                broadcastRef.current.showView(rect);
                roomRef.current?.showView(rect);
                notify('Os jogadores agora veem esta área');
              }
            }}
            title="A janela dos jogadores passa a mostrar exatamente a área que você está vendo"
          >
            Mostrar esta área
          </button>
          <button
            onClick={() => setOnlineOpen(true)}
            className={room ? 'active' : ''}
            title="Sala online: os jogadores abrem um link e veem o mapa ao vivo"
          >
            {room ? `Sala online · ${room.peers}` : 'Sala online'}
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
          {hover ? `Célula ${hover.col + 1}, ${hover.row + 1} · ${hoverTerrain}${hoverLevel ? ` · altura ${hoverLevel > 0 ? '+' : ''}${hoverLevel}` : ''}` : 'Passe o mouse sobre o mapa'}
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
      {cloudOpen && (
        <CloudDialog
          campaign={() => editor.campaign()}
          notify={notify}
          onClose={closeCloud}
          onOpened={(c, name) => { editor.loadCampaign(c); setCloudOpen(false); notify(`Aberto da nuvem: ${name}`); }}
        />
      )}
      {onlineOpen && (
        <OnlineDialog
          code={room?.code ?? null}
          peers={room?.peers ?? 0}
          status={room?.status ?? null}
          onOpen={() => void openRoom()}
          onStop={stopRoom}
          onClose={closeOnline}
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
          warning={editor.maps.length > 1
            ? `A campanha atual (${editor.maps.length} mapas) será substituída. Use Salvar antes se quiser guardá-la, ou crie o mapa em Mapas da campanha.`
            : undefined}
          onCancel={() => setNewMapOpen(false)}
          onCreate={(o) => {
            editor.newMap(o);
            setCurrentCloudMap(null);
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
