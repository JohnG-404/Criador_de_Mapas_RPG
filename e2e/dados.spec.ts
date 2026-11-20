import { expect, test, type Page } from '@playwright/test';

type Win = {
  atlas: {
    editor: {
      setTokenTemplate(k: string): void;
      pointerDown(p: { x: number; y: number }): void;
      pointerUp(): void;
      selectToken(id: string): void;
      doc: { tokens: { all(): { id: string; template?: string; name: string }[] }; initiative: { get(): { entries: { id: string }[]; turn: number; round: number } } };
    };
  };
};

async function ready(page: Page) {
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

async function putTokens(page: Page, list: [string, number, number][]) {
  await page.evaluate((list) => {
    const { editor } = (window as unknown as Win).atlas;
    for (const [tpl, x, y] of list) { editor.setTokenTemplate(tpl); editor.pointerDown({ x, y }); editor.pointerUp(); }
  }, list);
}

const rolls = (page: Page) => page.getByTestId('roll');

test('dados na sala online: públicas chegam aos jogadores, ocultas não, até o mestre revelar', async ({ context }) => {
  await context.addInitScript(() => {
    (window as unknown as { __atlasFakeRealtime: boolean }).__atlasFakeRealtime = true;
    // Sem o dado 3D nos testes: as rolagens vão direto para a crônica.
    localStorage.setItem('atlas-board:dados-3d', 'desligado');
  });
  const gm = await context.newPage();
  await gm.goto('/');
  await ready(gm);
  await putTokens(gm, [['guerreiro', 400, 300], ['goblin', 600, 300]]);

  await gm.getByRole('button', { name: 'Sala online' }).click();
  await gm.getByRole('button', { name: 'Abrir sala' }).click();
  const link = await gm.getByTestId('room-link').inputValue();
  await gm.getByRole('button', { name: 'Fechar' }).click();

  const player = await context.newPage();
  await player.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await ready(player);
  await expect(player.getByTestId('table-dock')).toBeVisible();
  await player.getByLabel('Seu nome').fill('Ana');
  await player.getByLabel('Seu nome').press('Enter');

  // Mestre: a rolagem oculta vem marcada e fica só com ele.
  await gm.getByRole('button', { name: 'Mesa' }).click();
  await expect(gm.getByRole('checkbox', { name: /Rolagem oculta/ })).toBeChecked();
  await gm.getByLabel('Descrição da rolagem').fill('Emboscada');
  await gm.getByRole('button', { name: 'Rolar d20' }).click();
  await expect(rolls(gm)).toHaveCount(1);
  await expect(rolls(gm).first()).toContainText('Oculta');

  // Agora à vista: chega ao jogador.
  await gm.getByRole('checkbox', { name: /Rolagem oculta/ }).uncheck();
  await gm.getByLabel('Expressão livre').fill('2d6+3');
  await gm.getByRole('button', { name: 'Rolar', exact: true }).click();
  await expect(rolls(player)).toHaveCount(1);
  await expect(rolls(player).first()).toContainText('Mestre');
  const gmTotal = await rolls(gm).first().getByTestId('roll-total').innerText();
  await expect(rolls(player).first().getByTestId('roll-total')).toHaveText(gmTotal);

  // Jogador rola: o mestre vê.
  await player.getByRole('button', { name: /^Vantagem/ }).click();
  await expect(rolls(gm)).toHaveCount(3);
  await expect(rolls(gm).first()).toContainText('Ana');

  // Mestre revela a oculta.
  await gm.getByRole('button', { name: 'Revelar para a mesa' }).click();
  await expect(rolls(player)).toHaveCount(3);
  await expect(rolls(player).first()).toContainText('Revelada');
  await expect(rolls(player).first()).toContainText('Emboscada');

  // Iniciativa: o mestre rola e o jogador vê a ordem.
  await gm.getByRole('tab', { name: 'Iniciativa' }).click();
  await gm.getByRole('button', { name: /Rolar iniciativa/ }).click();
  await expect(gm.getByTestId('ini-row')).toHaveCount(2);
  await gm.getByRole('button', { name: /Próxima/ }).click();
  await player.getByRole('tab', { name: 'Iniciativa' }).click();
  await expect(player.getByTestId('ini-row')).toHaveCount(2);
  await expect(player.locator('.ini-row.active')).toHaveCount(1);
  // As rolagens de iniciativa foram para a crônica (a do goblin, oculta, só para o mestre).
  await gm.getByRole('tab', { name: 'Dados' }).click();
  await expect(rolls(gm).filter({ hasText: 'Iniciativa' })).toHaveCount(2);
});

test('iniciativa: rodadas, vez e token apagado sai da ordem', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await putTokens(page, [['guerreiro', 400, 300], ['mago', 464, 300], ['orc', 600, 300]]);
  await page.getByRole('button', { name: 'Mesa' }).click();
  await page.getByRole('tab', { name: 'Iniciativa' }).click();
  await page.getByRole('button', { name: /Rolar iniciativa \(3\)/ }).click();
  await expect(page.getByTestId('ini-row')).toHaveCount(3);
  // A ordem segue os valores.
  const values = await page.locator('input.ini-value').evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
  expect([...values].sort((a, b) => b - a)).toEqual(values);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Próxima/ }).click();
  await expect(page.getByTestId('ini-round')).toHaveText('Rodada 2');
  // Valor manual reordena.
  const last = page.locator('input.ini-value').last();
  await last.fill('99');
  await last.press('Enter');
  await expect(page.locator('input.ini-value').first()).toHaveValue('99');
  // Apagar o token tira da ordem; desfazer devolve.
  await page.getByTestId('ini-row').first().locator('.ini-name').click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('ini-row')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('ini-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Encerrar combate' }).click();
  await expect(page.getByTestId('ini-row')).toHaveCount(0);
});

test('ficha completa: atributos, perícias e ataques rolam na mesa', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('atlas-board:dados-3d', 'desligado'));
  await page.goto('/');
  await ready(page);
  await putTokens(page, [['goblin', 400, 300], ['atirador', 500, 300]]);
  await page.getByRole('button', { name: 'Mesa' }).click();
  await page.getByRole('checkbox', { name: /Rolagem oculta/ }).uncheck();

  // D&D: goblin.
  await page.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.selectToken(editor.doc.tokens.all().find((t) => t.template === 'goblin')!.id);
  });
  await page.getByRole('button', { name: /Ficha completa/ }).click();
  const sheet = page.getByTestId('sheet-dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: '+6' })).toBeVisible(); // Furtividade (especialista)
  await sheet.getByLabel('Destreza').fill('18');
  await expect(sheet.getByRole('button', { name: '+8' })).toBeVisible(); // 4 + 2×2
  await sheet.getByRole('button', { name: '🎲 Teste' }).first().click();
  await expect(rolls(page).first()).toContainText('Goblin · Cimitarra');
  await sheet.getByRole('button', { name: '🎲 Dano' }).first().click();
  await expect(rolls(page).first()).toContainText('Dano · Cimitarra');
  await sheet.getByRole('button', { name: 'Envenenado' }).click();
  await page.getByRole('button', { name: 'Fechar ficha' }).click();
  await expect(page.getByTestId('token-sheet')).toContainText('Envenenado');

  // Horror: atirador rola 3d20 e fica o maior.
  await page.evaluate(() => {
    const { editor } = (window as unknown as Win).atlas;
    editor.selectToken(editor.doc.tokens.all().find((t) => t.template === 'atirador')!.id);
  });
  await page.getByRole('button', { name: /Ficha completa/ }).click();
  await expect(sheet.getByText('Atributo = quantidade de d20')).toBeVisible();
  await sheet.getByTitle(/Rolar 3d20kh1\+10/).click();
  await expect(rolls(page).first()).toContainText('Atirador · Pontaria');
  await expect(rolls(page).first()).toContainText('3d20kh1');
});

test('dado 3D aparece na tela ao rolar', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: 'Mesa' }).click();
  await page.getByRole('button', { name: 'Rolar d20' }).click();
  await expect(page.locator('.palco.ativo canvas')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.palco .palco-total')).toHaveText(/^\d+$/, { timeout: 10_000 });
  await expect(page.locator('.palco.ativo')).toHaveCount(0, { timeout: 10_000 });
  await expect(rolls(page).first().getByTestId('roll-total')).toHaveText(/^\d+$/);
});
