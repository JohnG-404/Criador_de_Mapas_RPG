/** Desenho dos dados em SVG (viewBox 64×64), do rolador de dados do projeto. */
const FORMAS: Record<number, { face: string; arestas: string[]; ty: number; raio?: number }> = {
  4: { face: '32,5 59,55 5,55', arestas: ['M32,5 L32,38', 'M5,55 L32,38', 'M59,55 L32,38'], ty: 50 },
  6: { face: '10,10 54,10 54,54 10,54', arestas: [], ty: 41, raio: 7 },
  8: { face: '32,3 59,32 32,61 5,32', arestas: ['M5,32 L59,32'], ty: 41 },
  10: { face: '32,3 59,29 32,61 5,29', arestas: ['M5,29 L32,40 L59,29', 'M32,40 L32,61'], ty: 36 },
  12: {
    face: '32,5 59.6,25 49,57.5 15,57.5 4.4,25',
    arestas: ['M32,5 L32,19 M59.6,25 L45.3,29.7 M49,57.5 L40.2,45.3 M15,57.5 L23.8,45.3 M4.4,25 L18.7,29.7',
      'M32,19 L45.3,29.7 L40.2,45.3 L23.8,45.3 L18.7,29.7 Z'],
    ty: 40,
  },
  20: {
    face: '32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5',
    arestas: ['M32,16 L48,43 L16,43 Z',
      'M32,16 L32,3 M32,16 L7,17.5 M32,16 L57,17.5 M48,43 L57,17.5 M48,43 L57,46.5 M48,43 L32,61 M16,43 L7,17.5 M16,43 L7,46.5 M16,43 L32,61'],
    ty: 38,
  },
};
FORMAS[100] = FORMAS[10];

export function DiceIcon({ sides, label }: { sides: number; label?: string | number }) {
  const f = FORMAS[sides] ?? FORMAS[20];
  const text = label == null ? null : String(label);
  return (
    <svg viewBox="0 0 64 64" className="dice-icon" aria-hidden="true">
      {f.raio ? <rect className="face" x={10} y={10} width={44} height={44} rx={f.raio} /> : <polygon className="face" points={f.face} />}
      {f.arestas.map((d) => <path key={d} className="aresta" d={d} />)}
      {text && <text x={32} y={f.ty} textAnchor="middle" fontSize={text.length >= 3 ? 15 : text.length === 2 ? 19 : 22}>{text}</text>}
    </svg>
  );
}
