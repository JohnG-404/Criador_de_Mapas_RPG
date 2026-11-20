import type { RoomMessage } from './protocol';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/** Canal de uma sala: manda e recebe mensagens e conta quem está presente. */
export interface RoomChannel {
  send(m: RoomMessage): void;
  onMessage(fn: (m: RoomMessage) => void): void;
  /** Avisado com o número de pessoas na sala (sem contar quem chama). */
  onPeers(fn: (n: number) => void): void;
  onStatus(fn: (s: 'connecting' | 'online' | 'error') => void): void;
  close(): void;
}

type FakeWindow = { __atlasFakeRealtime?: boolean };

/**
 * Abre o canal da sala. Nos testes (window.__atlasFakeRealtime) usa um
 * BroadcastChannel do navegador no lugar do Supabase.
 */
export async function openRoomChannel(code: string, role: 'gm' | 'player'): Promise<RoomChannel> {
  if ((window as unknown as FakeWindow).__atlasFakeRealtime) return fakeChannel(code, role);
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const me = `${role}-${Math.random().toString(36).slice(2, 10)}`;
  const ch = client.channel(`atlas-room-${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: me } } });
  let onMsg: (m: RoomMessage) => void = () => {};
  let onPeers: (n: number) => void = () => {};
  let onStatus: (s: 'connecting' | 'online' | 'error') => void = () => {};
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload as RoomMessage));
  ch.on('presence', { event: 'sync' }, () => onPeers(Math.max(0, Object.keys(ch.presenceState()).length - 1)));
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void ch.track({ role });
      onStatus('online');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('error');
  });
  return {
    send: (m) => { void ch.send({ type: 'broadcast', event: 'm', payload: m }); },
    onMessage: (fn) => { onMsg = fn; },
    onPeers: (fn) => { onPeers = fn; },
    onStatus: (fn) => { onStatus = fn; fn('connecting'); },
    close: () => { void client.removeChannel(ch); },
  };
}

function fakeChannel(code: string, role: 'gm' | 'player'): RoomChannel {
  const bc = new BroadcastChannel(`atlas-fake-room-${code}`);
  const id = Math.random().toString(36).slice(2);
  const peers = new Map<string, number>();
  let onMsg: (m: RoomMessage) => void = () => {};
  let onPeers: (n: number) => void = () => {};
  const ping = () => bc.postMessage({ kind: 'presence', id, role });
  bc.onmessage = (e) => {
    const d = e.data;
    if (d?.kind === 'presence') {
      const known = peers.has(d.id);
      peers.set(d.id, Date.now());
      onPeers(peers.size);
      if (!known) ping();
    } else if (d?.kind === 'bye') {
      peers.delete(d.id);
      onPeers(peers.size);
    } else if (d?.kind === 'm') onMsg(d.m);
  };
  setTimeout(ping, 0);
  return {
    send: (m) => bc.postMessage({ kind: 'm', m }),
    onMessage: (fn) => { onMsg = fn; },
    onPeers: (fn) => { onPeers = fn; },
    onStatus: (fn) => setTimeout(() => fn('online'), 0),
    close: () => { bc.postMessage({ kind: 'bye', id }); bc.close(); },
  };
}
