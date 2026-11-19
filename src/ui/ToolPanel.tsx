import { TERRAINS } from '../core/doc/terrain';
import { MAX_BRUSH, MIN_BRUSH, TOOLS, type Editor, type EditorState, type ToolId } from '../editor/Editor';
import { TERRAIN_TEXTURE_URLS } from '../render/terrainTextures';

const TOOL_ICONS: Record<ToolId, string> = {
  pan: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  brush: 'M4 20c3 0 5-1.5 5-4 0-1.6-1.4-3-3-3-2.2 0-3 2-3 4 0 1.2-.5 2.3-1 3h2zM9.5 13.5 20 3l1 1-10.5 10.5',
  eraser: 'M4 16l9-9 6 6-7 7H7zM9 20h11',
  bucket: 'M5 11l7-7 7 7-7 7zM5 11h14M20 15c0 1.5 1 2.5 1 3.5a1 1 0 1 1-2 0c0-1 1-2 1-3.5z',
};

export function ToolPanel({ editor, state }: { editor: Editor; state: EditorState }) {
  const usesBrush = state.tool === 'brush' || state.tool === 'eraser';
  return (
    <aside className="panel" aria-label="Ferramentas">
      <section>
        <h2>Ferramenta</h2>
        <div className="tools" role="radiogroup" aria-label="Ferramenta">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={state.tool === t.id}
              className={state.tool === t.id ? 'active' : ''}
              onClick={() => editor.setTool(t.id)}
              title={`${t.name} (${t.key.toUpperCase()})`}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d={TOOL_ICONS[t.id]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Terreno</h2>
        <div className="terrains" role="radiogroup" aria-label="Terreno">
          {TERRAINS.map((t, i) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={state.terrain === t.id}
              className={state.terrain === t.id ? 'active' : ''}
              onClick={() => editor.setTerrain(t.id)}
              title={`${t.name} (${i + 1})`}
            >
              <span className="swatch" style={{ backgroundImage: `url(${TERRAIN_TEXTURE_URLS[t.key]})` }} />
              <span>{t.name}</span>
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      </section>

      <section className={usesBrush ? '' : 'dimmed'}>
        <h2>
          <label htmlFor="brush-size">Tamanho do pincel</label>
          <output data-testid="brush-size">{state.brushSize}</output>
        </h2>
        <input
          id="brush-size"
          type="range"
          min={MIN_BRUSH}
          max={MAX_BRUSH}
          value={state.brushSize}
          disabled={!usesBrush}
          onChange={(e) => editor.setBrushSize(Number(e.target.value))}
        />
        <p className="help">[ e ] mudam o tamanho</p>
      </section>
    </aside>
  );
}
