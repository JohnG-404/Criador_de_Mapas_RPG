import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Atlas = {
  editor: {
    doc: { fog: { get(c: number, r: number): number }; tokens: { size: number }; options: { name: string } };
    fogAll(h: boolean): void;
    setTool(t: string): void;
    pointerDown(p: { x: number; y: number }): void;
    pointerUp(): void;
  };
};

async function ready(page: Page) {
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** Coloca um token pelo controlador (o gesto pelo mouse já é testado em conteudo.spec). */
async function addToken(page: Page, x: number, y: number) {
  await page.evaluate(([x, y]) => {
    const { editor } = (window as unknown as { atlas: Atlas }).atlas;
    editor.setTool('token');
    editor.pointerDown({ x, y });
    editor.pointerUp();
  }, [x, y]);
}

test.beforeEach(async ({ page }) => {
  // Força o download comum em vez da janela "Salvar como" do sistema.
  await page.addInitScript(() => { delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker; });
  await page.goto('/');
  await ready(page);
});

test('névoa: cobrir tudo e revelar com o pincel', async ({ page }) => {
  await page.keyboard.press('n');
  await page.getByRole('button', { name: 'Cobrir tudo' }).click();
  const fogAt = (c: number, r: number) =>
    page.evaluate(([c, r]) => (window as unknown as { atlas: Atlas }).atlas.editor.doc.fog.get(c, r), [c, r]);
  expect(await fogAt(30, 20)).toBe(1);
  await page.getByRole('radio', { name: 'Revelar' }).click();
  const box = (await page.locator('canvas[data-testid="map-canvas"]').boundingBox())!;
  const center = await page.evaluate(() => {
    const { view } = (window as unknown as { atlas: { view: { camera: { worldToScreen(p: { x: number; y: number }): { x: number; y: number } } } } }).atlas;
    return view.camera.worldToScreen({ x: 30 * 32 + 16, y: 20 * 32 + 16 });
  });
  await page.mouse.click(box.x + center.x, box.y + center.y);
  expect(await fogAt(30, 20)).toBe(0);
  expect(await fogAt(10, 10)).toBe(1);
});

test('salvar e abrir um arquivo .rpgmap', async ({ page }, info) => {
  await addToken(page, 100, 100);
  await addToken(page, 200, 100);
  await expect(page.getByTestId('content-counts')).toContainText('2 tokens');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salvar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('mapa-sem-titulo.rpgmap');
  const path = info.outputPath('mapa.rpgmap');
  await file.saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.format).toBe('atlas-board-map');
  expect(json.tokens).toHaveLength(2);

  await page.getByRole('button', { name: 'Novo mapa' }).click();
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(page.getByTestId('content-counts')).toContainText('0 tokens');

  await page.getByTestId('open-file').setInputFiles(path);
  await expect(page.getByTestId('content-counts')).toContainText('2 tokens');
  await expect(page.getByTestId('notice')).toContainText('Aberto');
});

test('arquivo inválido mostra erro e mantém o mapa', async ({ page }) => {
  await addToken(page, 100, 100);
  await page.getByTestId('open-file').setInputFiles({ name: 'x.rpgmap', mimeType: 'application/json', buffer: Buffer.from('{"format":"outro"}') });
  await expect(page.getByTestId('notice')).toContainText('não é um mapa');
  await expect(page.getByTestId('content-counts')).toContainText('1 token');
});

test('salvamento automático recupera o mapa ao recarregar', async ({ page }) => {
  await addToken(page, 100, 100);
  await expect(page.getByTestId('content-counts')).toContainText('1 token');
  await page.waitForTimeout(1200);
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('content-counts')).toContainText('1 token');
});

test('exporta PNG do mapa', async ({ page }) => {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar PNG' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('mapa-sem-titulo.png');
  const buf = readFileSync((await file.path())!);
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  // 60×40 células de 32 px em escala 2 = 3840×2560
  expect(buf.readUInt32BE(16)).toBe(3840);
  expect(buf.readUInt32BE(20)).toBe(2560);
});

test('janela dos jogadores recebe o mapa e as edições', async ({ page }) => {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Janela dos jogadores' }).click();
  const player = await popup;
  await ready(player);
  const playerTokens = () => player.evaluate(() => (window as unknown as { atlas: Atlas }).atlas.editor.doc.tokens.size);
  await expect.poll(playerTokens).toBe(0);
  await addToken(page, 100, 100);
  await expect.poll(playerTokens).toBe(1);
  await expect(player.getByRole('status')).toHaveCount(0);
  // A janela do jogador não tem painel de ferramentas.
  await expect(player.getByRole('radiogroup', { name: 'Ferramenta' })).toHaveCount(0);
});
