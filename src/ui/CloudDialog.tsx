import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Campaign } from '../core/doc/serialize';
import { canEdit, isEmail, type LinkAccess, type ShareRole } from '../online/access';
import { authStore } from '../online/auth';
import * as cloud from '../online/cloud';
import type { CloudMap, RemoteMap, Share } from '../online/cloud';

interface Props {
  /** Lê a campanha na hora de salvar (um mapa ou vários ligados). */
  campaign: () => Campaign;
  onOpened: (c: Campaign, name: string) => void;
  onClose: () => void;
  onLogin: () => void;
  notify: (text: string, error?: boolean) => void;
}

const ROLE_LABEL = { owner: 'Seu', edit: 'Pode editar', view: 'Só ver' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function LinkField({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="link-row">
        <input className="text-input" readOnly value={value} data-testid={testId} onFocus={(e) => e.target.select()} aria-label={label} />
        <button type="button" onClick={() => {
          void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }, () => setCopied(false));
        }}>{copied ? 'Copiado!' : 'Copiar'}</button>
      </div>
    </div>
  );
}

/** Salvar e abrir mapas na nuvem; com conta, também "Meus mapas" e compartilhamento. */
export function CloudDialog({ campaign, onOpened, onClose, onLogin, notify }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const { account } = useSyncExternalStore(authStore.subscribe, authStore.get);
  const [current, setCurrent] = useState<CloudMap | null>(() => cloud.currentCloudMap());
  const [local, setLocal] = useState<CloudMap[]>(() => cloud.listCloudMaps());
  const [remote, setRemote] = useState<RemoteMap[] | null>(null);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ShareRole>('view');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const refreshLocal = () => { setCurrent(cloud.currentCloudMap()); setLocal(cloud.listCloudMaps()); };

  const loadRemote = useCallback(() => {
    if (!account) { setRemote(null); return; }
    cloud.myCloudMaps().then((list) => { setRemote(list); refreshLocal(); }, (e: Error) => setError(e.message));
  }, [account]);
  useEffect(loadRemote, [loadRemote]);

  const isOwner = !!account && current?.role === 'owner';
  useEffect(() => {
    if (!isOwner || !current) { setShares(null); return; }
    cloud.listShares(current.id).then(setShares, () => setShares([]));
  }, [isOwner, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  const save = (asNew: boolean) => run(async () => {
    await cloud.saveToCloud(campaign(), asNew);
    refreshLocal();
    loadRemote();
    notify('Mapa salvo na nuvem');
  });

  const open = async (id: string, token: string | null, name: string) => {
    setBusy(true);
    setError(null);
    try {
      onOpened(await cloud.loadFromCloud(id, token), name);
    } catch (e) {
      setError((e as Error).message || 'Não foi possível abrir o mapa.');
      setBusy(false);
    }
  };

  const invite = () => run(async () => {
    if (!current || !isEmail(inviteEmail)) throw new Error('Escreva um e-mail válido.');
    if (inviteEmail.trim().toLowerCase() === account?.email) throw new Error('Este é o seu e-mail.');
    await cloud.shareMap(current.id, inviteEmail, inviteRole);
    setShares(await cloud.listShares(current.id));
    setInviteEmail('');
  });

  const changeShare = (email: string, role: ShareRole | null) => run(async () => {
    if (!current) return;
    await cloud.shareMap(current.id, email, role);
    setShares(await cloud.listShares(current.id));
  });

  const changeLink = (access: LinkAccess, newKey = false) => run(async () => {
    if (!current) return;
    setCurrent(await cloud.setLinkAccess(current, access, newKey));
    setLocal(cloud.listCloudMaps());
    if (newKey) notify('Link novo gerado. O anterior parou de funcionar.');
  });

  const remoteIds = new Set(remote?.map((m) => m.id));
  const othersRemote = (remote ?? []).filter((m) => m.id !== current?.id);
  const othersLocal = local.filter((m) => m.id !== current?.id && !remoteIds.has(m.id) && !(m.role && !m.token));
  const viewOnly = current?.role === 'view';

  return (
    <dialog ref={ref} className="dialog dialog-wide" aria-labelledby="cloud-title">
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2 id="cloud-title">Nuvem</h2>
        {account ? (
          <p className="dialog-text">Conta: <strong>{account.email}</strong>. Os mapas que você salva ficam em seu nome, e você escolhe quem pode abrir cada um.</p>
        ) : (
          <div className="callout">
            <p className="dialog-text">Sem conta, quem tiver o link abre e edita o mapa. Entre para guardar os mapas em seu nome, ver a lista em qualquer computador e escolher quem pode ver ou editar.</p>
            <button type="button" onClick={onLogin}>Entrar ou criar conta</button>
          </div>
        )}

        {!current && <p className="help">Este mapa ainda não está na nuvem.</p>}

        {current && !current.role && (
          <>
            <LinkField label={`Link deste mapa (salvo em ${when(current.savedAt)}). Quem tiver o link abre e edita.`} value={cloud.cloudLink(current)} testId="cloud-link" />
            {account && (
              <div className="callout">
                <p className="help">Este mapa foi salvo sem conta. Guardando na sua conta, ele aparece em Meus mapas e você controla o acesso. O link continua funcionando até você mudar.</p>
                <button type="button" disabled={busy} onClick={() => void run(async () => { setCurrent(await cloud.claimCloudMap(current)); setLocal(cloud.listCloudMaps()); loadRemote(); notify('Mapa guardado na sua conta'); })}>
                  Guardar na minha conta
                </button>
              </div>
            )}
          </>
        )}

        {current && current.role && current.role !== 'owner' && (
          <>
            <p className="dialog-text" data-testid="cloud-shared-info">
              {current.name}: compartilhado{current.ownerEmail ? ` por ${current.ownerEmail}` : ''}. Você {viewOnly ? 'só pode ver' : 'pode editar'}.
              {viewOnly && ' Para mudar, use "Salvar como novo" e fica com uma cópia sua.'}
            </p>
            {account && <LinkField label="Link para quem foi convidado (pede login)" value={cloud.accountLink(current.id)} testId="cloud-account-link" />}
          </>
        )}

        {current && current.role === 'owner' && !account && (
          <div className="callout">
            <p className="help">Este mapa é de uma conta. Entre para atualizar e escolher quem pode abrir.</p>
            <button type="button" onClick={onLogin}>Entrar</button>
          </div>
        )}

        {current && isOwner && (
          <>
            <p className="help">Seu mapa <strong>{current.name}</strong>, salvo em {when(current.savedAt)}.</p>
            <LinkField label="Link para você e os convidados (pede login)" value={cloud.accountLink(current.id)} testId="cloud-account-link" />
            <div className="field">
              <span className="field-label">Convidados</span>
              {shares && shares.length > 0 ? (
                <ul className="cloud-list" data-testid="share-list">
                  {shares.map((s) => (
                    <li key={s.email}>
                      <span className="cloud-name">{s.email}</span>
                      <select value={s.role} disabled={busy} aria-label={`Acesso de ${s.email}`} onChange={(e) => void changeShare(s.email, e.target.value as ShareRole)}>
                        <option value="view">Só ver</option>
                        <option value="edit">Pode editar</option>
                      </select>
                      <button type="button" className="danger-text" disabled={busy} onClick={() => void changeShare(s.email, null)}>Tirar</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="help">{shares ? 'Ninguém convidado ainda.' : 'Carregando…'}</p>
              )}
              <div className="link-row">
                <input className="text-input" type="email" placeholder="e-mail da pessoa" value={inviteEmail} aria-label="E-mail para convidar"
                  onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void invite(); } }} />
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as ShareRole)} aria-label="Acesso do convidado">
                  <option value="view">Só ver</option>
                  <option value="edit">Pode editar</option>
                </select>
                <button type="button" disabled={busy} onClick={() => void invite()}>Convidar</button>
              </div>
              <p className="help">A pessoa entra com este e-mail e o mapa aparece em Meus mapas dela. Mande o link acima.</p>
            </div>
            <label>
              Acesso por link, sem conta
              <select value={current.linkAccess ?? 'none'} disabled={busy} data-testid="link-access" onChange={(e) => void changeLink(e.target.value as LinkAccess)}>
                <option value="none">Desligado (só você e os convidados)</option>
                <option value="view">Qualquer pessoa com o link pode ver</option>
                <option value="edit">Qualquer pessoa com o link pode editar</option>
              </select>
            </label>
            {current.linkAccess && current.linkAccess !== 'none' && current.token && (
              <>
                <LinkField label="Link aberto (não pede login)" value={cloud.cloudLink(current)} testId="cloud-link" />
                <button type="button" className="link-btn align-start" disabled={busy} onClick={() => void changeLink(current.linkAccess!, true)}>
                  Gerar link novo (o atual para de funcionar)
                </button>
              </>
            )}
          </>
        )}

        {error && <p className="danger-text" role="alert">{error}</p>}

        {account && (
          <div className="field">
            <span className="field-label">Meus mapas</span>
            {remote === null ? (
              <p className="help">Carregando…</p>
            ) : othersRemote.length === 0 ? (
              <p className="help">{remote.length ? 'Nenhum outro mapa.' : 'Nenhum mapa na sua conta ainda.'}</p>
            ) : (
              <ul className="cloud-list" data-testid="my-maps">
                {othersRemote.map((m) => (
                  <li key={m.id}>
                    <span className="cloud-name" title={m.ownerEmail && m.role !== 'owner' ? `de ${m.ownerEmail}` : undefined}>{m.name}</span>
                    <span className="badge">{ROLE_LABEL[m.role]}</span>
                    <span className="help">{when(m.updatedAt)}</span>
                    <button type="button" disabled={busy} onClick={() => void open(m.id, null, m.name)}>Abrir</button>
                    {m.role === 'owner' ? (
                      confirmDelete === m.id ? (
                        <button type="button" className="danger-text" disabled={busy}
                          onClick={() => void run(async () => { await cloud.deleteCloudMap(m.id); setConfirmDelete(null); refreshLocal(); loadRemote(); notify('Mapa apagado da nuvem'); })}>Apagar mesmo</button>
                      ) : (
                        <button type="button" className="danger-text" disabled={busy} onClick={() => setConfirmDelete(m.id)}>Apagar</button>
                      )
                    ) : (
                      <button type="button" className="danger-text" disabled={busy} title="Tira este mapa da sua lista"
                        onClick={() => void run(async () => { await cloud.leaveCloudMap(m.id); refreshLocal(); loadRemote(); })}>Sair</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {othersLocal.length > 0 && (
          <div className="field">
            <span className="field-label">{account ? 'Abertos por link neste navegador' : 'Outros mapas salvos neste navegador'}</span>
            <ul className="cloud-list" data-testid="cloud-list">
              {othersLocal.map((m) => (
                <li key={m.id}>
                  <span className="cloud-name">{m.name}</span>
                  <span className="help">{when(m.savedAt)}</span>
                  <button type="button" disabled={busy} onClick={() => void open(m.id, m.token || null, m.name)}>Abrir</button>
                  <button type="button" className="danger-text" disabled={busy} title="Tira da lista deste navegador (o mapa continua na nuvem para quem tem o link)"
                    onClick={() => { cloud.forgetCloudMap(m.id); refreshLocal(); }}>Esquecer</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="actions">
          <button type="button" onClick={onClose}>Fechar</button>
          {current && <button type="button" disabled={busy} onClick={() => void save(true)}>Salvar como novo</button>}
          <button type="button" className="primary" disabled={busy || viewOnly || (current?.role === 'owner' && !account) || (current?.role !== undefined && !canEdit(current.role))} onClick={() => void save(false)}>
            {busy ? 'Aguarde…' : current ? 'Atualizar na nuvem' : 'Salvar na nuvem'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
