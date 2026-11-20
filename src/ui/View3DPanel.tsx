import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/Editor';
import type { MapView } from '../render/MapView';
import type { View3D } from '../render3d/View3D';
import { WALL_HEIGHTS, type WallHeight } from '../render3d/sceneData';

const HEIGHT_LABELS: Record<WallHeight, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

/** Vista 3D por cima da área do mapa. O three.js só é baixado quando ela abre. */
export function View3DPanel({ editor, view, showGrid, docVersion, onClose }: {
  editor: Editor;
  view: MapView;
  showGrid: boolean;
  docVersion: number;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const v3d = useRef<View3D | null>(null);
  const [wallHeight, setWallHeight] = useState<WallHeight>('media');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const grid = useRef(showGrid);
  grid.current = showGrid;

  useEffect(() => {
    let alive = true;
    import('../render3d/View3D')
      .then(({ View3D }) => {
        if (!alive || !host.current) return;
        try {
          v3d.current = new View3D(host.current, editor.doc, {
            ground: () => view.renderGround(grid.current),
            wallHeight,
            onReady: () => setStatus('ready'),
          });
          (window as unknown as { atlas: Record<string, unknown> }).atlas.view3d = v3d.current;
        } catch {
          setStatus('error');
        }
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
      v3d.current?.destroy();
      v3d.current = null;
    };
    // Cria uma vez; as mudanças chegam pelos efeitos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { v3d.current?.setDoc(editor.doc); }, [editor, docVersion]);
  useEffect(() => { v3d.current?.setWallHeight(wallHeight); }, [wallHeight]);
  useEffect(() => { v3d.current?.refreshGround(); }, [showGrid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="view3d" data-testid="view-3d">
      <div className="view3d-host" ref={host} />
      <div className="view3d-bar">
        <div className="view3d-heights" role="radiogroup" aria-label="Altura das paredes">
          <span>Paredes</span>
          {(Object.keys(WALL_HEIGHTS) as WallHeight[]).map((k) => (
            <button key={k} role="radio" aria-checked={wallHeight === k} className={wallHeight === k ? 'active' : ''} onClick={() => setWallHeight(k)}>
              {HEIGHT_LABELS[k]}
            </button>
          ))}
        </div>
        <button onClick={() => v3d.current?.resetCamera()}>Recentrar</button>
        <button className="primary" onClick={onClose}>Voltar ao 2D</button>
      </div>
      <p className="view3d-help">Arraste para girar · botão direito move · roda aproxima. A edição continua no 2D.</p>
      {status === 'loading' && <div className="view3d-status">Montando a cena 3D…</div>}
      {status === 'error' && <div className="view3d-status" role="alert">Não foi possível abrir a vista 3D neste navegador (WebGL indisponível).</div>}
    </div>
  );
}
