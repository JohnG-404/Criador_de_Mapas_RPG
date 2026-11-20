import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseMap } from '../core/doc/serialize';
import { Editor } from '../editor/Editor';
import { listenToGm, ROOM_QUERY } from '../editor/playerSync';
import { joinRoom } from '../online/room';
import { validRoomCode } from '../online/protocol';
import { MapView } from '../render/MapView';
import { DiceTable } from '../table/DiceTable';
import { DiceFlash, TableDock, type DockTab } from './table/TableDock';

/**
 * Janela dos jogadores: mostra o mapa que o mestre está editando, com a névoa
 * opaca e sem ferramentas. Pensada para um segundo monitor ou TV.
 */
export function PlayerApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [editor] = useState(() => new Editor());
  const [connected, setConnected] = useState(false);
  const [room] = useState(() => new URLSearchParams(location.search).get(ROOM_QUERY));
  const [status, setStatus] = useState<'connecting' | 'online' | 'error'>('connecting');
  const [dice] = useState(() => new DiceTable('jogador'));
  const state = useSyncExternalStore(editor.subscribe, editor.getState);
  const viewRef = useRef<MapView | null>(null);
  // Sala online: o painel começa aberto (cada jogador rola do próprio aparelho).
  // Janela no mesmo navegador (TV, 2º monitor): começa fechado e mostra as rolagens do mestre em 3D.
  const [dock, setDock] = useState<DockTab | null>(room !== null ? 'dados' : null);

  useEffect(() => {
    document.title = 'Atlas Board · Jogadores';
    const view = new MapView(editor, {}, 'player');
    viewRef.current = view;
    void view.mount(hostRef.current!);
    (window as unknown as { atlas?: unknown }).atlas = { editor, view };
    const onMap = (map: Parameters<typeof parseMap>[0]) => {
      try {
        editor.loadDocument(parseMap(map));
        setConnected(true);
      } catch {
        // Mensagem inválida: mantém o mapa atual.
      }
    };
    // Sala online (link do mestre) ou janela no mesmo navegador.
    const stop = room !== null
      ? (validRoomCode(room) ? joinRoom(room, onMap, (rect) => view.showRect(rect), setStatus, dice) : (setStatus('error'), () => {}))
      : listenToGm(onMap, (rect) => view.showRect(rect), dice);
    return () => {
      stop();
      view.destroy();
      viewRef.current = null;
    };
  }, [editor, room, dice]);

  return (
    <div className="player-app">
      <main className="stage" ref={hostRef} />
      {dock ? (
        <TableDock editor={editor} docVersion={state.docVersion} dice={dice} gm={false} tab={dock} onTab={setDock} onClose={() => setDock(null)}
          onFocus={(t) => viewRef.current?.centerOn(t)} />
      ) : (
        connected && <button className="dock-open" onClick={() => setDock('dados')}>🎲 Mesa</button>
      )}
      <DiceFlash dice={dice} />
      {!connected && (
        <div className="player-wait" role="status">
          {room === null
            ? 'Aguardando o mapa do mestre. Deixe a janela do editor aberta neste navegador.'
            : status === 'error'
              ? 'Não foi possível entrar na sala. Confira o link com o mestre e a sua conexão.'
              : 'Entrando na sala do mestre…'}
        </div>
      )}
    </div>
  );
}
