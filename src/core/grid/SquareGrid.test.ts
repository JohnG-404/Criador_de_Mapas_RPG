import { describe, expect, it } from 'vitest';
import { SquareGrid } from './SquareGrid';

describe('SquareGrid', () => {
  const grid = new SquareGrid(200, 100, 32);

  it('calcula os limites do mundo', () => {
    expect(grid.worldBounds()).toEqual({ x: 0, y: 0, width: 6400, height: 3200 });
  });

  it('converte célula → mundo → célula de volta', () => {
    for (const cell of [{ col: 0, row: 0 }, { col: 199, row: 99 }, { col: 57, row: 13 }]) {
      expect(grid.worldToCell(grid.cellToWorld(cell))).toEqual(cell);
    }
  });

  it('retorna null fora do mapa', () => {
    expect(grid.worldToCell({ x: -1, y: 10 })).toBeNull();
    expect(grid.worldToCell({ x: 10, y: 3200 })).toBeNull();
  });

  it('a borda esquerda/superior pertence à célula', () => {
    expect(grid.worldToCell({ x: 32, y: 64 })).toEqual({ col: 1, row: 2 });
  });

  it('limita o intervalo de células ao mapa', () => {
    expect(grid.cellRangeInRect({ x: -100, y: -100, width: 150, height: 150 })).toEqual({
      minCol: 0, maxCol: 1, minRow: 0, maxRow: 1,
    });
    expect(grid.cellRangeInRect({ x: 7000, y: 0, width: 10, height: 10 })).toBeNull();
  });

  it('rejeita tamanhos inválidos', () => {
    expect(() => new SquareGrid(0, 10, 32)).toThrow();
    expect(() => new SquareGrid(10, 10, 0)).toThrow();
  });
});

describe('SquareGrid: vizinhos e pincel', () => {
  const grid = new SquareGrid(10, 10, 32);
  it('4 vizinhos no meio, 2 no canto', () => {
    expect(grid.neighbors({ col: 5, row: 5 })).toHaveLength(4);
    expect(grid.neighbors({ col: 0, row: 0 })).toHaveLength(2);
  });
  it('pincel: raio 0 = 1 célula, raio 1 = cruz de 5, recorta na borda', () => {
    expect(grid.cellsInRadius({ col: 5, row: 5 }, 0)).toHaveLength(1);
    expect(grid.cellsInRadius({ col: 5, row: 5 }, 1)).toHaveLength(5);
    expect(grid.cellsInRadius({ col: 0, row: 0 }, 1)).toHaveLength(3);
  });
});
