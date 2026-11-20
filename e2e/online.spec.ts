import { expect, test } from '@playwright/test';

type Win = {
  atlas: {
    editor: {
      setTool(t: string): void;
      pointerDown(p: { x: number; y: number }): void;
      pointerUp(): void;
      setTool(t: string): void;
      doc: { tokens: { size: number }; notes: { size: number } };
    };
  };
};

test('sala online: jogador entra pelo link e recebe o mapa ao vivo, sem as notas', async ({ context }) => {
  // Sem acesso ao Supabase nos testes: o canal da sala usa um BroadcastChannel do navegador.
  await context.addInitScript(() => { (window as unknown as { __atlasFakeRealtime: boolean }).__atlasFakeRealtime = true; });
  const gm = await context.newPage();
  await gm.goto('/');
  await expect(gm.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await gm.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.setTool('token');
    editor.pointerDown({ x: 100, y: 100 }); editor.pointerUp();
    editor.setTool('note');
    editor.pointerDown({ x: 300, y: 300 }); editor.pointerUp();
  });

  await gm.getByRole('button', { name: 'Sala online' }).click();
  await gm.getByRole('button', { name: 'Abrir sala' }).click();
  const link = await gm.getByTestId('room-link').inputValue();
  expect(link).toMatch(/\?sala=[a-z0-9]{12}$/);
  await expect(gm.getByTestId('room-status')).toContainText('Nenhum jogador');

  const player = await context.newPage();
  await player.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(player.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect(player.getByRole('status')).toHaveCount(0, { timeout: 10_000 });
  const count = () => player.evaluate(() => {
    const d = (window as unknown as Win).atlas.editor.doc;
    return [d.tokens.size, d.notes.size];
  });
  await expect.poll(count).toEqual([1, 0]);
  await expect(gm.getByTestId('room-status')).toContainText('1 jogador conectado');

  // Edição do mestre chega ao jogador.
  await gm.getByRole('button', { name: 'Fechar' }).click();
  await gm.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.setTool('token');
    editor.pointerDown({ x: 200, y: 100 }); editor.pointerUp();
  });
  await expect.poll(count).toEqual([2, 0]);
  await expect(gm.getByRole('button', { name: /Sala online · 1/ })).toBeVisible();
});
