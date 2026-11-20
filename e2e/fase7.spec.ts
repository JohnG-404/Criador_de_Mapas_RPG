import { expect, test, type Page } from '@playwright/test';

type Win = {
  atlas: {
    editor: {
      generate(kind: string, seed: number): void;
      setTool(t: string): void;
      pointerDown(p: { x: number; y: number }): void;
      pointerMove(p: { x: number; y: number }): void;
      pointerUp(): void;
    };
  };
};

async function ready(page: Page) {
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** Quantas cores diferentes (em blocos) aparecem na vista 3D: uma cena montada tem muitas. */
async function colorCount(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas[data-testid="map-3d"]') as HTMLCanvasElement;
    const g = document.createElement('canvas');
    g.width = 64; g.height = 40;
    const ctx = g.getContext('2d')!;
    ctx.drawImage(c, 0, 0, 64, 40);
    const d = ctx.getImageData(0, 0, 64, 40).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    return set.size;
  });
}

test('vista 3D abre, acompanha a edição e volta ao 2D', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => (window as unknown as Win).atlas.editor.generate('dungeon', 1234));

  await page.getByRole('button', { name: 'Ver em 3D' }).click();
  const canvas = page.locator('canvas[data-testid="map-3d"]');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await page.waitForTimeout(300);
  expect(await colorCount(page)).toBeGreaterThan(40);

  // Trocar a altura das paredes refaz a cena.
  const builds = Number(await canvas.getAttribute('data-builds'));
  await page.getByRole('radio', { name: 'Alta' }).click();
  await expect(canvas).not.toHaveAttribute('data-builds', String(builds), { timeout: 15_000 });
  await expect(page.getByRole('radio', { name: 'Alta' })).toHaveAttribute('aria-checked', 'true');

  // Uma parede nova no documento aparece na vista 3D.
  const before = Number(await canvas.getAttribute('data-builds'));
  await page.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.setTool('wall');
    editor.pointerDown({ x: 64, y: 64 });
    editor.pointerMove({ x: 256, y: 64 });
    editor.pointerUp();
  });
  await expect(canvas).not.toHaveAttribute('data-builds', String(before), { timeout: 15_000 });

  // Girar com o mouse não quebra nada.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);

  await page.getByRole('button', { name: 'Voltar ao 2D' }).click();
  await expect(page.getByTestId('view-3d')).toHaveCount(0);
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toBeVisible();

  // Esc também fecha.
  await page.getByRole('button', { name: 'Ver em 3D' }).click();
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('view-3d')).toHaveCount(0);
});
