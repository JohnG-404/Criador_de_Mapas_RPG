import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toBeVisible();
});

test('mostra o mapa enquadrado e o rótulo de zoom', async ({ page }) => {
  await expect(page.getByTestId('zoom-label')).toHaveText(/\d+%/);
});

test('botões de zoom alteram o zoom', async ({ page }) => {
  const label = page.getByTestId('zoom-label');
  const before = parseInt((await label.textContent())!);
  await page.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect.poll(async () => parseInt((await label.textContent())!)).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Enquadrar' }).click();
  await expect(label).toHaveText(`${before}%`);
});

test('roda do mouse faz zoom e o hover mostra a célula', async ({ page }) => {
  const canvas = page.locator('canvas[data-testid="map-canvas"]');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await expect(page.getByTestId('hover-cell')).toHaveText(/Célula \d+, \d+/);
  const label = page.getByTestId('zoom-label');
  const before = parseInt((await label.textContent())!);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => parseInt((await label.textContent())!)).toBeGreaterThan(before);
});

test('arrastar move o mapa', async ({ page }) => {
  const canvas = page.locator('canvas[data-testid="map-canvas"]');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  const before = await page.getByTestId('hover-cell').textContent();
  await page.mouse.down();
  await page.mouse.move(cx + 200, cy + 120, { steps: 5 });
  await page.mouse.up();
  await page.mouse.move(cx, cy);
  await expect(page.getByTestId('hover-cell')).not.toHaveText(before!);
});
