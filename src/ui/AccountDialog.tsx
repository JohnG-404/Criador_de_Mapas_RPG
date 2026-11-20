import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { authStore, sendMagicLink, signIn, signOut, signUp, startAuth } from '../online/auth';
import { isEmail } from '../online/access';
import { forgetAccountMaps } from '../online/cloud';

interface Props {
  onClose: () => void;
  notify: (text: string, error?: boolean) => void;
  /** Mensagem no topo (ex.: "Entre para abrir este mapa"). */
  reason?: string | null;
  /** Mantido no link do e-mail, para voltar ao mapa (ex.: "?mapa=…"). */
  returnSearch?: string;
}

type Mode = 'signin' | 'signup';

/** Entrar, criar conta ou sair. */
export function AccountDialog({ onClose, notify, reason, returnSearch = '' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const auth = useSyncExternalStore(authStore.subscribe, authStore.get);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);

  useEffect(() => { void startAuth(); }, []);

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

  const submit = () => run(async () => {
    if (!isEmail(email)) throw new Error('Escreva um e-mail válido.');
    if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
    if (mode === 'signin') {
      await signIn(email.trim(), password);
      notify('Você entrou na sua conta');
      onClose();
    } else {
      const r = await signUp(email.trim(), password, returnSearch);
      if (r === 'confirm') setSent(`Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail e clique no link para ativar a conta.`);
      else { notify('Conta criada'); onClose(); }
    }
  });

  const magic = () => run(async () => {
    if (!isEmail(email)) throw new Error('Escreva seu e-mail para receber o link.');
    await sendMagicLink(email.trim(), returnSearch);
    if (authStore.get().account) { notify('Você entrou na sua conta'); onClose(); return; }
    setSent(`Enviamos um link de acesso para ${email.trim()}. Abra o e-mail neste navegador e clique no link.`);
  });

  const account = auth.account;

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="account-title">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (!account && !sent) void submit(); }}>
        <h2 id="account-title">{account ? 'Sua conta' : mode === 'signin' ? 'Entrar' : 'Criar conta'}</h2>
        {account ? (
          <>
            <p className="dialog-text">Você entrou como <strong data-testid="account-email">{account.email}</strong>.</p>
            <p className="help">Os mapas que você salva na nuvem ficam na sua conta. Veja a lista e escolha quem pode abrir cada um no botão Nuvem.</p>
            <div className="actions">
              <button type="button" className="danger-text" disabled={busy}
                onClick={() => void run(async () => { await signOut(); forgetAccountMaps(); notify('Você saiu da conta'); onClose(); })}>Sair da conta</button>
              <button type="button" className="primary" onClick={onClose}>Fechar</button>
            </div>
          </>
        ) : sent ? (
          <>
            <p className="dialog-text" role="status">{sent}</p>
            <p className="help">Não chegou? Veja a caixa de spam. O link vale por pouco tempo.</p>
            <div className="actions">
              <button type="button" onClick={() => setSent(null)}>Voltar</button>
              <button type="button" className="primary" onClick={onClose}>Fechar</button>
            </div>
          </>
        ) : (
          <>
            {reason && <p className="warn" role="status">{reason}</p>}
            <p className="help">
              A conta é opcional. Com ela, seus mapas da nuvem ficam guardados em seu nome, aparecem em qualquer computador e você escolhe quem pode ver ou editar.
            </p>
            <div className="segmented" role="tablist" aria-label="Entrar ou criar conta">
              <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(null); }}>Já tenho conta</button>
              <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(null); }}>Criar conta</button>
            </div>
            <label>
              E-mail
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Senha
              <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="danger-text" role="alert">{error}</p>}
            <div className="actions">
              <button type="button" className="link-btn" disabled={busy} onClick={() => void magic()} title="Recebe por e-mail um link que entra sem senha">
                Entrar sem senha, por e-mail
              </button>
              <button type="button" onClick={onClose}>Cancelar</button>
              <button type="submit" className="primary" disabled={busy}>{busy ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}</button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
