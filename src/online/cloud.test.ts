import { describe, expect, it } from 'vitest';
import { cloudRefFromUrl, newCloudToken } from './cloud';

describe('links da nuvem', () => {
  it('lê id e chave do endereço', () => {
    const id = '710f19f4-fb47-4ae4-b477-6325ab23a468';
    const token = newCloudToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(cloudRefFromUrl(new URL(`https://x.dev/app/?mapa=${id}#${token}`))).toEqual({ id, token });
  });
  it('recusa links incompletos ou estranhos', () => {
    expect(cloudRefFromUrl(new URL('https://x.dev/?mapa=abc#123'))).toBeNull();
    expect(cloudRefFromUrl(new URL('https://x.dev/?mapa=710f19f4-fb47-4ae4-b477-6325ab23a468'))).toBeNull();
    expect(cloudRefFromUrl(new URL('https://x.dev/'))).toBeNull();
  });
});
