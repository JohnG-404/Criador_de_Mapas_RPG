import { useEffect, useRef, useState } from 'react';
import { OBJECT_ASSETS, TOKEN_COLORS } from '../core/doc/objects';
import { TERRAINS } from '../core/doc/terrain';
import { LAYERS, MAX_BRUSH, MIN_BRUSH, TOOLS, type Editor, type EditorState, type ToolId } from '../editor/Editor';
import { OBJECT_TEXTURE_URLS } from '../render/objectTextures';
import { TERRAIN_TEXTURE_URLS } from '../render/terrainTextures';

const TOOL_ICONS: Record<ToolId, string> = {
  pan: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  select: 'M5 3l13 8-6 1.5L9 19z',
  brush: 'M4 20c3 0 5-1.5 5-4 0-1.6-1.4-3-3-3-2.2 0-3 2-3 4 0 1.2-.5 2.3-1 3h2zM9.5 13.5 20 3l1 1-10.5 10.5',
  eraser: 'M4 16l9-9 6 6-7 7H7zM9 20h11',
  bucket: 'M5 11l7-7 7 7-7 7zM5 11h14M20 15c0 1.5 1 2.5 1 3.5a1 1 0 1 1-2 0c0-1 1-2 1-3.5z',
  wall: 'M3 6h18v12H3zM3 12h18M9 6v6M15 12v6',
  door: 'M5 21V4h10v17M15 4l4 2v15M3 21h18M12 12.5v.5',
  object: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  fog: 'M4 10h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M6 18h5',
  ruler: 'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  note: 'M5 3h10l4 4v14H5zM15 3v4h4M8 11h8M8 15h6',
  token: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM7.5 17.5c1-2 2.6-3 4.5-3s3.5 1 4.5 3',
};

const EYE = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z';
const EYE_OFF = 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.5M6.6 6.6C3.7 8.4 2 12 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.4-1';
const LOCK = 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3';
const UNLOCK = 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2';

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ToolPanel({ editor, state }: { editor: Editor; state: EditorState }) {
  const { tool } = state;
  const terrainTool = tool === 'brush' || tool === 'eraser' || tool === 'bucket';
  const usesBrush = tool === 'brush' || tool === 'eraser' || tool === 'fog';
  return (
    <aside className="panel" aria-label="Ferramentas">
      <section>
        <h2>Ferramenta</h2>
        <div className="tools" role="radiogroup" aria-label="Ferramenta">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={tool === t.id}
              className={tool === t.id ? 'active' : ''}
              onClick={() => editor.setTool(t.id)}
              title={`${t.name} (${t.key.toUpperCase()})`}
            >
              <Icon d={TOOL_ICONS[t.id]} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      {terrainTool && (
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
      )}

      {tool === 'fog' && (
        <section>
          <h2>Névoa de guerra</h2>
          <div className="segmented" role="radiogroup" aria-label="Modo da névoa">
            {(['hide', 'reveal'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={state.fogMode === m} className={state.fogMode === m ? 'active' : ''} onClick={() => editor.setFogMode(m)}>
                {m === 'hide' ? 'Cobrir' : 'Revelar'}
              </button>
            ))}
          </div>
          <div className="row-buttons">
            <button onClick={() => editor.fogAll(true)}>Cobrir tudo</button>
            <button onClick={() => editor.fogAll(false)}>Revelar tudo</button>
          </div>
          <p className="help">Pinte com o mouse. <kbd>Alt</kbd> inverte o modo durante o traço. Os jogadores veem a névoa opaca.</p>
          <label className="check">
            <input type="checkbox" checked={state.autoReveal} onChange={(e) => editor.setAutoReveal(e.target.checked)} />
            Revelar pela visão dos personagens
          </label>
          <p className="help">Tokens marcados como personagem de jogador revelam o que enxergam ao se mover. Paredes e portas fechadas bloqueiam.</p>
        </section>
      )}

      {tool === 'ruler' && (
        <section>
          <h2>Régua</h2>
          <p className="help">Arraste de uma célula a outra para medir. A diagonal conta como 1 célula. <kbd>Esc</kbd> apaga a medida.</p>
        </section>
      )}

      {tool === 'note' && !editor.selectedNote() && (
        <section>
          <h2>Notas do mestre</h2>
          <p className="help">Clique no mapa para prender uma nota. Só você vê as notas; a janela dos jogadores não mostra.</p>
        </section>
      )}
      {(tool === 'note' || tool === 'select') && editor.selectedNote() && <NotePanel editor={editor} />}

      {usesBrush || terrainTool ? (
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
      ) : null}

      {(tool === 'wall' || tool === 'door') && (
        <section>
          <h2>{tool === 'wall' ? 'Paredes' : 'Portas'}</h2>
          <ul className="help-list">
            {tool === 'wall' ? (
              <>
                <li>Arraste entre os cantos das células para criar uma parede.</li>
                <li>Segure <kbd>Shift</kbd> ao arrastar para criar uma sala inteira.</li>
              </>
            ) : (
              <>
                <li>Clique numa borda de célula para pôr uma porta. Se houver parede ali, ela é aberta.</li>
                <li>Clique de novo numa porta para voltar a ser parede.</li>
              </>
            )}
            <li><kbd>Alt</kbd> + clique apaga a parede ou porta sob o mouse.</li>
          </ul>
        </section>
      )}

      {tool === 'object' && (
        <section>
          <h2>Objeto</h2>
          <div className="objects" role="radiogroup" aria-label="Objeto">
            {OBJECT_ASSETS.map((a) => (
              <button
                key={a.key}
                role="radio"
                aria-checked={state.objectAsset === a.key}
                className={state.objectAsset === a.key ? 'active' : ''}
                onClick={() => editor.setObjectAsset(a.key)}
                title={a.name}
              >
                <img src={OBJECT_TEXTURE_URLS[a.key]} alt="" />
                <span>{a.name}</span>
              </button>
            ))}
          </div>
          <p className="help">Encaixa a cada meia célula. Segure Shift para posição livre.</p>
        </section>
      )}

      {tool === 'token' && (
        <section>
          <h2>Cor do token</h2>
          <ColorPicker value={state.tokenColor} onChange={(c) => editor.setTokenColor(c)} />
          <p className="help">Clique numa célula para pôr um token. Use Selecionar para mover e renomear.</p>
        </section>
      )}

      {tool === 'select' && !editor.selectedNote() && <SelectionPanel editor={editor} state={state} />}

      <section>
        <h2>Camadas</h2>
        <ul className="layers">
          {LAYERS.map((l) => {
            const ls = state.layers[l.id];
            return (
              <li key={l.id} className={ls.visible ? '' : 'hidden-layer'}>
                <span>{l.name}</span>
                <button
                  aria-pressed={!ls.visible}
                  aria-label={`${ls.visible ? 'Ocultar' : 'Mostrar'} ${l.name}`}
                  title={ls.visible ? 'Ocultar' : 'Mostrar'}
                  onClick={() => editor.setLayer(l.id, { visible: !ls.visible })}
                >
                  <Icon d={ls.visible ? EYE : EYE_OFF} size={16} />
                </button>
                <button
                  aria-pressed={ls.locked}
                  aria-label={`${ls.locked ? 'Destravar' : 'Travar'} ${l.name}`}
                  title={ls.locked ? 'Destravar' : 'Travar'}
                  onClick={() => editor.setLayer(l.id, { locked: !ls.locked })}
                >
                  <Icon d={ls.locked ? LOCK : UNLOCK} size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="colors" role="radiogroup" aria-label="Cor do token">
      {TOKEN_COLORS.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          className={value === c ? 'active' : ''}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function SelectionPanel({ editor }: { editor: Editor; state: EditorState }) {
  const obj = editor.selectedObject();
  const tok = editor.selectedToken();
  // O nome é editado localmente e gravado (uma vez no histórico) ao sair do campo.
  const [name, setName] = useState(tok?.name ?? '');
  useEffect(() => { setName(tok?.name ?? ''); }, [tok?.id, tok?.name]);

  if (!obj && !tok) {
    return (
      <section>
        <h2>Seleção</h2>
        <p className="help">Clique num objeto, token ou nota para selecionar e arraste para mover. Clique numa porta para abrir ou fechar.</p>
      </section>
    );
  }
  if (obj) {
    const asset = OBJECT_ASSETS.find((a) => a.key === obj.asset);
    return (
      <section data-testid="selection-panel">
        <h2>{asset?.name ?? 'Objeto'}</h2>
        <div className="row-buttons">
          <button onClick={() => editor.rotateSelection(-15)} title="Girar à esquerda (Shift+R)">⟲ Girar</button>
          <button onClick={() => editor.rotateSelection(15)} title="Girar à direita (R)">⟳ Girar</button>
          <button onClick={() => editor.resizeSelection(-1)} title="Diminuir ([)" aria-label="Diminuir">−</button>
          <button onClick={() => editor.resizeSelection(1)} title="Aumentar (])" aria-label="Aumentar">+</button>
        </div>
        <p className="help">{Math.round(obj.rot)}° · escala {obj.scale.toLocaleString('pt-BR')}</p>
        <button className="danger" onClick={() => editor.deleteSelection()}>Apagar (Del)</button>
      </section>
    );
  }
  return (
    <section data-testid="selection-panel">
      <h2><label htmlFor="token-name">Token</label></h2>
      <input
        id="token-name"
        className="text-input"
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => editor.renameSelectedToken(name.trim() || tok!.name)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <ColorPicker value={tok!.color} onChange={(c) => editor.setTokenColor(c)} />
      <div className="row-buttons">
        <button onClick={() => editor.resizeSelection(-1)} title="Diminuir ([)" aria-label="Diminuir">−</button>
        <span className="help">Tamanho {tok!.size.toLocaleString('pt-BR')}</span>
        <button onClick={() => editor.resizeSelection(1)} title="Aumentar (])" aria-label="Aumentar">+</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={!!tok!.pc} onChange={(e) => editor.setTokenPc(e.target.checked)} />
        Personagem de jogador
      </label>
      {tok!.pc && (
        <label className="inline-number">
          Visão (células)
          <input
            type="number"
            min={1}
            max={60}
            value={tok!.vision ?? 12}
            onChange={(e) => editor.setTokenVision(Number(e.target.value) || 1)}
          />
        </label>
      )}
      <button className="danger" onClick={() => editor.deleteSelection()}>Apagar (Del)</button>
    </section>
  );
}

function NotePanel({ editor }: { editor: Editor }) {
  const note = editor.selectedNote()!;
  const [text, setText] = useState(note.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setText(note.text); }, [note.id, note.text]);
  // Nota nova: foca o campo depois que o clique no mapa termina (senão o mapa pega o foco de volta).
  useEffect(() => {
    if (note.text) return;
    const t = window.setTimeout(() => ref.current?.focus(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);
  return (
    <section data-testid="note-panel">
      <h2><label htmlFor="note-text">Nota</label></h2>
      <textarea
        id="note-text"
        className="text-input"
        rows={6}
        value={text}
        maxLength={2000}
        placeholder="Ex.: armadilha de dardos, CD 13 para perceber"
        ref={ref}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => editor.setNoteText(text)}
      />
      <p className="help">A primeira linha aparece no mapa. Só o mestre vê.</p>
      <button className="danger" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.deleteSelection()}>Apagar nota</button>
    </section>
  );
}
