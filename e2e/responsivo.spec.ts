import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, uiScale = 1) {
  await page.addInitScript((s) => localStorage.setItem('atlas-board:acessibilidade', JSON.stringify({ uiScale: s })), uiScale);
  await page.goto('/');
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** Nenhum nome de terreno vaza do botão e nenhum atalho fica em cima do texto. */
async function terrainLabelsFit(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.terrains[aria-label="Terreno"] button')].filter((b) => {
      const name = b.querySelector<HTMLElement>('.terrain-name')!;
      const kbd = b.querySelector<HTMLElement>('kbd');
      const nr = name.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const overflow = name.scrollWidth > name.clientWidth + 1 || nr.right > br.right + 0.5;
      const overlap = kbd ? kbd.getBoundingClientRect().right > nr.left + 0.5 : false;
      return overflow || overlap;
    }).map((b) => b.textContent),
  );
}

for (const [w, h] of [[1280, 720], [1920, 1080], [820, 1180]] as const) {
  test(`paleta de terrenos legível em ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    expect(await terrainLabelsFit(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
  });
}

test('tamanho de interface 130% troca para o layout compacto sem rolagem lateral', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page, 1.3);
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'compact');
  expect(await terrainLabelsFit(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);
  // Os botões só com ícone continuam com nome acessível.
  await expect(page.getByRole('button', { name: 'Janela dos jogadores' })).toBeVisible();
});

test('celular: barra e painel cabem na largura da tela', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('radio', { name: 'Água' }).click();
  await expect(page.getByRole('radio', { name: 'Água' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Mesa' }).click();
  await expect(page.getByRole('tab', { name: 'Dados' })).toBeVisible();
});
