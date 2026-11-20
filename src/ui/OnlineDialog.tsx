import { useEffect, useRef, useState } from 'react';
import { shareBaseUrl } from '../desktop';
import { ROOM_QUERY } from '../editor/playerSync';

interface Props {
  code: string | null;
  peers: number;
  status: 'connecting' | 'online' | 'error' | null;
  onOpen: () => void;
  onStop: () => void;
  onClose: () => void;
}

export function roomLink(code: string) {
  return `${shareBaseUrl()}?${ROOM_QUERY}=${code}`;
}

/** Sala online: os jogadores abrem o link e veem o mapa ao vivo, cada um no seu computador. */
export function OnlineDialog({ code, peers, status, onOpen, onStop, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(roomLink(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="online-title">
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2 id="online-title">Sala online</h2>
        {!code ? (
          <>
            <p className="dialog-text">
              Abra uma sala e mande o link para os jogadores. Cada um vê o mapa no próprio computador ou celular, ao vivo, com a névoa opaca.
              Suas notas e os inimigos escondidos pela névoa não são enviados.
            </p>
            <div className="actions">
              <button type="button" onClick={onClose}>Cancelar</button>
              <button type="button" className="primary" onClick={onOpen}>Abrir sala</button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>Link para os jogadores</span>
              <input className="text-input" readOnly value={roomLink(code)} data-testid="room-link" onFocus={(e) => e.target.select()} />
            </label>
            <p className="dialog-text" role="status" data-testid="room-status">
              {status === 'error'
                ? 'Sem conexão com o servidor da sala. Confira a internet.'
                : status === 'online'
                  ? (peers === 0 ? 'Sala aberta. Nenhum jogador conectado ainda.' : `${peers} ${peers === 1 ? 'jogador conectado' : 'jogadores conectados'}.`)
                  : 'Conectando…'}
            </p>
            <p className="help">"Mostrar esta área" também enquadra a tela dos jogadores online.</p>
            <div className="actions">
              <button type="button" className="danger-text" onClick={onStop}>Encerrar sala</button>
              <button type="button" onClick={() => void copy()}>{copied ? 'Copiado!' : 'Copiar link'}</button>
              <button type="button" className="primary" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
