import { describe, expect, it } from 'vitest';
import { roleFor, type AccessMap } from './access';

const token = 'a'.repeat(48);
const ana = { id: 'u-ana', email: 'ana@x.dev' };
const bia = { id: 'u-bia', email: 'bia@x.dev' };

describe('quem pode abrir um mapa da nuvem', () => {
  it('mapa antigo, sem dono: quem tem a chave edita, como antes', () => {
    const m: AccessMap = { ownerId: null, linkAccess: 'edit', token };
    expect(roleFor(m, null, null, token)).toBe('edit');
    expect(roleFor(m, null, ana, token)).toBe('edit');
    expect(roleFor(m, null, null, 'b'.repeat(48))).toBeNull();
    expect(roleFor(m, null, null, null)).toBeNull();
  });
  it('mapa com dono e link desligado: só o dono e os convidados', () => {
    const m: AccessMap = { ownerId: ana.id, linkAccess: 'none', token };
    expect(roleFor(m, null, ana, null)).toBe('owner');
    expect(roleFor(m, null, null, token)).toBeNull();
    expect(roleFor(m, null, bia, token)).toBeNull();
    expect(roleFor(m, 'view', bia, null)).toBe('view');
    expect(roleFor(m, 'edit', bia, null)).toBe('edit');
    // Convite não vale sem estar logado.
    expect(roleFor(m, 'edit', null, null)).toBeNull();
  });
  it('link só para ver, e o maior acesso vence', () => {
    const m: AccessMap = { ownerId: ana.id, linkAccess: 'view', token };
    expect(roleFor(m, null, null, token)).toBe('view');
    expect(roleFor(m, 'edit', bia, token)).toBe('edit');
    expect(roleFor({ ...m, linkAccess: 'edit' }, 'view', bia, token)).toBe('edit');
  });
});
