import { expect, test, type Page } from '@playwright/test';

type Win = { atlas: { editor: { setTool(t: string): void; pointerDown(p: { x: number; y: number }): void; pointerUp(): void; doc: { tokens: { size: number } } } } };

async function ready(page: Page) {
  await expect(page.locator('canvas[data-testid="map-canvas"]')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}
async function addToken(page: Page, x: number) {
  await page.evaluate((x) => {
    const { editor } = (window as unknown as Win).atlas;
    editor.setTool('token');
    editor.pointerDown({ x, y: 100 }); editor.pointerUp();
  }, x);
}
async function login(page: Page, email: string, create = false) {
  const dlg = page.getByRole('dialog', { name: create ? 'Criar conta' : 'Entrar' }).or(page.getByRole('dialog', { name: 'Entrar' }));
  await expect(dlg).toBeVisible();
  if (create) await page.getByRole('tab', { name: 'Criar conta' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha').fill('segredo123');
  await page.locator('dialog').getByRole('button', { name: create ? 'Criar conta' : 'Entrar', exact: true }).click();
}

test('conta: meus mapas, convite por e-mail, link desligado e link aberto', async ({ context }) => {
  await context.addInitScript(() => { (window as unknown as { __atlasFakeCloud: boolean }).__atlasFakeCloud = true; });
  const page = await context.newPage();
  await page.goto('/');
  await ready(page);
  await addToken(page, 100);

  // Ana cria a conta e salva: o mapa nasce privado.
  await page.getByTestId('account-button').click();
  await login(page, 'ana@exemplo.com', true);
  await expect(page.getByTestId('account-button')).toHaveText('ana');
  await page.getByRole('button', { name: 'Nuvem' }).click();
  await page.getByRole('button', { name: 'Salvar na nuvem' }).click();
  await expect(page.getByText('Mapa salvo na nuvem')).toBeVisible();
  await expect(page.getByTestId('link-access')).toHaveValue('none');
  const accountLink = await page.getByTestId('cloud-account-link').inputValue();
  expect(accountLink).toMatch(/\?mapa=[0-9a-f-]{36}$/);

  // Convida a Bia só para ver.
  await page.getByLabel('E-mail para convidar').fill('Bia@Exemplo.com');
  await page.getByRole('button', { name: 'Convidar' }).click();
  await expect(page.getByTestId('share-list')).toContainText('bia@exemplo.com');

  // Liga o link aberto (só ver) e guarda o endereço.
  await page.getByTestId('link-access').selectOption('view');
  const openLink = await page.getByTestId('cloud-link').inputValue();
  expect(openLink).toMatch(/\?mapa=[0-9a-f-]{36}#[0-9a-f]{48}$/);
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Ana sai da conta.
  await page.getByTestId('account-button').click();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByTestId('account-button')).toHaveText('Entrar');

  // Sem conta, o link aberto mostra o mapa, mas não deixa atualizar.
  const anon = await context.newPage();
  await anon.addInitScript(() => localStorage.removeItem('atlas-board:autosave'));
  await anon.goto(openLink.replace(/^https?:\/\/[^/]+/, ''));
  await ready(anon);
  await expect(anon.getByText(/Aberto da nuvem/)).toBeVisible();
  expect(await anon.evaluate(() => (window as unknown as Win).atlas.editor.doc.tokens.size)).toBe(1);
  await anon.getByRole('button', { name: 'Nuvem' }).click();
  await expect(anon.getByTestId('cloud-shared-info')).toContainText('só pode ver');
  await expect(anon.getByRole('button', { name: 'Atualizar na nuvem' })).toBeDisabled();
  await anon.close();

  // O link da conta pede login; a Bia entra e o mapa abre.
  const bia = await context.newPage();
  await bia.addInitScript(() => localStorage.removeItem('atlas-board:autosave'));
  // Cria a conta da Bia antes (nos testes as contas ficam no navegador).
  await bia.goto('/');
  await ready(bia);
  await bia.getByTestId('account-button').click();
  await login(bia, 'bia@exemplo.com', true);
  await bia.getByTestId('account-button').click();
  await bia.getByRole('button', { name: 'Sair da conta' }).click();

  await bia.goto(accountLink.replace(/^https?:\/\/[^/]+/, ''));
  await ready(bia);
  await expect(bia.getByText('Entre na sua conta para abrir o mapa deste link.')).toBeVisible();
  await login(bia, 'bia@exemplo.com');
  await expect(bia.getByText(/Aberto da nuvem/)).toBeVisible();
  expect(await bia.evaluate(() => (window as unknown as Win).atlas.editor.doc.tokens.size)).toBe(1);
  await bia.getByRole('button', { name: 'Nuvem' }).click();
  await expect(bia.getByTestId('cloud-shared-info')).toContainText('compartilhado por ana@exemplo.com');
  await expect(bia.getByRole('button', { name: 'Atualizar na nuvem' })).toBeDisabled();
  await bia.getByRole('button', { name: 'Fechar' }).click();

  // Ana volta, desliga o link e dá edição para a Bia.
  await bia.getByTestId('account-button').click();
  await bia.getByRole('button', { name: 'Sair da conta' }).click();
  await bia.getByTestId('account-button').click();
  await login(bia, 'ana@exemplo.com');
  await bia.getByRole('button', { name: 'Nuvem' }).click();
  // O mapa aberto é o mesmo; com a lista da conta, o papel vira "dono".
  await expect(bia.getByTestId('link-access')).toHaveValue('view');
  await bia.getByTestId('link-access').selectOption('none');
  await bia.getByLabel('Acesso de bia@exemplo.com').selectOption('edit');
  await bia.getByRole('button', { name: 'Fechar' }).click();
  await bia.getByTestId('account-button').click();
  await bia.getByRole('button', { name: 'Sair da conta' }).click();

  // O link aberto parou de funcionar.
  const anon2 = await context.newPage();
  await anon2.goto(openLink.replace(/^https?:\/\/[^/]+/, ''));
  await ready(anon2);
  await expect(anon2.getByText(/link foi desligado/)).toBeVisible();
  await anon2.close();

  // Bia agora edita e atualiza; o mapa está em Meus mapas dela.
  await bia.getByTestId('account-button').click();
  await login(bia, 'bia@exemplo.com');
  await bia.goto(accountLink.replace(/^https?:\/\/[^/]+/, ''));
  await ready(bia);
  await expect(bia.getByText(/Aberto da nuvem/)).toBeVisible();
  await addToken(bia, 200);
  await bia.getByRole('button', { name: 'Nuvem' }).click();
  await expect(bia.getByTestId('cloud-shared-info')).toContainText('pode editar');
  await bia.getByRole('button', { name: 'Atualizar na nuvem' }).click();
  await expect(bia.getByText('Mapa salvo na nuvem')).toBeVisible();
});

test('conta: mapa antigo salvo sem conta passa para a conta e o link continua', async ({ context }) => {
  await context.addInitScript(() => { (window as unknown as { __atlasFakeCloud: boolean }).__atlasFakeCloud = true; });
  const page = await context.newPage();
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: 'Nuvem' }).click();
  await page.getByRole('button', { name: 'Salvar na nuvem' }).click();
  const link = await page.getByTestId('cloud-link').inputValue();
  await page.getByRole('button', { name: 'Entrar ou criar conta' }).click();
  await login(page, 'caio@exemplo.com', true);
  await page.getByRole('button', { name: 'Nuvem' }).click();
  await page.getByRole('button', { name: 'Guardar na minha conta' }).click();
  await expect(page.getByText('Mapa guardado na sua conta')).toBeVisible();
  await expect(page.getByTestId('link-access')).toHaveValue('edit');
  expect(await page.getByTestId('cloud-link').inputValue()).toBe(link);
});
