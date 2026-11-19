import type { MapFile } from '../core/doc/serialize';
import { serializeDoc } from '../core/doc/serialize';
import type { Editor } from './Editor';

const CHANNEL = 'atlas-board:mesa';
const SEND_DELAY_MS = 150;

type Message = { type: 'hello' } | { type: 'map'; map: MapFile };

/**
 * Lado do mestre: manda o mapa para as janelas de jogador abertas no mesmo
 * navegador (outra aba ou outro monitor), a cada edição e quando uma janela nova pede.
 */
export function startPlayerBroadcast(editor: Editor) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  let timer = 0;
  const send = () => {
    timer = 0;
    ch.postMessage({ type: 'map', map: serializeDoc(editor.doc) } satisfies Message);
  };
  const schedule = () => {
    if (!timer) timer = window.setTimeout(send, SEND_DELAY_MS);
  };
  ch.onmessage = (e: MessageEvent<Message>) => { if (e.data?.type === 'hello') send(); };
  const offHistory = editor.history.onChange(schedule);
  let docVersion = editor.getState().docVersion;
  const offState = editor.subscribe(() => {
    const v = editor.getState().docVersion;
    if (v !== docVersion) { docVersion = v; schedule(); }
  });
  return () => {
    offHistory();
    offState();
    window.clearTimeout(timer);
    ch.close();
  };
}

/** Lado do jogador: recebe o mapa do mestre. */
export function listenToGm(onMap: (map: MapFile) => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e: MessageEvent<Message>) => { if (e.data?.type === 'map') onMap(e.data.map); };
  ch.postMessage({ type: 'hello' } satisfies Message);
  return () => ch.close();
}

export const PLAYER_QUERY = 'jogador';
export const isPlayerWindow = () => new URLSearchParams(location.search).has(PLAYER_QUERY);
