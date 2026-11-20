import type { MapFile } from '../core/doc/serialize';
import type { Editor } from '../editor/Editor';
import type { ViewRect } from '../editor/playerSync';
import { ChunkAssembler, forPlayers, toChunks, type RoomMessage } from './protocol';
import { openRoomChannel, type RoomChannel } from './transport';

const SEND_DELAY_MS = 400;

export interface HostedRoom {
  code: string;
  showView(rect: ViewRect): void;
  stop(): void;
}

/** Mestre: abre a sala e manda o mapa (sem notas) a cada edição e para quem entra. */
export async function hostRoom(
  editor: Editor,
  code: string,
  events: { onPeers?: (n: number) => void; onStatus?: (s: 'connecting' | 'online' | 'error') => void } = {},
): Promise<HostedRoom> {
  const ch: RoomChannel = await openRoomChannel(code, 'gm');
  let version = Date.now();
  let timer = 0;
  let lastView: ViewRect | null = null;
  const send = () => {
    timer = 0;
    version += 1;
    for (const m of toChunks(JSON.stringify(forPlayers(editor.doc)), version)) ch.send(m);
    if (lastView) ch.send({ type: 'view', rect: lastView });
  };
  const schedule = () => { if (!timer) timer = window.setTimeout(send, SEND_DELAY_MS); };
  ch.onMessage((m) => { if (m?.type === 'hello') schedule(); });
  ch.onPeers((n) => events.onPeers?.(n));
  ch.onStatus((s) => { events.onStatus?.(s); if (s === 'online') schedule(); });
  const offHistory = editor.history.onChange(schedule);
  let docVersion = editor.getState().docVersion;
  const offState = editor.subscribe(() => {
    const v = editor.getState().docVersion;
    if (v !== docVersion) { docVersion = v; schedule(); }
  });
  return {
    code,
    showView: (rect) => { lastView = rect; ch.send({ type: 'view', rect }); },
    stop: () => { offHistory(); offState(); window.clearTimeout(timer); ch.close(); },
  };
}

/** Jogador: entra na sala e recebe o mapa e o enquadramento do mestre. */
export function joinRoom(
  code: string,
  onMap: (map: MapFile) => void,
  onView: (rect: ViewRect) => void,
  onStatus?: (s: 'connecting' | 'online' | 'error') => void,
): () => void {
  let ch: RoomChannel | null = null;
  let closed = false;
  const asm = new ChunkAssembler();
  void openRoomChannel(code, 'player').then((c) => {
    if (closed) { c.close(); return; }
    ch = c;
    c.onMessage((m: RoomMessage) => {
      if (m?.type === 'chunk') {
        const json = asm.push(m);
        if (json) { try { onMap(JSON.parse(json)); } catch { /* mapa inválido: ignora */ } }
      } else if (m?.type === 'view' && m.rect) onView(m.rect);
    });
    c.onStatus((s) => { onStatus?.(s); if (s === 'online') c.send({ type: 'hello' }); });
    // Quando o mestre entra depois do jogador, a presença avisa e pedimos o mapa de novo.
    c.onPeers(() => c.send({ type: 'hello' }));
  }).catch(() => onStatus?.('error'));
  return () => { closed = true; ch?.close(); };
}
