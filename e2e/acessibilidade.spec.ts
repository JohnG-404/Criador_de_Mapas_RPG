import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
});

test('configurações de acessibilidade valem na hora e ficam salvas', async ({ page }) => {
  await page.getByRole('button', { name: 'Acessibilidade' }).click();
  const dialog = page.getByRole('dialog', { name: 'Acessibilidade' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('checkbox', { name: 'Alto contraste' }).check({ force: true });
  await dialog.getByRole('radio', { name: /Alta legibilidade/ }).check({ force: true });
  await dialog.getByRole('radio', { name: /Protanopia/ }).check({ force: true });
  await dialog.getByRole('slider', { name: /Tamanho da interface/ }).fill('3');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-contrast', 'alto');
  await expect(html).toHaveAttribute('data-font', 'legivel');
  await expect(html).toHaveAttribute('data-color-vision', 'protanopia');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.stage')!).filter)).toContain('cv-protanopia');

  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(html).toHaveAttribute('data-contrast', 'alto');
  await expect(html).toHaveAttribute('style', /--ui-scale:\s*1\.3/);

  await page.keyboard.press('Control+Alt+a');
  await page.getByRole('button', { name: 'Restaurar padrão' }).click();
  await expect(html).toHaveAttribute('data-contrast', 'normal');
  await expect(html).toHaveAttribute('data-color-vision', 'normal');
});

test('atalhos de uma tecla podem ser desligados', async ({ page }) => {
  const tool = (name: string) => page.getByRole('radio', { name, exact: true });
  await page.keyboard.press('w');
  await expect(tool('Parede')).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Acessibilidade' }).click();
  await page.getByRole('checkbox', { name: 'Atalhos de uma tecla só' }).uncheck({ force: true });
  await page.keyboard.press('Escape');

  await page.keyboard.press('b');
  await expect(tool('Parede')).toHaveAttribute('aria-checked', 'true');
  const zoom = await page.getByTestId('zoom-label').textContent();
  await page.keyboard.press('+');
  await expect(page.getByTestId('zoom-label')).toHaveText(zoom!);
  // Ctrl continua funcionando.
  await page.keyboard.press('Control+Alt+a');
  await expect(page.getByRole('dialog', { name: 'Acessibilidade' })).toBeVisible();
});
