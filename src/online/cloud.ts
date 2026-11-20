import type { MapDocument } from '../core/doc/MapDocument';
import { docToJson, parseMap } from '../core/doc/serialize';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/**
 * Mapas salvos na nuvem (Supabase). Cada mapa tem um id e uma chave secreta;
 * quem tem os dois abre e atualiza o mapa. Não há contas: a lista de mapas
 * fica neste navegador, e o link leva a chave depois do "#", que não vai ao servidor.
 */
export interface CloudMap {
  id: string;
  token: string;
  name: string;
  savedAt: string;
}

export const CLOUD_QUERY = 'mapa';
const LIST_KEY = 'atlas-board:cloud-maps';
const CURRENT_KEY = 'atlas-board:cloud-current';
/** Mesmo limite da função no banco. */
export const CLOUD_MAX_CHARS = 8_000_000;

export interface CloudStore {
  save(id: string | null, token: string, name: string, data: string): Promise<string>;
  load(id: string, token: string): Promise<{ name: string; data: string } | null>;
}

type FakeWindow = { __atlasFakeCloud?: boolean };

let store: CloudStore | null = null;
async function getStore(): Promise<CloudStore> {
  if (store) return store;
  if ((window as unknown as FakeWindow).__atlasFakeCloud) return (store = fakeStore());
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  store = {
    async save(id, token, name, data) {
      const { data: out, error } = await client.rpc('atlas_save_map', { p_id: id, p_token: token, p_name: name, p_data: data });
      if (error) throw new Error(error.message.includes('não encontrado') ? 'Este mapa não existe mais na nuvem.' : 'Não foi possível salvar na nuvem.');
      return out as string;
    },
    async load(id, token) {
      const { data, error } = await client.rpc('atlas_load_map', { p_id: id, p_token: token });
      if (error) throw new Error('Não foi possível abrir o mapa da nuvem.');
      const row = (data as { name: string; data: string }[] | null)?.[0];
      return row ?? null;
    },
  };
  return store;
}

/** Nos testes: guarda no localStorage, com as mesmas regras do banco. */
function fakeStore(): CloudStore {
  const key = 'atlas-board:fake-cloud';
  const read = (): Record<string, { token: string; name: string; data: string }> => JSON.parse(localStorage.getItem(key) || '{}');
  return {
    async save(id, token, name, data) {
      const all = read();
      if (id && all[id]?.token !== token) throw new Error('Este mapa não existe mais na nuvem.');
      const out = id ?? crypto.randomUUID();
      all[out] = { token, name, data };
      localStorage.setItem(key, JSON.stringify(all));
      return out;
    },
    async load(id, token) {
      const m = read()[id];
      return m && m.token === token ? { name: m.name, data: m.data } : null;
    },
  };
}

export function newCloudToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function cloudLink(m: Pick<CloudMap, 'id' | 'token'>) {
  return `${location.origin}${location.pathname}?${CLOUD_QUERY}=${m.id}#${m.token}`;
}

/** Lê id e chave do endereço atual (?mapa=id#chave), se houver. */
export function cloudRefFromUrl(url: URL = new URL(location.href)): { id: string; token: string } | null {
  const id = url.searchParams.get(CLOUD_QUERY);
  const token = url.hash.slice(1);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{24,128}$/i.test(token)) return null;
  return { id, token };
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

export function listCloudMaps(): CloudMap[] {
  const list = safeRead<CloudMap[]>(LIST_KEY, []);
  return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string' && typeof m.token === 'string') : [];
}

function remember(m: CloudMap) {
  safeWrite(LIST_KEY, [m, ...listCloudMaps().filter((x) => x.id !== m.id)].slice(0, 50));
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
export async function saveToCloud(doc: MapDocument, asNew = false): Promise<CloudMap> {
  const data = docToJson(doc);
  if (data.length > CLOUD_MAX_CHARS) throw new Error('O mapa passou do limite de 8 MB da nuvem. Use imagens menores.');
  const s = await getStore();
  const cur = asNew ? null : currentCloudMap();
  const token = cur?.token ?? newCloudToken();
  const name = doc.options.name || 'Mapa';
  const id = await s.save(cur?.id ?? null, token, name, data);
  const m: CloudMap = { id, token, name, savedAt: new Date().toISOString() };
  remember(m);
  setCurrentCloudMap(id);
  return m;
}

/** Abre um mapa da nuvem e passa a tratá-lo como o mapa atual. */
export async function loadFromCloud(id: string, token: string): Promise<MapDocument> {
  const s = await getStore();
  const row = await s.load(id, token);
  if (!row) throw new Error('Mapa não encontrado na nuvem. Confira o link.');
  const doc = parseMap(row.data);
  remember({ id, token, name: row.name, savedAt: listCloudMaps().find((m) => m.id === id)?.savedAt ?? new Date().toISOString() });
  setCurrentCloudMap(id);
  return doc;
}
