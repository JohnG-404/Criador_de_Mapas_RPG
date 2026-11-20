import { useEffect, useState } from 'react';
import type { Editor, EditorState } from '../editor/Editor';
import { NewMapDialog } from './NewMapDialog';

const NEW_MAP = '__novo__';

/**
 * Mapas da campanha: trocar de mapa (só o mestre), criar, renomear, apagar
 * e levar os jogadores para o mapa aberto.
 */
export function MapsPanel({ editor, state }: { editor: Editor; state: EditorState }) {
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const doc = editor.doc;
  const maps = editor.maps;
  const playerDoc = editor.playerDoc;
  const [name, setName] = useState(doc.options.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setName(doc.options.name); setConfirmDelete(false); }, [doc, state.campaignVersion]);

  return (
    <section data-testid="maps-panel">
      <h2>Mapas da campanha</h2>
      <ul className="maps" role="list">
        {maps.map((m) => (
          <li key={m.id}>
            <button
              className={m === doc ? 'active' : ''}
              aria-current={m === doc ? 'true' : undefined}
              onClick={() => editor.switchMap(m.id)}
              title={m === doc ? 'Mapa aberto' : 'Abrir este mapa (só para você; os jogadores continuam onde estão)'}
            >
              <span className="map-name">{m.options.name}</span>
              {m === playerDoc && <span className="badge" title="Os jogadores estão vendo este mapa">jogadores</span>}
            </button>
          </li>
        ))}
      </ul>
      {maps.length > 1 && (
        <label className="map-rename">
          <span>Nome deste mapa</span>
          <input
            className="text-input"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => editor.renameMap(doc.id, name)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </label>
      )}
      {doc !== playerDoc && (
        <>
          <p className="help">Os jogadores estão em <strong>{playerDoc.options.name}</strong>. Este mapa só você vê.</p>
          <button className="primary" onClick={() => editor.showMapToPlayers()}>Levar os jogadores para este mapa</button>
        </>
      )}
      <div className="row-buttons">
        <button onClick={() => setAdding(true)} title="Cria outro mapa nesta campanha (os mapas atuais continuam)">+ Adicionar mapa</button>
        {maps.length > 1 && (
          <button
            className="danger"
            onClick={() => (confirmDelete ? editor.removeMap(doc.id) : setConfirmDelete(true))}
            title="Tira este mapa da campanha. As passagens que levavam a ele ficam sem destino"
          >
            {confirmDelete ? 'Confirmar: apagar' : 'Apagar este mapa'}
          </button>
        )}
      </div>
      {maps.length === 1 && (
        <p className="help">Crie outros mapas e ligue uns aos outros com a ferramenta Passagem (<kbd>P</kbd>): escadas, portas, portais.</p>
      )}
      {adding && (
        <NewMapDialog
          title="Novo mapa na campanha"
          warning={null}
          defaultName={`Mapa ${maps.length + 1}`}
          onCancel={() => setAdding(false)}
          onCreate={(o) => { setAdding(false); editor.addMap(o); }}
        />
      )}
    </section>
  );
}

/** Passagem selecionada: nome, destino e atravessar. */
export function LinkPanel({ editor, state }: { editor: Editor; state: EditorState }) {
  const link = editor.selectedLink()!;
  const [label, setLabel] = useState(link.label);
  const [carry, setCarry] = useState(true);
  const [creating, setCreating] = useState(false);
  useEffect(() => { setLabel(link.label); }, [link.id, link.label]);
  const others = editor.maps.filter((m) => m !== editor.doc);
  const target = link.target ? editor.findMap(link.target) : undefined;
  const pcs = editor.doc.tokens.all().filter((t) => t.pc).length;
  void state.campaignVersion;

  return (
    <section data-testid="link-panel">
      <h2>Passagem</h2>
      <label>
        <span className="field-label">Leva para</span>
        <select
          className="text-input"
          aria-label="Leva para"
          value={target ? target.id : ''}
          onChange={(e) => {
            if (e.target.value === NEW_MAP) setCreating(true);
            else editor.setLinkTarget(e.target.value);
          }}
        >
          <option value="">— sem destino —</option>
          {others.map((m) => <option key={m.id} value={m.id}>{m.options.name}</option>)}
          <option value={NEW_MAP}>+ Novo mapa…</option>
        </select>
      </label>
      <label>
        <span className="field-label">Nome no mapa</span>
        <input
          className="text-input"
          aria-label="Nome da passagem"
          value={label}
          maxLength={40}
          placeholder="Ex.: Escada para o porão"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => editor.setLinkLabel(label)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </label>
      {target ? (
        <>
          <label className="toggle">
            <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
            Levar os personagens de jogador{pcs ? ` (${pcs})` : ''}
          </label>
          <button
            className="primary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { editor.setLinkLabel(label); editor.followLink(link.id, carry); }}
          >
            Atravessar para {target.options.name}
          </button>
          <p className="help">O grupo vai para o outro mapa: a janela dos jogadores e a sala online acompanham. Para só espiar o mapa, clique nele em Mapas da campanha.</p>
        </>
      ) : (
        <p className="help">Escolha o mapa de destino. Com "+ Novo mapa…", o mapa novo já ganha uma passagem de volta.</p>
      )}
      <button className="danger" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.deleteSelection()}>Apagar passagem</button>
      {creating && (
        <NewMapDialog
          title="Novo mapa de destino"
          warning={null}
          defaultName={link.label.trim() || `Mapa ${editor.maps.length + 1}`}
          onCancel={() => setCreating(false)}
          onCreate={(o) => { setCreating(false); editor.addMapForLink(o); }}
        />
      )}
    </section>
  );
}
