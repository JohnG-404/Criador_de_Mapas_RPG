import { expect, test, type Page } from '@playwright/test';

type Pt = { x: number; y: number };
type Atlas = {
  editor: {
    doc: { fog: { get(c: number, r: number): number }; walls: { all(): { kind: string; open?: boolean }[] }; notes: { size: number } };
    overlay: { ruler: { cells: number; meters: number } | null };
  };
  view: { camera: { zoom: number; worldToScreen(p: Pt): Pt } };
};

async function ready(page: Page) {
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

async function toPage(page: Page, w: Pt): Promise<Pt> {
  const box = (await page.locator('canvas[data-testid="map-canvas"]').boundingBox())!;
  const s = await page.evaluate((w) => (window as unknown as { atlas: Atlas }).atlas.view.camera.worldToScreen(w), w);
  return { x: box.x + s.x, y: box.y + s.y };
}

async function drag(page: Page, a: Pt, b: Pt, mods: string[] = []) {
  const pa = await toPage(page, a), pb = await toPage(page, b);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 5 });
  await page.mouse.up();
  for (const m of mods) await page.keyboard.up(m);
}

async function click(page: Page, w: Pt) {
  const p = await toPage(page, w);
  await page.mouse.click(p.x, p.y);
}

const C = (c: number) => c * 32;
const mid = (c: number) => (c + 0.5) * 32;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await ready(page);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Aumentar zoom' }).click();
});

test('personagem revela a névoa e abrir a porta mostra o outro lado', async ({ page }) => {
  const fog = (c: number, r: number) => page.evaluate(([c, r]) => (window as unknown as { atlas: Atlas }).atlas.editor.doc.fog.get(c, r), [c, r]);
  // sala com porta na parede da direita
  await page.keyboard.press('w');
  await drag(page, { x: C(26), y: C(16) }, { x: C(31), y: C(21) }, ['Shift']);
  await page.keyboard.press('d');
  await click(page, { x: C(31), y: mid(18) });
  await page.keyboard.press('n');
  await page.getByRole('button', { name: 'Cobrir tudo' }).click();
  // token de jogador dentro da sala
  await page.keyboard.press('t');
  await click(page, { x: mid(28), y: mid(18) });
  await page.keyboard.press('v');
  await page.getByLabel('Personagem de jogador').check();
  expect(await fog(28, 18)).toBe(0);
  expect(await fog(33, 18)).toBe(1);
  // abrir a porta com Selecionar
  await page.keyboard.press('Escape');
  await click(page, { x: C(31), y: mid(18) });
  await expect.poll(() => page.evaluate(() => (window as unknown as { atlas: Atlas }).atlas.editor.doc.walls.all().find((w) => w.kind === 'door')?.open)).toBe(true);
  expect(await fog(33, 18)).toBe(0);
});

test('régua mede a distância', async ({ page }) => {
  await page.keyboard.press('m');
  await drag(page, { x: mid(20), y: mid(20) }, { x: mid(26), y: mid(23) });
  const ruler = await page.evaluate(() => (window as unknown as { atlas: Atlas }).atlas.editor.overlay.ruler);
  expect(ruler).toMatchObject({ cells: 6, meters: 9 });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as { atlas: Atlas }).atlas.editor.overlay.ruler)).toBeNull();
});

test('nota do mestre: criar e escrever', async ({ page }) => {
  await page.keyboard.press('a');
  await click(page, { x: mid(22), y: mid(18) });
  const text = page.locator('#note-text');
  await expect(text).toBeFocused();
  await text.fill('Armadilha de dardos');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('content-counts')).toBeVisible();
  const saved = await page.evaluate(() => {
    const { editor } = (window as unknown as { atlas: { editor: { selectedNote(): { text: string } | null } } }).atlas;
    return editor.selectedNote()?.text;
  });
  expect(saved).toBe('Armadilha de dardos');
});

test('mostrar esta área enquadra a janela dos jogadores', async ({ page }) => {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Janela dos jogadores' }).click();
  const player = await popup;
  await ready(player);
  const zoom = () => player.evaluate(() => (window as unknown as { atlas: Atlas }).atlas.view.camera.zoom);
  const before = await zoom();
  await page.getByRole('button', { name: 'Mostrar esta área' }).click();
  await expect.poll(zoom).toBeGreaterThan(before * 1.5);
});
