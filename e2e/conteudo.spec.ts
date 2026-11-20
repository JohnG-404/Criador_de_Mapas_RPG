import { expect, test, type Page } from '@playwright/test';

type Pt = { x: number; y: number };

/** Converte um ponto do mundo (pixels do mapa) para coordenadas da página. */
async function toPage(page: Page, world: Pt): Promise<Pt> {
  const box = (await page.locator('canvas[data-testid="map-canvas"]').boundingBox())!;
  const s = await page.evaluate((w) => {
    const atlas = (window as unknown as { atlas: { view: { camera: { worldToScreen(p: Pt): Pt } } } }).atlas;
    return atlas.view.camera.worldToScreen(w);
  }, world);
  return { x: box.x + s.x, y: box.y + s.y };
}

/** Canto superior esquerdo da célula (col, row), no grid quadrado de 32 px. */
const corner = (col: number, row: number): Pt => ({ x: col * 32, y: row * 32 });

async function ready(page: Page) {
  const canvas = page.locator('canvas[data-testid="map-canvas"]');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  // Aproxima para as células ficarem grandes na tela.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Aumentar zoom' }).click();
}

async function drag(page: Page, a: Pt, b: Pt, modifiers: string[] = []) {
  const pa = await toPage(page, a);
  const pb = await toPage(page, b);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 6 });
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

async function click(page: Page, w: Pt, modifiers: string[] = []) {
  const p = await toPage(page, w);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
}

const counts = (page: Page) => page.getByTestId('content-counts');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await ready(page);
});

test('parede, sala com Shift, porta e Alt+clique para apagar', async ({ page }) => {
  await page.keyboard.press('w');
  await drag(page, corner(28, 18), corner(32, 18));
  await expect(counts(page)).toContainText('1 parede ·');

  await drag(page, corner(26, 20), corner(31, 24), ['Shift']);
  await expect(counts(page)).toContainText('5 paredes');

  // Porta no meio da parede de cima da sala: a parede vira duas partes + a porta.
  await page.keyboard.press('d');
  await click(page, { x: 28.5 * 32, y: 20 * 32 });
  await expect(counts(page)).toContainText('7 paredes');

  // Alt+clique apaga a porta.
  await click(page, { x: 28.5 * 32, y: 20 * 32 }, ['Alt']);
  await expect(counts(page)).toContainText('6 paredes');

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(counts(page)).toContainText('5 paredes');
});

test('objetos: colocar, selecionar, girar, mover e apagar', async ({ page }) => {
  await page.keyboard.press('o');
  await page.getByRole('radio', { name: 'Baú', exact: true }).click();
  await click(page, { x: 30 * 32, y: 20 * 32 });
  await expect(counts(page)).toContainText('1 objeto');

  await page.keyboard.press('v');
  await click(page, { x: 30 * 32, y: 20 * 32 });
  const panel = page.getByTestId('selection-panel');
  await expect(panel).toContainText('Baú');
  await page.keyboard.press('r');
  await expect(panel).toContainText('15°');

  await drag(page, { x: 30 * 32, y: 20 * 32 }, { x: 34 * 32, y: 22 * 32 });
  const pos = await page.evaluate(() => {
    const { editor } = (window as unknown as { atlas: { editor: { selectedObject(): { x: number; y: number } } } }).atlas;
    return editor.selectedObject();
  });
  expect(pos).toMatchObject({ x: 34 * 32, y: 22 * 32 });

  await page.keyboard.press('Delete');
  await expect(counts(page)).toContainText('0 objetos');
  await page.keyboard.press('Control+z');
  await expect(counts(page)).toContainText('1 objeto');
});

test('tokens: colocar e renomear', async ({ page }) => {
  await page.keyboard.press('t');
  await click(page, { x: 25.5 * 32, y: 15.5 * 32 });
  await click(page, { x: 27.5 * 32, y: 15.5 * 32 });
  await expect(counts(page)).toContainText('2 tokens');

  await page.keyboard.press('v');
  await click(page, { x: 25.5 * 32, y: 15.5 * 32 });
  const name = page.locator('#token-name');
  await expect(name).toHaveValue('A');
  await name.fill('Guerreira');
  await name.press('Enter');
  const token = await page.evaluate(() => {
    const { editor } = (window as unknown as { atlas: { editor: { selectedToken(): { name: string } } } }).atlas;
    return editor.selectedToken();
  });
  expect(token?.name).toBe('Guerreira');
});

test('camada travada não aceita edição e camada oculta some', async ({ page }) => {
  await page.getByRole('button', { name: 'Travar Paredes e portas' }).click();
  await page.keyboard.press('w');
  await drag(page, corner(28, 18), corner(32, 18));
  await expect(counts(page)).toContainText('0 paredes');
  await page.getByRole('button', { name: 'Destravar Paredes e portas' }).click();
  await drag(page, corner(28, 18), corner(32, 18));
  await expect(counts(page)).toContainText('1 parede ·');
  await page.getByRole('button', { name: 'Ocultar Paredes e portas' }).click();
  await expect(page.getByRole('button', { name: 'Mostrar Paredes e portas' })).toBeVisible();
});
