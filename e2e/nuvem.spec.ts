import { expect, test } from '@playwright/test';

type Win = { atlas: { editor: { setTool(t: string): void; pointerDown(p: { x: number; y: number }): void; pointerUp(): void; doc: { tokens: { size: number } } } } };

test('nuvem: salva o mapa, abre pelo link em outra aba e atualiza', async ({ context }) => {
  // Sem acesso ao Supabase nos testes: a nuvem é simulada no localStorage.
  await context.addInitScript(() => { (window as unknown as { __atlasFakeCloud: boolean }).__atlasFakeCloud = true; });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await page.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.setTool('token');
    editor.pointerDown({ x: 100, y: 100 }); editor.pointerUp();
  });

  await page.getByRole('button', { name: 'Nuvem' }).click();
  await expect(page.getByText('Este mapa ainda não está na nuvem.')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar na nuvem' }).click();
  const link = await page.getByTestId('cloud-link').inputValue();
  expect(link).toMatch(/\?mapa=[0-9a-f-]{36}#[0-9a-f]{48}$/);
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Outra aba, mapa novo vazio, abre pelo link.
  const other = await context.newPage();
  await other.addInitScript(() => localStorage.removeItem('atlas-board:autosave'));
  await other.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(other.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect(other.getByText(/Aberto da nuvem/)).toBeVisible();
  expect(new URL(other.url()).search).toBe('');
  expect(await other.evaluate(() => (window as unknown as Win).atlas.editor.doc.tokens.size)).toBe(1);

  // Edita na outra aba e atualiza: o mesmo link passa a ter 2 tokens.
  await other.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.setTool('token');
    editor.pointerDown({ x: 200, y: 200 }); editor.pointerUp();
  });
  await other.getByRole('button', { name: 'Nuvem' }).click();
  await other.getByRole('button', { name: 'Atualizar na nuvem' }).click();
  await expect(other.getByText('Mapa salvo na nuvem')).toBeVisible();
  expect(await other.getByTestId('cloud-link').inputValue()).toBe(link);

  const third = await context.newPage();
  await third.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(third.getByText(/Aberto da nuvem/)).toBeVisible({ timeout: 20_000 });
  expect(await third.evaluate(() => (window as unknown as Win).atlas.editor.doc.tokens.size)).toBe(2);
});
