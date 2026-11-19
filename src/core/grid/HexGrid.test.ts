import { describe, expect, it } from 'vitest';
import { HexGrid } from './HexGrid';

describe('HexGrid', () => {
  const grid = new HexGrid(30, 20, 40);

  it('converte célula → mundo → célula para todas as células', () => {
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        expect(grid.worldToCell(grid.cellToWorld({ col, row }))).toEqual({ col, row });
      }
    }
  });

  it('pontos perto do vértice caem na célula certa', () => {
    const cell = { col: 5, row: 3 };
    const c = grid.cellToWorld(cell);
    for (const p of grid.cellPolygon(cell)) {
      // 80% do caminho do centro ao vértice ainda está dentro
      expect(grid.worldToCell({ x: c.x + (p.x - c.x) * 0.8, y: c.y + (p.y - c.y) * 0.8 })).toEqual(cell);
    }
  });

  it('linhas ímpares ficam deslocadas meia célula', () => {
    expect(grid.cellToWorld({ col: 0, row: 1 }).x - grid.cellToWorld({ col: 0, row: 0 }).x).toBeCloseTo(20);
  });

  it('tem 6 vizinhos no meio e todos a distância 1', () => {
    for (const cell of [{ col: 5, row: 4 }, { col: 5, row: 5 }]) {
      const n = grid.neighbors(cell);
      expect(n).toHaveLength(6);
      for (const c of n) expect(grid.distance(cell, c)).toBe(1);
    }
  });

  it('vizinhos param nas bordas', () => {
    expect(grid.neighbors({ col: 0, row: 0 }).length).toBeLessThan(6);
  });

  it('pincel de raio 1 tem 7 células e raio 2 tem 19', () => {
    expect(grid.cellsInRadius({ col: 10, row: 10 }, 1)).toHaveLength(7);
    expect(grid.cellsInRadius({ col: 10, row: 11 }, 2)).toHaveLength(19);
  });

  it('o intervalo visível contém as células do retângulo', () => {
    const rect = { x: 200, y: 150, width: 300, height: 200 };
    const range = grid.cellRangeInRect(rect)!;
    for (let x = rect.x; x < rect.x + rect.width; x += 17) {
      for (let y = rect.y; y < rect.y + rect.height; y += 13) {
        const c = grid.worldToCell({ x, y });
        if (!c) continue;
        expect(c.col).toBeGreaterThanOrEqual(range.minCol);
        expect(c.col).toBeLessThanOrEqual(range.maxCol);
        expect(c.row).toBeGreaterThanOrEqual(range.minRow);
        expect(c.row).toBeLessThanOrEqual(range.maxRow);
      }
    }
  });

  it('fora do mapa retorna null', () => {
    expect(grid.worldToCell({ x: -30, y: -30 })).toBeNull();
  });
});
