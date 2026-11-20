import { describe, expect, it } from 'vitest';
import { cloudRefFromUrl, newCloudToken } from './cloud';

describe('links da nuvem', () => {
  const id = '710f19f4-fb47-4ae4-b477-6325ab23a468';
  it('lê id e chave do endereço', () => {
    const token = newCloudToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(cloudRefFromUrl(new URL(`https://x.dev/app/?mapa=${id}#${token}`))).toEqual({ id, token });
  });
  it('aceita link sem chave (abre pela conta)', () => {
    expect(cloudRefFromUrl(new URL(`https://x.dev/?mapa=${id}`))).toEqual({ id, token: null });
    // Volta do link do e-mail: a sessão vem no "#", não é chave de mapa.
    expect(cloudRefFromUrl(new URL(`https://x.dev/?mapa=${id}#access_token=abc&type=magiclink`))).toEqual({ id, token: null });
  });
  it('recusa links estranhos', () => {
    expect(cloudRefFromUrl(new URL('https://x.dev/?mapa=abc#123'))).toBeNull();
    expect(cloudRefFromUrl(new URL('https://x.dev/'))).toBeNull();
  });
});
