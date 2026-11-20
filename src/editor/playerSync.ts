import type { MapFile } from '../core/doc/serialize';
import { serializeDoc } from '../core/doc/serialize';
import type { Editor } from './Editor';
import type { DiceTable } from '../table/DiceTable';

const CHANNEL = 'atlas-board:mesa';
const SEND_DELAY_MS = 150;

export interface ViewRect { x: number; y: number; width: number; height: number }

type Message =
  | { type: 'hello' }
  | { type: 'map'; map: MapFile }
  | { type: 'view'; rect: ViewRect }
  | { type: 'roll'; roll: unknown }
  | { type: 'rolls'; list: unknown };

/**
 * Lado do mestre: manda o mapa para as janelas de jogador abertas no mesmo
 * navegador (outra aba ou outro monitor), a cada edição e quando uma janela nova pede.
 */
export function startPlayerBroadcast(editor: Editor, dice?: DiceTable): { stop: () => void; showView: (rect: ViewRect) => void } {
  if (typeof BroadcastChannel === 'undefined') return { stop: () => {}, showView: () => {} };
  const ch = new BroadcastChannel(CHANNEL);
  let timer = 0;
  const send = () => {
    timer = 0;
    // Os jogadores veem o mapa deles, que pode não ser o aberto no editor.
    ch.postMessage({ type: 'map', map: serializeDoc(editor.playerDoc) } satisfies Message);
  };
  const schedule = () => {
    if (!timer) timer = window.setTimeout(send, SEND_DELAY_MS);
  };
  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.type === 'hello') {
      send();
      if (dice) ch.postMessage({ type: 'rolls', list: dice.log.publicHistory() } satisfies Message);
    } else if (e.data?.type === 'roll') dice?.receive(e.data.roll);
  };
  // Rolagens públicas do mestre aparecem (com o dado 3D) na janela dos jogadores.
  const offDice = dice?.addSender((roll) => ch.postMessage({ type: 'roll', roll } satisfies Message));
  const offChange = editor.onDocChange(schedule);
  return {
    stop: () => {
      offDice?.();
      offChange();
      window.clearTimeout(timer);
      ch.close();
    },
    // Enquadramento: as janelas de jogador passam a mostrar esta área.
    showView: (rect) => ch.postMessage({ type: 'view', rect } satisfies Message),
  };
}

/** Lado do jogador: recebe o mapa do mestre. */
export function listenToGm(onMap: (map: MapFile) => void, onView?: (rect: ViewRect) => void, dice?: DiceTable) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.type === 'map') onMap(e.data.map);
    else if (e.data?.type === 'view' && e.data.rect) onView?.(e.data.rect);
    else if (e.data?.type === 'roll') dice?.receive(e.data.roll);
    else if (e.data?.type === 'rolls') dice?.receiveHistory(e.data.list);
  };
  const offDice = dice?.addSender((roll) => ch.postMessage({ type: 'roll', roll } satisfies Message));
  ch.postMessage({ type: 'hello' } satisfies Message);
  return () => { offDice?.(); ch.close(); };
}

export const PLAYER_QUERY = 'jogador';
export const ROOM_QUERY = 'sala';
export const isPlayerWindow = () => {
  const q = new URLSearchParams(location.search);
  return q.has(PLAYER_QUERY) || q.has(ROOM_QUERY);
};
