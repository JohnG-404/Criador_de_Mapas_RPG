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
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Exportar' }).click();
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

test('gera uma masmorra com semente e desfaz', async ({ page }) => {
  await page.getByRole('button', { name: 'Gerar', exact: true }).click();
  await page.getByLabel('Masmorra').check();
  await page.getByLabel('Semente').fill('dragao');
  await page.getByRole('button', { name: 'Gerar', exact: true }).last().click();
  await expect(page.getByTestId('notice')).toContainText('semente dragao');
  const counts = page.getByTestId('content-counts');
  await expect(counts).not.toContainText('0 paredes');
  const first = await counts.textContent();

  // Mesma semente, mesmo resultado.
  await page.keyboard.press('Control+z');
  await expect(counts).toContainText('0 paredes · 0 objetos');
  await page.getByRole('button', { name: 'Gerar', exact: true }).click();
  await page.getByLabel('Semente').fill('dragao');
  await page.getByRole('button', { name: 'Gerar', exact: true }).last().click();
  await expect(counts).toHaveText(first!);
});

test('exporta para mesa virtual (.dd2vtt) com paredes e imagem', async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = (window as unknown as { atlas: { editor: { generate(k: string, s: number): void } } }).atlas;
    editor.generate('dungeon', 42);
  });
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.getByLabel('Mesa virtual (.dd2vtt)').check();
  const download = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Exportar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('mapa-sem-titulo.dd2vtt');
  const json = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(json.resolution.map_size).toEqual({ x: 60, y: 40 });
  expect(json.resolution.pixels_per_grid).toBe(100);
  expect(json.line_of_sight.length).toBeGreaterThan(10);
  expect(json.portals.length).toBeGreaterThan(0);
  const png = Buffer.from(json.image, 'base64');
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(6000);
});

test('exporta PDF em escala real dividido em folhas', async ({ page }) => {
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.getByLabel('PDF para imprimir').check();
  await expect(page.getByRole('dialog')).toContainText('36 folhas A4');
  const download = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Exportar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('mapa-sem-titulo.pdf');
  const pdf = readFileSync((await file.path())!).toString('latin1');
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf).toContain('/Count 36');
  expect(pdf).toContain('/Filter /DCTDecode');
});

test('importa imagem própria, coloca no mapa e salva junto', async ({ page }, info) => {
  // Gera um PNG transparente de 300×150 com um círculo.
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300; c.height = 150;
    const g = c.getContext('2d')!;
    g.fillStyle = '#8a3';
    g.beginPath(); g.ellipse(150, 75, 140, 70, 0, 0, Math.PI * 2); g.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.keyboard.press('o');
  await page.getByTestId('import-image').setInputFiles({ name: 'Arbusto grande.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  const mine = page.getByRole('radiogroup', { name: 'Minhas imagens' }).getByRole('radio', { name: 'Arbusto grande' });
  await expect(mine).toHaveAttribute('aria-checked', 'true');

  await page.evaluate(() => {
    const { editor } = (window as unknown as { atlas: Atlas }).atlas;
    editor.pointerDown({ x: 320, y: 320 });
    editor.pointerUp();
  });
  await expect(page.getByTestId('content-counts')).toContainText('1 objeto');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salvar' }).click();
  const path = info.outputPath('img.rpgmap');
  await (await download).saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.assets).toHaveLength(1);
  expect(json.assets[0]).toMatchObject({ name: 'Arbusto grande', w: 2, h: 1 });
  expect(json.assets[0].data).toMatch(/^data:image\/(webp|png);base64,/);
  expect(json.objects[0].asset).toBe(json.assets[0].key);

  await page.getByRole('button', { name: 'Novo mapa' }).click();
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(page.getByTestId('content-counts')).toContainText('0 objetos');
  await page.getByTestId('open-file').setInputFiles({ name: 'img.rpgmap', mimeType: 'application/json', buffer: readFileSync(path) });
  await expect(page.getByTestId('content-counts')).toContainText('1 objeto');
});

test('recusa arquivo que não é imagem', async ({ page }) => {
  await page.keyboard.press('o');
  await page.getByTestId('import-image').setInputFiles({ name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(page.getByRole('alert')).toContainText('PNG, WebP ou JPEG');
});
