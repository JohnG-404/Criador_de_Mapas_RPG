import { AUTH_STORAGE_KEY, getSupabase } from './supabase';
import { shareBaseUrl } from '../desktop';

/**
 * Conta do usuário (Supabase Auth, por e-mail). A conta é opcional: sem ela
 * a nuvem funciona por link, como antes. Com ela, os mapas ficam ligados ao dono.
 */
export interface Account {
  id: string;
  email: string;
}

export interface AuthBackend {
  current(): Promise<Account | null>;
  onChange(fn: (a: Account | null) => void): void;
  signIn(email: string, password: string): Promise<void>;
  /** 'confirm' quando é preciso confirmar o e-mail antes de entrar. */
  signUp(email: string, password: string, redirectTo: string): Promise<'confirm' | 'ok'>;
  magicLink(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
}

type FakeWindow = { __atlasFakeCloud?: boolean };
export const isFakeCloud = () => typeof window !== 'undefined' && !!(window as unknown as FakeWindow).__atlasFakeCloud;

export class AuthError extends Error {}

/** Traduz as mensagens do Supabase Auth. */
export function authMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Já existe uma conta com este e-mail. Use Entrar.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes')) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (m.includes('password') && (m.includes('6') || m.includes('short') || m.includes('weak'))) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('redirect')) return 'O endereço deste site ainda não está liberado no Supabase (URLs de redirecionamento).';
  if (m.includes('invalid') && m.includes('email')) return 'E-mail inválido.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'A criação de contas está desligada no Supabase.';
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com o servidor. Confira a internet.';
  return 'Não foi possível concluir. Tente de novo.';
}

function realBackend(): AuthBackend {
  const toAccount = (u: { id: string; email?: string } | null | undefined): Account | null => (u ? { id: u.id, email: u.email ?? '' } : null);
  return {
    async current() {
      const sb = await getSupabase();
      const { data } = await sb.auth.getSession();
      return toAccount(data.session?.user);
    },
    onChange(fn) {
      void getSupabase().then((sb) => sb.auth.onAuthStateChange((_ev, session) => fn(toAccount(session?.user))));
    },
    async signIn(email, password) {
      const sb = await getSupabase();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new AuthError(authMessage(error.message));
    },
    async signUp(email, password, redirectTo) {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      if (error) throw new AuthError(authMessage(error.message));
      // Com confirmação de e-mail ligada, não vem sessão; e-mail já usado vem sem identidades.
      if (data.user && data.user.identities && data.user.identities.length === 0) throw new AuthError('Já existe uma conta com este e-mail. Use Entrar.');
      return data.session ? 'ok' : 'confirm';
    },
    async magicLink(email, redirectTo) {
      const sb = await getSupabase();
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      if (error) throw new AuthError(authMessage(error.message));
    },
    async signOut() {
      const sb = await getSupabase();
      await sb.auth.signOut();
    },
  };
}

/** Nos testes: contas no localStorage, entram na hora (sem e-mail). */
const FAKE_USERS = 'atlas-board:fake-users';
const FAKE_SESSION = 'atlas-board:fake-session';
function fakeBackend(): AuthBackend {
  const listeners: ((a: Account | null) => void)[] = [];
  const users = (): Record<string, { id: string; password: string }> => JSON.parse(localStorage.getItem(FAKE_USERS) || '{}');
  const setSession = (a: Account | null) => {
    if (a) localStorage.setItem(FAKE_SESSION, JSON.stringify(a));
    else localStorage.removeItem(FAKE_SESSION);
    listeners.forEach((fn) => fn(a));
  };
  const ensure = (email: string, password: string) => {
    const all = users();
    const key = email.trim().toLowerCase();
    all[key] ??= { id: crypto.randomUUID(), password };
    localStorage.setItem(FAKE_USERS, JSON.stringify(all));
    return { id: all[key].id, email: key };
  };
  return {
    async current() {
      return JSON.parse(localStorage.getItem(FAKE_SESSION) || 'null') as Account | null;
    },
    onChange(fn) { listeners.push(fn); },
    async signIn(email, password) {
      const u = users()[email.trim().toLowerCase()];
      if (!u || u.password !== password) throw new AuthError('E-mail ou senha incorretos.');
      setSession({ id: u.id, email: email.trim().toLowerCase() });
    },
    async signUp(email, password) {
      if (users()[email.trim().toLowerCase()]) throw new AuthError('Já existe uma conta com este e-mail. Use Entrar.');
      if (password.length < 6) throw new AuthError('A senha precisa ter pelo menos 6 caracteres.');
      setSession(ensure(email, password));
      return 'ok';
    },
    async magicLink(email) {
      setSession(ensure(email, crypto.randomUUID()));
    },
    async signOut() { setSession(null); },
  };
}

// ---- Estado da conta, para a interface ----

type AuthState = { ready: boolean; account: Account | null };
let state: AuthState = { ready: false, account: null };
const subs = new Set<() => void>();
let backend: AuthBackend | null = null;
let starting: Promise<void> | null = null;

function set(next: Partial<AuthState>) {
  state = { ...state, ...next };
  subs.forEach((fn) => fn());
}

export const authStore = {
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  get: () => state,
};

/** Há uma sessão guardada, ou o endereço traz uma vinda do e-mail? (evita carregar o Supabase à toa) */
export function shouldStartAuth(): boolean {
  if (isFakeCloud()) return true;
  if (/access_token=|error_description=/.test(location.hash)) return true;
  try {
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return false;
  }
}

/** Erro que veio no endereço ao voltar de um link de e-mail (ex.: link vencido). */
export function authErrorFromUrl(): string | null {
  const h = new URLSearchParams(location.hash.slice(1));
  const d = h.get('error_description');
  if (!d) return null;
  return /expired|invalid/i.test(d) ? 'O link do e-mail venceu ou já foi usado. Peça outro.' : 'Não foi possível entrar pelo link do e-mail.';
}

export function startAuth(): Promise<void> {
  starting ??= (async () => {
    backend = isFakeCloud() ? fakeBackend() : realBackend();
    backend.onChange((account) => set({ account, ready: true }));
    try {
      set({ account: await backend.current(), ready: true });
    } catch {
      set({ account: null, ready: true });
    }
    // Tira a sessão (ou o erro) do endereço, depois de lida.
    if (/access_token=|error_description=|error=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  })();
  return starting;
}

async function api() {
  await startAuth();
  return backend!;
}

/** Endereço para onde o link do e-mail volta (mantém ?mapa=… se houver). */
export function redirectUrl(search = '') {
  return `${shareBaseUrl()}${search}`;
}

export async function signIn(email: string, password: string) { await (await api()).signIn(email, password); }
export async function signUp(email: string, password: string, search = '') { return (await api()).signUp(email, password, redirectUrl(search)); }
export async function sendMagicLink(email: string, search = '') { await (await api()).magicLink(email, redirectUrl(search)); }
export async function signOut() { await (await api()).signOut(); }
