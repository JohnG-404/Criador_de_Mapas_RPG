import { expect, test, type Page } from '@playwright/test';

async function canvasBox(page: Page) {
  const canvas = page.locator('canvas[data-testid="map-canvas"]');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return (await canvas.boundingBox())!;
}

async function terrainAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  return (await page.getByTestId('hover-cell').textContent())!.split('·').pop()!.trim();
}

/** Ponto do mundo (pixels do mapa) em coordenadas da página. */
async function mapPoint(page: Page, x: number, y: number) {
  const box = await canvasBox(page);
  const s = await page.evaluate((w) => {
    const atlas = (window as unknown as { atlas: { view: { camera: { worldToScreen(p: { x: number; y: number }): { x: number; y: number } } } } }).atlas;
    return atlas.view.camera.worldToScreen(w);
  }, { x, y });
  return { x: box.x + s.x, y: box.y + s.y };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('abre com o mapa enquadrado e o rótulo de zoom', async ({ page }) => {
  await canvasBox(page);
  await expect(page.getByTestId('zoom-label')).toHaveText(/\d+%/);
  await expect(page.getByTestId('map-info')).toContainText('60×40');
});

test('botões de zoom e roda do mouse alteram o zoom', async ({ page }) => {
  const box = await canvasBox(page);
  const label = page.getByTestId('zoom-label');
  const before = parseInt((await label.textContent())!);
  await page.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect.poll(async () => parseInt((await label.textContent())!)).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Enquadrar' }).click();
  await expect(label).toHaveText(`${before}%`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => parseInt((await label.textContent())!)).toBeGreaterThan(before);
});

test('botão direito arrasta o mapa', async ({ page }) => {
  const box = await canvasBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  const before = await page.getByTestId('hover-cell').textContent();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx + 200, cy + 120, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await page.mouse.move(cx, cy);
  await expect(page.getByTestId('hover-cell')).not.toHaveText(before!);
});

test('pincel pinta, desfazer e refazer funcionam', async ({ page }) => {
  const box = await canvasBox(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  expect(await terrainAt(page, x, y)).toBe('Grama');
  await page.keyboard.press('3'); // água
  await page.mouse.move(x - 40, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 6 });
  await page.mouse.up();
  expect(await terrainAt(page, x, y)).toBe('Água');
  await page.getByRole('button', { name: 'Desfazer' }).click();
  expect(await terrainAt(page, x, y)).toBe('Grama');
  await page.keyboard.press('Control+Shift+Z');
  expect(await terrainAt(page, x, y)).toBe('Água');
});

test('borracha deixa vazio e balde preenche', async ({ page }) => {
  const box = await canvasBox(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.keyboard.press('e');
  await page.mouse.click(x, y);
  expect(await terrainAt(page, x, y)).toBe('Vazio');
  await page.keyboard.press('g');
  await page.keyboard.press('4');
  const a = await mapPoint(page, 30, 30);
  const b = await mapPoint(page, 1920 - 30, 1280 - 30);
  await page.mouse.click(a.x, a.y);
  expect(await terrainAt(page, b.x, b.y)).toBe('Piso de pedra');
  expect(await terrainAt(page, x, y)).toBe('Vazio');
});

test('cria um mapa hexagonal e pinta nele', async ({ page }) => {
  const box = await canvasBox(page);
  await page.getByRole('button', { name: 'Novo mapa' }).click();
  await page.getByLabel('Hexagonal').check();
  await page.getByLabel('Largura (células)').fill('30');
  await page.getByLabel('Altura (células)').fill('20');
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(page.getByTestId('map-info')).toContainText('30×20 · grid hexagonal');
  await expect(page.getByRole('button', { name: 'Desfazer' })).toBeDisabled();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.keyboard.press('2');
  await page.mouse.click(x, y);
  expect(await terrainAt(page, x, y)).toBe('Terra');
});
