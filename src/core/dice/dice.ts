/**
 * Interpreta e rola expressões de dados: "d20", "2d6+3", "4d6kh3", "2d20kl1-1", "d%".
 * Portado do rolador de dados do projeto (rolador-dados/dados.js), com o mesmo
 * formato de resultado, para o dado 3D (dice3d/dados3d.js) funcionar igual.
 * O sorteio usa o gerador criptográfico do navegador.
 */

export interface DieTerm {
  tipo: 'dado';
  sinal: 1 | -1;
  qtd: number;
  lados: number;
  /** "kh3" / "kl1" ou null. */
  manter: string | null;
  valores: number[];
  mantidos: boolean[];
  subtotal: number;
}
export interface ModTerm { tipo: 'mod'; sinal: 1 | -1; valor: number }
export type RolledTerm = DieTerm | ModTerm;

export interface RollResult {
  expressao: string;
  termos: RolledTerm[];
  total: number;
  /** Um único d20 mantido que deu 20 (crítico) ou 1 (falha). */
  destaque: 'critico' | 'falha' | null;
}

export const MAX_DADOS_POR_TERMO = 100;
export const MAX_DADOS_TOTAL = 200;
export const MAX_LADOS = 1000;
export const MAX_TERMOS = 10;
export const MAX_MODIFICADOR = 1000;

export class DiceError extends Error {}

/** Inteiro uniforme em [1, lados]. */
export function secureRandom(lados: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / lados) * lados;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return (buf[0] % lados) + 1;
  }
}

export function rollExpression(texto: string, rand: (lados: number) => number = secureRandom): RollResult {
  if (typeof texto !== 'string') throw new DiceError('Expressão inválida.');
  const expr = texto.toLowerCase().replace(/\s+/g, '');
  if (!expr) throw new DiceError('Digite uma expressão, ex.: 2d6+3.');
  if (expr.length > 60) throw new DiceError('Expressão longa demais.');

  // Divide em termos mantendo o sinal: "2d6+3-1d4" -> ["2d6", "+3", "-1d4"]
  const pedacos = expr.match(/[+-]?[^+-]+/g);
  if (!pedacos || pedacos.join('') !== expr) throw new DiceError('Expressão inválida.');
  if (pedacos.length > MAX_TERMOS) throw new DiceError(`Use no máximo ${MAX_TERMOS} termos.`);

  const termos: RolledTerm[] = [];
  let total = 0;
  let dadosUsados = 0;

  for (const pedaco of pedacos) {
    const sinal = pedaco.startsWith('-') ? -1 : 1;
    const corpo = pedaco.replace(/^[+-]/, '');

    const dado = corpo.match(/^(\d*)d(\d+|%)(?:(kh|kl)(\d+))?$/);
    if (dado) {
      const qtd = dado[1] === '' ? 1 : parseInt(dado[1], 10);
      const lados = dado[2] === '%' ? 100 : parseInt(dado[2], 10);
      const tipoManter = (dado[3] as 'kh' | 'kl' | undefined) ?? null;
      const manter = tipoManter ? parseInt(dado[4], 10) : qtd;

      if (qtd < 1 || qtd > MAX_DADOS_POR_TERMO) throw new DiceError(`Quantidade de dados deve ser de 1 a ${MAX_DADOS_POR_TERMO}.`);
      if (lados < 2 || lados > MAX_LADOS) throw new DiceError(`O dado deve ter de 2 a ${MAX_LADOS} lados.`);
      if (manter < 1 || manter > qtd) throw new DiceError('Quantidade a manter (kh/kl) inválida.');
      dadosUsados += qtd;
      if (dadosUsados > MAX_DADOS_TOTAL) throw new DiceError(`Máximo de ${MAX_DADOS_TOTAL} dados por rolagem.`);

      const valores = Array.from({ length: qtd }, () => rand(lados));
      const mantidos = valores.map(() => true);
      if (tipoManter) {
        const ordem = valores.map((_, i) => i).sort((a, b) => (tipoManter === 'kh' ? valores[b] - valores[a] : valores[a] - valores[b]));
        mantidos.fill(false);
        ordem.slice(0, manter).forEach((i) => { mantidos[i] = true; });
      }
      const subtotal = valores.reduce((s, v, i) => s + (mantidos[i] ? v : 0), 0);
      total += sinal * subtotal;
      termos.push({ tipo: 'dado', sinal, qtd, lados, manter: tipoManter ? `${tipoManter}${manter}` : null, valores, mantidos, subtotal });
      continue;
    }

    if (/^\d+$/.test(corpo)) {
      const valor = parseInt(corpo, 10);
      if (valor > MAX_MODIFICADOR) throw new DiceError(`Modificador máximo é ${MAX_MODIFICADOR}.`);
      total += sinal * valor;
      termos.push({ tipo: 'mod', sinal, valor });
      continue;
    }

    throw new DiceError(`Não entendi "${pedaco}". Use algo como 2d6+3.`);
  }

  if (!termos.some((t) => t.tipo === 'dado')) throw new DiceError('A expressão precisa de pelo menos um dado.');
  return { expressao: expr, termos, total, destaque: highlight(termos) };
}

/** Crítico/falha: só quando a rolagem é de um único d20 mantido (inclui vantagem/desvantagem). */
export function highlight(termos: RolledTerm[]): RollResult['destaque'] {
  const dados = termos.filter((t): t is DieTerm => t.tipo === 'dado');
  if (dados.length !== 1 || dados[0].lados !== 20) return null;
  const t = dados[0];
  const mantidos = t.valores.filter((_, i) => t.mantidos[i]);
  if (mantidos.length !== 1) return null;
  return mantidos[0] === 20 ? 'critico' : mantidos[0] === 1 ? 'falha' : null;
}

/** Valida sem rolar (para campos de ficha). */
export function isValidExpression(texto: string): boolean {
  try { rollExpression(texto, () => 1); return true; } catch { return false; }
}

/** "1d20 [4, (17)] + 3": descartados entre parênteses. */
export function describeRoll(r: Pick<RollResult, 'termos'>): string {
  return r.termos.map((t, i) => {
    const sign = t.sinal < 0 ? '− ' : i > 0 ? '+ ' : '';
    if (t.tipo === 'mod') return `${sign}${t.valor}`;
    return `${sign}[${t.valores.map((v, j) => (t.mantidos[j] ? String(v) : `(${v})`)).join(', ')}]`;
  }).join(' ');
}

/** Bônus com sinal: 3 → "+3", -1 → "-1", 0 → "". */
export function bonus(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `${n}` : '';
}
