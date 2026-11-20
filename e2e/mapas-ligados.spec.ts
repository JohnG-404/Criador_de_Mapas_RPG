import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Doc = { id: string; options: { name: string }; tokens: { size: number; all(): { id: string }[]; put(id: string, t: unknown): void }; grid: { cellToWorld(c: { col: number; row: number }): { x: number; y: number } } };
type Atlas = {
  editor: {
    doc: Doc;
    playerDoc: Doc;
    maps: Doc[];
    setTool(t: string): void;
    pointerDown(p: { x: number; y: number }): void;
    pointerUp(): void;
  };
};

async function ready(page: Page) {
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

const atlas = <T,>(page: Page, fn: (a: Atlas) => T) => page.evaluate(fn as unknown as () => T);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker; });
  await page.goto('/');
  await ready(page);
});

test('passagem leva a outro mapa e a janela dos jogadores acompanha', async ({ page }, info) => {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Janela dos jogadores' }).click();
  const player = await popup;
  await ready(player);
  const playerMap = () => player.evaluate(() => (window as unknown as { atlas: Atlas }).atlas.editor.doc.options.name);
  await expect.poll(playerMap).toBe('Mapa sem título');

  // Um personagem de jogador no mapa de cima.
  await page.evaluate(() => {
    const { editor } = (window as unknown as { atlas: Atlas }).atlas;
    editor.setTool('token');
    const p = editor.doc.grid.cellToWorld({ col: 12, row: 10 });
    editor.pointerDown(p);
    editor.pointerUp();
    const t = editor.doc.tokens.all()[0] as Record<string, unknown>;
    editor.doc.tokens.put(t.id as string, { ...t, pc: true, vision: 8 });
  });

  // Ferramenta Passagem: clica no mapa e cria o destino pelo painel.
  await page.keyboard.press('p');
  const canvas = page.locator('canvas[data-testid="map-canvas"]');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const panel = page.getByTestId('link-panel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Leva para').selectOption({ label: '+ Novo mapa…' });
  const dialog = page.getByRole('dialog', { name: 'Novo mapa de destino' });
  await dialog.getByLabel('Nome').fill('Porão');
  await dialog.getByRole('button', { name: 'Criar mapa' }).click();

  // O mestre está no porão (com a passagem de volta); os jogadores continuam em cima.
  await expect(page.getByTestId('map-info')).toContainText('Porão');
  const maps = page.getByTestId('maps-panel');
  await expect(maps.getByRole('listitem')).toHaveCount(2);
  await expect(maps.getByText('Os jogadores estão em')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await playerMap()).toBe('Mapa sem título');

  // Volta ao mapa de cima pela lista e atravessa a passagem com o grupo.
  await maps.getByRole('button', { name: 'Mapa sem título' }).click();
  await expect(page.getByTestId('map-info')).toContainText('Mapa sem título');
  await page.keyboard.press('v');
  // Clica no marcador da passagem, onde quer que ele esteja na tela.
  const at = await page.evaluate(() => {
    const { editor, view } = (window as unknown as { atlas: { editor: { doc: { links: { all(): { x: number; y: number }[] } } }; view: { camera: { worldToScreen(p: { x: number; y: number }): { x: number; y: number } } } } }).atlas;
    return view.camera.worldToScreen(editor.doc.links.all()[0]);
  });
  const now = (await canvas.boundingBox())!;
  await page.mouse.click(now.x + at.x, now.y + at.y);
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Atravessar para Porão' }).click();
  await expect(page.getByTestId('map-info')).toContainText('Porão');
  await expect.poll(playerMap).toBe('Porão');
  await expect.poll(() => player.evaluate(() => (window as unknown as { atlas: Atlas }).atlas.editor.doc.tokens.size)).toBe(1);
  expect(await atlas(page, () => (window as unknown as { atlas: Atlas }).atlas.editor.maps[0].tokens.size)).toBe(0);
  await page.screenshot({ path: info.outputPath('mestre.png') });
  await player.screenshot({ path: info.outputPath('jogadores.png') });

  // Salva a campanha num arquivo só e abre de novo.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salvar' }).click();
  const file = await download;
  const path = info.outputPath('campanha.rpgmap');
  await file.saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.format).toBe('atlas-board-campaign');
  expect(json.maps).toHaveLength(2);
  expect(json.maps[0].links).toHaveLength(1);

  await page.getByRole('button', { name: 'Novo mapa' }).click();
  await expect(page.getByRole('dialog')).toContainText('2 mapas');
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(maps.getByRole('listitem')).toHaveCount(1);
  await page.getByTestId('open-file').setInputFiles(path);
  await expect(maps.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('map-info')).toContainText('Porão');
});

test('a campanha volta depois de recarregar a página', async ({ page }) => {
  await page.getByRole('button', { name: '+ Adicionar mapa' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('Cidade');
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  const maps = page.getByTestId('maps-panel');
  await expect(maps.getByRole('listitem')).toHaveCount(2);
  await page.waitForTimeout(1200);
  await page.reload();
  await ready(page);
  await expect(maps.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('map-info')).toContainText('Cidade');
});
