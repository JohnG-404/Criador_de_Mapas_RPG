import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Win = {
  atlas: {
    editor: {
      setTokenTemplate(k: string): void;
      pointerDown(p: { x: number; y: number }): void;
      pointerUp(): void;
      selectToken(id: string): void;
      doc: { tokens: { all(): { id: string; template?: string; art?: string }[] } };
    };
  };
};

async function ready(page: Page) {
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** PNG retangular de 300×200 com um rosto simples (o retrato recorta o centro). */
async function portrait(page: Page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300; c.height = 200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3a6ea5'; g.fillRect(0, 0, 300, 200);
    g.fillStyle = '#f1c27d'; g.beginPath(); g.arc(150, 100, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(125, 85, 10, 0, Math.PI * 2); g.arc(175, 85, 10, 0, Math.PI * 2); g.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'Heroína.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    localStorage.setItem('atlas-board:dados-3d', 'desligado');
  });
  await page.goto('/');
  await ready(page);
});

test('token com imagem própria: aparece na iniciativa, vai no arquivo e pode ser tirada', async ({ page }, info) => {
  await page.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.setTokenTemplate('guerreiro');
    editor.pointerDown({ x: 400, y: 300 });
    editor.pointerUp();
    editor.selectToken(editor.doc.tokens.all()[0].id);
  });
  const art = page.getByTestId('token-art');
  await art.getByLabel('Imagem do token').setInputFiles(await portrait(page));
  await expect(art.getByRole('button', { name: 'Trocar imagem…' })).toBeVisible();
  const key = await page.evaluate(() => (window as unknown as Win).atlas.editor.doc.tokens.all()[0].art);
  expect(key).toMatch(/^img-/);

  // A iniciativa mostra o retrato próprio (data URL), não o do modelo.
  await page.getByRole('button', { name: 'Mesa' }).click();
  await page.getByRole('tab', { name: 'Iniciativa' }).click();
  await page.getByRole('button', { name: /Rolar iniciativa/ }).click();
  await expect(page.getByTestId('ini-row').locator('img.token-thumb')).toHaveAttribute('src', /^data:image\/(webp|png)/);
  await page.screenshot({ path: info.outputPath('token-imagem.png') });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salvar' }).click();
  const path = info.outputPath('token.rpgmap');
  await (await download).saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.tokens[0]).toMatchObject({ art: key, template: 'guerreiro' });
  expect(json.assets).toEqual([expect.objectContaining({ key, token: true, w: 1, h: 1 })]);

  // A imagem própria não aparece na paleta de objetos.
  await page.keyboard.press('o');
  await expect(page.getByRole('radiogroup', { name: 'Minhas imagens' })).toHaveCount(0);

  await page.keyboard.press('v');
  await page.evaluate(() => { const { editor } = (window as unknown as Win).atlas; editor.selectToken(editor.doc.tokens.all()[0].id); });
  await art.getByRole('button', { name: 'Tirar imagem' }).click();
  await expect(art.getByRole('button', { name: 'Usar imagem própria…' })).toBeVisible();
  await expect(page.getByTestId('ini-row').locator('img.token-thumb')).not.toHaveAttribute('src', /^data:/);
});

test('recusa arquivo que não é imagem no token', async ({ page }) => {
  await page.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.setTokenTemplate('goblin');
    editor.pointerDown({ x: 400, y: 300 });
    editor.pointerUp();
    editor.selectToken(editor.doc.tokens.all()[0].id);
  });
  await page.getByTestId('token-art').getByLabel('Imagem do token').setInputFiles({ name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(page.getByTestId('token-art').getByRole('alert')).toContainText('PNG, WebP ou JPEG');
});
