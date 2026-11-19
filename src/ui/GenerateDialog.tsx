import { useEffect, useRef, useState } from 'react';
import { GENERATORS, type GeneratorKind } from '../core/procgen';
import { randomSeedText, seedFromText } from '../core/procgen/rng';

interface Props {
  hex: boolean;
  initial: { kind: GeneratorKind; seed: string } | null;
  onGenerate: (kind: GeneratorKind, seedText: string, seed: number) => void;
  onCancel: () => void;
}

/** Escolha do gerador e da semente. O resultado substitui o mapa atual (com desfazer). */
export function GenerateDialog({ hex, initial, onGenerate, onCancel }: Props) {
  const available = GENERATORS.filter((g) => !(hex && g.squareOnly));
  const [kind, setKind] = useState<GeneratorKind>(
    initial && available.some((g) => g.kind === initial.kind) ? initial.kind : available[0].kind,
  );
  const [seed, setSeed] = useState(randomSeedText);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancelEvt = (e: Event) => { e.preventDefault(); onCancel(); };
    d.addEventListener('cancel', onCancelEvt);
    return () => d.removeEventListener('cancel', onCancelEvt);
  }, [onCancel]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="gen-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          const text = seed.trim() || randomSeedText();
          onGenerate(kind, text, seedFromText(text));
        }}
      >
        <h2 id="gen-title">Gerar mapa</h2>
        <p className="warn">Substitui o terreno, as paredes e os objetos do mapa atual. Os tokens ficam. Dá para desfazer com Ctrl+Z.</p>
        <div className="gen-kinds" role="radiogroup" aria-label="Tipo de mapa">
          {GENERATORS.map((g) => {
            const disabled = hex && g.squareOnly;
            return (
              <label key={g.kind} className={`gen-kind${kind === g.kind ? ' active' : ''}${disabled ? ' disabled' : ''}`}>
                <input type="radio" name="gen-kind" checked={kind === g.kind} disabled={disabled} onChange={() => setKind(g.kind)} />
                <strong>{g.name}</strong>
                <span>{disabled ? 'Precisa de grid quadrado.' : g.description}</span>
              </label>
            );
          })}
        </div>
        <label>
          Semente
          <div className="seed-row">
            <input value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={40} aria-label="Semente" />
            <button type="button" onClick={() => setSeed(randomSeedText())}>Sortear</button>
          </div>
          <small>A mesma semente gera sempre o mesmo mapa (no mesmo tamanho).</small>
        </label>
        <div className="actions">
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="primary">Gerar</button>
        </div>
      </form>
    </dialog>
  );
}
