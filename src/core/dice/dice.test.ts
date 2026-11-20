import { describe, expect, it } from 'vitest';
import { bonus, describeRoll, isValidExpression, rollExpression, secureRandom } from './dice';

/** Gerador previsível: devolve os valores em sequência. */
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('rollExpression', () => {
  it('soma dados e modificadores', () => {
    const r = rollExpression('2d6 + 3', seq(4, 2));
    expect(r.total).toBe(9);
    expect(r.expressao).toBe('2d6+3');
    expect(describeRoll(r)).toBe('[4, 2] + 3');
  });

  it('mantém os maiores ou menores', () => {
    const r = rollExpression('4d6kh3', seq(1, 5, 3, 6));
    expect(r.total).toBe(14);
    expect(describeRoll(r)).toBe('[(1), 5, 3, 6]');
    expect(rollExpression('2d20kl1', seq(15, 4)).total).toBe(4);
  });

  it('subtrai e entende d%', () => {
    expect(rollExpression('1d8-1d4-2', seq(8, 3)).total).toBe(3);
    expect(rollExpression('d%', seq(42)).termos[0]).toMatchObject({ lados: 100, valores: [42] });
  });

  it('marca crítico e falha num d20', () => {
    expect(rollExpression('d20+5', seq(20)).destaque).toBe('critico');
    expect(rollExpression('d20+5', seq(1)).destaque).toBe('falha');
    expect(rollExpression('2d20kh1', seq(1, 20)).destaque).toBe('critico');
    expect(rollExpression('2d20', seq(20, 20)).destaque).toBeNull();
    expect(rollExpression('d20+d4', seq(20, 1)).destaque).toBeNull();
  });

  it('recusa o que não é rolagem', () => {
    for (const bad of ['', 'abc', '2d', 'd1', '2d6++3', '101d6', '3d6kh4', '5', '1d1001', '1d6+1001', '1+1+1+1+1+1+1+1+1+1+d6']) {
      expect(isValidExpression(bad), bad).toBe(false);
    }
    expect(() => rollExpression('2d6++3')).toThrow('Expressão inválida.');
  });

  it('o gerador fica dentro do intervalo', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(secureRandom(6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

it('bonus com sinal', () => {
  expect([bonus(3), bonus(-1), bonus(0)]).toEqual(['+3', '-1', '']);
});
