import { useEffect, useRef, useState } from 'react';
import type { Campaign } from '../core/doc/serialize';
import * as cloud from '../online/cloud';
import type { CloudMap } from '../online/cloud';

interface Props {
  /** Lê a campanha na hora de salvar (um mapa ou vários ligados). */
  campaign: () => Campaign;
  onOpened: (c: Campaign, name: string) => void;
  onClose: () => void;
  notify: (text: string, error?: boolean) => void;
}

type CloudModule = typeof cloud;

/** Salvar e abrir mapas na nuvem, para continuar em outro computador. */
export function CloudDialog({ campaign, onOpened, onClose, notify }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mod, setMod] = useState<CloudModule | null>(null);
  const [current, setCurrent] = useState<CloudMap | null>(null);
  const [list, setList] = useState<CloudMap[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);

  useEffect(() => {
    setMod(cloud);
    setCurrent(cloud.currentCloudMap());
    setList(cloud.listCloudMaps());
  }, []);

  const refresh = (m: CloudModule) => { setCurrent(m.currentCloudMap()); setList(m.listCloudMaps()); };

  const save = async (asNew: boolean) => {
    if (!mod) return;
    setBusy(true);
    setError(null);
    try {
      await mod.saveToCloud(campaign(), asNew);
      refresh(mod);
      notify('Mapa salvo na nuvem');
    } catch (e) {
      setError((e as Error).message || 'Não foi possível salvar na nuvem.');
    } finally {
      setBusy(false);
    }
  };

  const open = async (m: CloudMap) => {
    if (!mod) return;
    setBusy(true);
    setError(null);
    try {
      const loaded = await mod.loadFromCloud(m.id, m.token);
      onOpened(loaded, m.name);
    } catch (e) {
      setError((e as Error).message || 'Não foi possível abrir o mapa.');
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!mod || !current) return;
    try {
      await navigator.clipboard.writeText(mod.cloudLink(current));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const others = list.filter((m) => m.id !== current?.id);
  const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="cloud-title">
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2 id="cloud-title">Nuvem</h2>
        <p className="dialog-text">
          Salve o mapa na nuvem para abrir em outro computador. Quem tiver o link abre e edita o mapa, então só mande para quem você confia.
        </p>
        {current ? (
          <>
            <label className="field">
              <span>Link deste mapa (salvo em {when(current.savedAt)})</span>
              <input className="text-input" readOnly value={mod ? mod.cloudLink(current) : ''} data-testid="cloud-link" onFocus={(e) => e.target.select()} />
            </label>
          </>
        ) : (
          <p className="help">Este mapa ainda não está na nuvem.</p>
        )}
        {error && <p className="danger-text" role="alert">{error}</p>}
        {others.length > 0 && (
          <div className="field">
            <span>Outros mapas salvos neste navegador</span>
            <ul className="cloud-list" data-testid="cloud-list">
              {others.map((m) => (
                <li key={m.id}>
                  <span className="cloud-name">{m.name}</span>
                  <span className="help">{when(m.savedAt)}</span>
                  <button type="button" disabled={busy} onClick={() => void open(m)}>Abrir</button>
                  <button type="button" className="danger-text" disabled={busy} title="Tira da lista deste navegador (o mapa continua na nuvem para quem tem o link)"
                    onClick={() => { mod?.forgetCloudMap(m.id); if (mod) refresh(mod); }}>Esquecer</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>Fechar</button>
          {current && <button type="button" onClick={() => void copy()}>{copied ? 'Copiado!' : 'Copiar link'}</button>}
          {current && <button type="button" disabled={busy || !mod} onClick={() => void save(true)}>Salvar como novo</button>}
          <button type="button" className="primary" disabled={busy || !mod} onClick={() => void save(false)}>
            {busy ? 'Salvando…' : current ? 'Atualizar na nuvem' : 'Salvar na nuvem'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
