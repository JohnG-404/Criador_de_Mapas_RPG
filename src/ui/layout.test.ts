import { describe, expect, it } from 'vitest';
import { layoutFor } from './layout';

describe('layoutFor', () => {
  it('classifica a largura da janela', () => {
    expect(layoutFor(390)).toBe('phone');
    expect(layoutFor(820)).toBe('compact');
    expect(layoutFor(1280)).toBe('medium');
    expect(layoutFor(1920)).toBe('wide');
  });

  it('considera o tamanho de interface da acessibilidade', () => {
    expect(layoutFor(1366, 1)).toBe('medium');
    expect(layoutFor(1366, 1.3)).toBe('compact');
    expect(layoutFor(1600, 1.15)).toBe('medium');
    expect(layoutFor(900, 1.25)).toBe('phone');
  });

  it('ignora escala inválida', () => {
    expect(layoutFor(1920, 0)).toBe('wide');
    expect(layoutFor(1920, Number.NaN)).toBe('wide');
  });
});
