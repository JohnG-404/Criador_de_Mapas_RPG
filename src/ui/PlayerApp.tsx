import { useEffect, useRef, useState } from 'react';
import { parseMap } from '../core/doc/serialize';
import { Editor } from '../editor/Editor';
import { listenToGm } from '../editor/playerSync';
import { MapView } from '../render/MapView';

/**
 * Janela dos jogadores: mostra o mapa que o mestre está editando, com a névoa
 * opaca e sem ferramentas. Pensada para um segundo monitor ou TV.
 */
export function PlayerApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [editor] = useState(() => new Editor());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    document.title = 'Atlas Board · Jogadores';
    const view = new MapView(editor, {}, 'player');
    void view.mount(hostRef.current!);
    (window as unknown as { atlas?: unknown }).atlas = { editor, view };
    const stop = listenToGm(
      (map) => {
        try {
          editor.loadDocument(parseMap(map));
          setConnected(true);
        } catch {
          // Mensagem inválida: mantém o mapa atual.
        }
      },
      (rect) => view.showRect(rect),
    );
    return () => {
      stop();
      view.destroy();
    };
  }, [editor]);

  return (
    <div className="player-app">
      <main className="stage" ref={hostRef} />
      {!connected && (
        <div className="player-wait" role="status">
          Aguardando o mapa do mestre. Deixe a janela do editor aberta neste navegador.
        </div>
      )}
    </div>
  );
}
