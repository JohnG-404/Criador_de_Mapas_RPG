import { expect, test, type Page } from '@playwright/test';

type Win = {
  atlas: {
    editor: { doc: { elevation: { get(c: number, r: number): number }; tokens: { all(): Array<{ name: string; template?: string; sheet?: { hp: number } }> } } };
    view: { camera: { worldToScreen(p: { x: number; y: number }): { x: number; y: number } } };
  };
};

async function ready(page: Page) {
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

async function screenOf(page: Page, col: number, row: number) {
  const box = (await page.locator('canvas[data-testid="map-canvas"]').boundingBox())!;
  const p = await page.evaluate(([c, r]) => (window as unknown as Win).atlas.view.camera.worldToScreen({ x: c * 32 + 16, y: r * 32 + 16 }), [col, row]);
  return { x: box.x + p.x, y: box.y + p.y };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await ready(page);
});

test('relevo: subir com o mouse, Alt baixa e desfazer', async ({ page }) => {
  await page.keyboard.press('l');
  await expect(page.getByRole('radio', { name: 'Subir' })).toHaveAttribute('aria-checked', 'true');
  const level = (c: number, r: number) => page.evaluate(([c, r]) => (window as unknown as Win).atlas.editor.doc.elevation.get(c, r) - 64, [c, r]);
  const a = await screenOf(page, 20, 20);
  await page.mouse.click(a.x, a.y);
  expect(await level(20, 20)).toBe(4);
  await page.keyboard.down('Alt');
  const b = await screenOf(page, 40, 20);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Alt');
  expect(await level(40, 20)).toBe(-4);
  await expect(page.getByTestId('hover-cell')).toContainText('altura -4');
  await page.keyboard.press('Control+z');
  expect(await level(40, 20)).toBe(0);
  await page.getByRole('button', { name: 'Aplainar tudo' }).click();
  expect(await level(20, 20)).toBe(0);
});

test('modelos de token: escolher, colocar e usar a ficha', async ({ page }) => {
  await page.keyboard.press('t');
  await page.getByRole('radio', { name: 'Horror' }).click();
  await page.getByRole('radiogroup', { name: 'Inimigos' }).getByRole('radio', { name: 'Possuído' }).click();
  const p = await screenOf(page, 10, 10);
  await page.mouse.click(p.x, p.y);
  const sheet = page.getByTestId('token-sheet');
  await expect(sheet).toContainText('Possuído');
  await expect(page.locator('#sheet-hp')).toHaveValue('30');
  await expect(page.locator('#sheet-def')).toHaveValue('13');
  await page.getByRole('spinbutton', { name: 'Quantidade' }).fill('12');
  await page.getByRole('button', { name: 'Dano' }).click();
  await expect(page.locator('#sheet-hp')).toHaveValue('18');

  await page.keyboard.press('t');
  await page.getByRole('radiogroup', { name: 'Personagens' }).getByRole('radio', { name: 'Ocultista' }).click();
  const q = await screenOf(page, 14, 10);
  await page.mouse.click(q.x, q.y);
  await expect(page.locator('#sheet-san')).toHaveValue('24');

  const tokens = await page.evaluate(() => (window as unknown as Win).atlas.editor.doc.tokens.all());
  expect(tokens.map((t) => [t.name, t.template, t.sheet?.hp])).toEqual([['Possuído', 'possuido', 18], ['Ocultista', 'ocultista', 16]]);
});
