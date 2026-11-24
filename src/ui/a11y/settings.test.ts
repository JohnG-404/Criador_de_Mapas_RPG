import { describe, expect, it } from 'vitest';
import { DEFAULT_A11Y, daltonizeMatrix, feColorMatrixValues, sanitizeA11y } from './settings';

describe('configurações de acessibilidade', () => {
  it('usa o padrão quando não há nada salvo ou o valor é inválido', () => {
    expect(sanitizeA11y(null)).toEqual(DEFAULT_A11Y);
    expect(sanitizeA11y({ font: 'comic', contrast: 42, uiScale: 'x' })).toEqual(DEFAULT_A11Y);
  });

  it('mantém valores válidos e limita a escala', () => {
    const s = sanitizeA11y({ font: 'legivel', contrast: 'alto', colorVision: 'tritanopia', uiScale: 9, letterShortcuts: false });
    expect(s.font).toBe('legivel');
    expect(s.contrast).toBe('alto');
    expect(s.colorVision).toBe('tritanopia');
    expect(s.uiScale).toBe(1.5);
    expect(s.letterShortcuts).toBe(false);
    expect(s.dimOutsideSelection).toBe(true);
    expect(sanitizeA11y({ dimOutsideSelection: false }).dimOutsideSelection).toBe(false);
    expect(sanitizeA11y({ uiScale: 0.1 }).uiScale).toBe(0.85);
  });
});

describe('filtro para daltonismo', () => {
  const apply = (m: number[], rgb: number[]) => [0, 1, 2].map((r) => m[r * 3] * rgb[0] + m[r * 3 + 1] * rgb[1] + m[r * 3 + 2] * rgb[2]);

  it('não altera cinzas (preto, branco e tons neutros)', () => {
    for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const m = daltonizeMatrix(kind);
      for (const g of [0, 0.5, 1]) {
        apply(m, [g, g, g]).forEach((v) => expect(v).toBeCloseTo(g, 2));
      }
    }
  });

  it('afasta vermelho de verde para protanopia', () => {
    const m = daltonizeMatrix('protanopia');
    const red = apply(m, [1, 0, 0]);
    const green = apply(m, [0, 1, 0]);
    // O vermelho ganha azul, que a pessoa enxerga; o verde não.
    expect(red[2]).toBeGreaterThan(green[2] + 0.3);
  });

  it('gera 20 valores para feColorMatrix', () => {
    expect(feColorMatrixValues(daltonizeMatrix('deuteranopia')).split(' ')).toHaveLength(20);
  });
});
