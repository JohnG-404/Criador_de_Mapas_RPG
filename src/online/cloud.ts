import { campaignToJson, parseCampaign, type Campaign } from '../core/doc/serialize';
import { shareBaseUrl } from '../desktop';
import { canEdit, roleFor, type LinkAccess, type Role, type ShareRole } from './access';
import { authStore, isFakeCloud } from './auth';
import { getSupabase } from './supabase';

/**
 * Mapas salvos na nuvem (Supabase).
 *
 * Sem conta: cada mapa tem um id e uma chave secreta; quem tem o link
 * (?mapa=id#chave) abre e edita. A chave vai depois do "#", que não vai ao servidor.
 *
 * Com conta: o mapa é do dono, aparece em "Meus mapas" em qualquer computador
 * e o dono escolhe quem abre: convidados por e-mail (ver ou editar) e o
 * acesso por link (desligado, ver ou editar). O link sem chave (?mapa=id)
 * pede login e vale para o dono e os convidados.
 */
export interface CloudMap {
  id: string;
  /** Chave do link; vazia quando o mapa foi aberto pela conta. */
  token: string;
  name: string;
  savedAt: string;
  /** Sem papel: mapa antigo, aberto só pela chave. */
  role?: Role;
  linkAccess?: LinkAccess;
  ownerEmail?: string | null;
}

export interface RemoteMap {
  id: string;
  name: string;
  updatedAt: string;
  role: Role;
  linkAccess: LinkAccess;
  ownerEmail: string | null;
}

export interface Share {
  email: string;
  role: ShareRole;
}

export const CLOUD_QUERY = 'mapa';
const LIST_KEY = 'atlas-board:cloud-maps';
const CURRENT_KEY = 'atlas-board:cloud-current';
/** Mesmo limite da função no banco. */
export const CLOUD_MAX_CHARS = 8_000_000;

export class CloudError extends Error {
  constructor(message: string, readonly needsLogin = false) {
    super(message);
  }
}

interface Opened {
  name: string;
  data: string;
  role: Role;
  linkAccess: LinkAccess;
  ownerEmail: string | null;
}

export interface CloudStore {
  put(id: string | null, token: string | null, name: string, data: string): Promise<string>;
  open(id: string, token: string | null): Promise<Opened | null>;
  myMaps(): Promise<RemoteMap[]>;
  claim(id: string, token: string): Promise<boolean>;
  listShares(id: string): Promise<Share[]>;
  share(id: string, email: string, role: ShareRole | null): Promise<void>;
  setLink(id: string, access: LinkAccess, newToken: string | null): Promise<void>;
  remove(id: string): Promise<void>;
  leave(id: string): Promise<void>;
}

let store: CloudStore | null = null;
function getStore(): CloudStore {
  return (store ??= isFakeCloud() ? fakeStore() : realStore());
}

function realStore(): CloudStore {
  const rpc = async <T>(fn: string, args: Record<string, unknown>, fail: string): Promise<T> => {
    const sb = await getSupabase();
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      if (error.message.includes('não encontrado')) throw new CloudError('Este mapa não existe mais na nuvem, ou você não pode editá-lo.');
      if (error.message.includes('e-mail inválido')) throw new CloudError('E-mail inválido.');
      if (error.message.includes('limite de convites')) throw new CloudError('Limite de 50 convites por mapa.');
      if (error.message.includes('grande demais')) throw new CloudError('O mapa passou do limite de 8 MB da nuvem.');
      throw new CloudError(fail);
    }
    return data as T;
  };
  type Row = { id: string; name: string; updated_at: string; role: Role; link_access: LinkAccess; owner_email: string | null };
  return {
    put: (id, token, name, data) => rpc<string>('atlas_put_map', { p_id: id, p_token: token, p_name: name, p_data: data }, 'Não foi possível salvar na nuvem.'),
    async open(id, token) {
      const rows = await rpc<(Omit<Row, 'id' | 'updated_at'> & { data: string })[] | null>('atlas_open_map', { p_id: id, p_token: token }, 'Não foi possível abrir o mapa da nuvem.');
      const r = rows?.[0];
      return r ? { name: r.name, data: r.data, role: r.role, linkAccess: r.link_access, ownerEmail: r.owner_email } : null;
    },
    async myMaps() {
      const rows = await rpc<Row[] | null>('atlas_my_maps', {}, 'Não foi possível carregar seus mapas.');
      return (rows ?? []).map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at, role: r.role, linkAccess: r.link_access, ownerEmail: r.owner_email }));
    },
    claim: (id, token) => rpc<boolean>('atlas_claim_map', { p_id: id, p_token: token }, 'Não foi possível guardar o mapa na sua conta.'),
    listShares: async (id) => (await rpc<Share[] | null>('atlas_list_shares', { p_id: id }, 'Não foi possível ver os convites.')) ?? [],
    share: (id, email, role) => rpc<void>('atlas_share_map', { p_id: id, p_email: email, p_role: role }, 'Não foi possível mudar o convite.'),
    setLink: (id, access, newToken) => rpc<void>('atlas_set_link', { p_id: id, p_access: access, p_new_token: newToken }, 'Não foi possível mudar o link.'),
    remove: (id) => rpc<void>('atlas_delete_map', { p_id: id }, 'Não foi possível apagar o mapa.'),
    leave: (id) => rpc<void>('atlas_leave_map', { p_id: id }, 'Não foi possível sair do mapa.'),
  };
}

/** Nos testes: guarda no localStorage, com as mesmas regras do banco. */
function fakeStore(): CloudStore {
  type FakeMap = { token: string; name: string; data: string; ownerId: string | null; linkAccess: LinkAccess; updatedAt: string };
  type Db = { maps: Record<string, FakeMap>; shares: { mapId: string; email: string; role: ShareRole; at: number }[] };
  const key = 'atlas-board:fake-cloud-db';
  const read = (): Db => ({ maps: {}, shares: [], ...JSON.parse(localStorage.getItem(key) || '{}') });
  const write = (db: Db) => localStorage.setItem(key, JSON.stringify(db));
  const me = () => authStore.get().account;
  const role = (db: Db, id: string, token: string | null) => {
    const m = db.maps[id];
    if (!m) return null;
    const u = me();
    const share = u ? db.shares.find((s) => s.mapId === id && s.email === u.email)?.role ?? null : null;
    return roleFor(m, share, u, token);
  };
  const ownerEmail = (m: FakeMap) => {
    const users = JSON.parse(localStorage.getItem('atlas-board:fake-users') || '{}') as Record<string, { id: string }>;
    return Object.entries(users).find(([, u]) => u.id === m.ownerId)?.[0] ?? null;
  };
  const mustOwn = (db: Db, id: string) => { if (role(db, id, null) !== 'owner') throw new CloudError('Só o dono pode fazer isso.'); };
  return {
    async put(id, token, name, data) {
      const db = read();
      const now = new Date().toISOString();
      if (!id) {
        const u = me();
        const out = crypto.randomUUID();
        db.maps[out] = { token: token ?? '', name, data, ownerId: u?.id ?? null, linkAccess: u ? 'none' : 'edit', updatedAt: now };
        write(db);
        return out;
      }
      if (!canEdit(role(db, id, token))) throw new CloudError('Este mapa não existe mais na nuvem, ou você não pode editá-lo.');
      Object.assign(db.maps[id], { name, data, updatedAt: now });
      write(db);
      return id;
    },
    async open(id, token) {
      const db = read();
      const r = role(db, id, token);
      const m = db.maps[id];
      return r && m ? { name: m.name, data: m.data, role: r, linkAccess: m.linkAccess, ownerEmail: ownerEmail(m) } : null;
    },
    async myMaps() {
      const db = read();
      const u = me();
      if (!u) return [];
      return Object.entries(db.maps)
        .map(([id, m]) => ({ id, m, r: role(db, id, null) }))
        .filter((x) => x.r)
        .map(({ id, m, r }) => ({ id, name: m.name, updatedAt: m.updatedAt, role: r!, linkAccess: m.linkAccess, ownerEmail: ownerEmail(m) }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async claim(id, token) {
      const db = read();
      const m = db.maps[id];
      const u = me();
      if (!u || !m || m.ownerId || m.linkAccess !== 'edit' || m.token !== token) return false;
      m.ownerId = u.id;
      write(db);
      return true;
    },
    async listShares(id) {
      const db = read();
      mustOwn(db, id);
      return db.shares.filter((s) => s.mapId === id).sort((a, b) => a.at - b.at).map(({ email, role }) => ({ email, role }));
    },
    async share(id, email, r) {
      const db = read();
      mustOwn(db, id);
      const e = email.trim().toLowerCase();
      db.shares = db.shares.filter((s) => !(s.mapId === id && s.email === e));
      if (r) db.shares.push({ mapId: id, email: e, role: r, at: Date.now() });
      write(db);
    },
    async setLink(id, access, newToken) {
      const db = read();
      mustOwn(db, id);
      db.maps[id].linkAccess = access;
      if (newToken) db.maps[id].token = newToken;
      write(db);
    },
    async remove(id) {
      const db = read();
      mustOwn(db, id);
      delete db.maps[id];
      db.shares = db.shares.filter((s) => s.mapId !== id);
      write(db);
    },
    async leave(id) {
      const db = read();
      const u = me();
      db.shares = db.shares.filter((s) => !(s.mapId === id && s.email === u?.email));
      write(db);
    },
  };
}

export function newCloudToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const base = () => shareBaseUrl();

/** Link por chave: abre para qualquer pessoa, se o acesso por link estiver ligado. */
export function cloudLink(m: Pick<CloudMap, 'id' | 'token'>) {
  return `${base()}?${CLOUD_QUERY}=${m.id}#${m.token}`;
}
/** Link sem chave: pede login e vale para o dono e os convidados. */
export function accountLink(id: string) {
  return `${base()}?${CLOUD_QUERY}=${id}`;
}

/** Lê id e chave do endereço atual (?mapa=id#chave ou só ?mapa=id), se houver. */
export function cloudRefFromUrl(url: URL = new URL(location.href)): { id: string; token: string | null } | null {
  const id = url.searchParams.get(CLOUD_QUERY);
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const hash = url.hash.slice(1);
  return { id, token: /^[0-9a-f]{24,128}$/i.test(hash) ? hash : null };
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function safeWrite(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento bloqueado: a lista só não é lembrada.
  }
}

/** Mapas já abertos ou salvos neste navegador. */
export function listCloudMaps(): CloudMap[] {
  const list = safeRead<CloudMap[]>(LIST_KEY, []);
  return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string' && typeof m.token === 'string') : [];
}

function remember(m: CloudMap) {
  safeWrite(LIST_KEY, [m, ...listCloudMaps().filter((x) => x.id !== m.id)].slice(0, 50));
}

function patch(id: string, p: Partial<CloudMap>) {
  const m = listCloudMaps().find((x) => x.id === id);
  if (m) safeWrite(LIST_KEY, listCloudMaps().map((x) => (x.id === id ? { ...m, ...p } : x)));
}

export function forgetCloudMap(id: string) {
  safeWrite(LIST_KEY, listCloudMaps().filter((x) => x.id !== id));
  if (currentCloudMap()?.id === id) setCurrentCloudMap(null);
}

/** O mapa da nuvem que está aberto no editor (Salvar na nuvem atualiza este). */
export function currentCloudMap(): CloudMap | null {
  const id = safeRead<string | null>(CURRENT_KEY, null);
  return id ? listCloudMaps().find((m) => m.id === id) ?? null : null;
}
export function setCurrentCloudMap(id: string | null) {
  safeWrite(CURRENT_KEY, id);
}

/** Salva o mapa: atualiza o atual, ou cria um novo se não houver (ou se `asNew`). */
export async function saveToCloud(c: Campaign, asNew = false): Promise<CloudMap> {
  const data = campaignToJson(c);
  if (data.length > CLOUD_MAX_CHARS) throw new CloudError('O mapa passou do limite de 8 MB da nuvem. Use imagens menores.');
  const cur = asNew ? null : currentCloudMap();
  if (cur && cur.role === 'view') throw new CloudError('Você só pode ver este mapa. Use "Salvar como novo" para guardar uma cópia sua.');
  const account = authStore.get().account;
  const token = cur ? cur.token || null : newCloudToken();
  const name = c.maps[0].options.name || 'Mapa';
  const id = await getStore().put(cur?.id ?? null, token, name, data);
  const m: CloudMap = cur
    ? { ...cur, name, savedAt: new Date().toISOString() }
    : { id, token: token ?? '', name, savedAt: new Date().toISOString(), ...(account ? { role: 'owner', linkAccess: 'none', ownerEmail: account.email } : {}) };
  remember(m);
  setCurrentCloudMap(id);
  return m;
}

/** Abre um mapa da nuvem e passa a tratá-lo como o mapa atual. */
export async function loadFromCloud(id: string, token: string | null): Promise<Campaign> {
  const row = await getStore().open(id, token);
  if (!row) {
    if (!authStore.get().account) {
      throw new CloudError(token ? 'Mapa não encontrado na nuvem, ou o link foi desligado pelo dono.' : 'Entre na sua conta para abrir este mapa.', !token);
    }
    throw new CloudError('Mapa não encontrado, ou você não tem acesso a ele.');
  }
  const doc = parseCampaign(row.data);
  const known = listCloudMaps().find((m) => m.id === id);
  // Mapa antigo sem dono continua "por link" (sem papel), como antes.
  const legacy = row.ownerEmail === null && !!token && row.role === 'edit';
  remember({
    id,
    token: token ?? known?.token ?? '',
    name: row.name,
    savedAt: known?.savedAt ?? new Date().toISOString(),
    ...(legacy ? {} : { role: row.role, linkAccess: row.linkAccess, ownerEmail: row.ownerEmail }),
  });
  setCurrentCloudMap(id);
  return doc;
}

/** Meus mapas (e os compartilhados comigo). Atualiza o papel guardado dos que estão neste navegador. */
export async function myCloudMaps(): Promise<RemoteMap[]> {
  const list = await getStore().myMaps();
  for (const r of list) patch(r.id, { role: r.role, linkAccess: r.linkAccess, ownerEmail: r.ownerEmail, name: r.name });
  return list;
}

/** Passa um mapa antigo (por link, sem dono) para a conta. */
export async function claimCloudMap(m: CloudMap): Promise<CloudMap> {
  const account = authStore.get().account;
  if (!account) throw new CloudError('Entre na sua conta primeiro.', true);
  if (!(await getStore().claim(m.id, m.token))) throw new CloudError('Este mapa já tem dono, ou o link mudou.');
  const out: CloudMap = { ...m, role: 'owner', linkAccess: 'edit', ownerEmail: account.email };
  remember(out);
  return out;
}

export const listShares = (id: string) => getStore().listShares(id);
export const shareMap = (id: string, email: string, role: ShareRole | null) => getStore().share(id, email, role);

/**
 * Muda o acesso por link. Gera uma chave nova quando pedido (o link antigo
 * para de funcionar) ou quando este navegador não conhece a chave.
 */
export async function setLinkAccess(m: CloudMap, access: LinkAccess, newKey = false): Promise<CloudMap> {
  const token = newKey || (!m.token && access !== 'none') ? newCloudToken() : null;
  await getStore().setLink(m.id, access, token);
  const out: CloudMap = { ...m, linkAccess: access, token: token ?? m.token };
  if (listCloudMaps().some((x) => x.id === m.id)) patch(m.id, out);
  else remember(out);
  return out;
}

export async function deleteCloudMap(id: string) {
  await getStore().remove(id);
  forgetCloudMap(id);
}

export async function leaveCloudMap(id: string) {
  await getStore().leave(id);
  forgetCloudMap(id);
}

/** Ao sair da conta, esquece os mapas que só abriam pela conta. */
export function forgetAccountMaps() {
  for (const m of listCloudMaps()) if (m.role && !m.token) forgetCloudMap(m.id);
}
