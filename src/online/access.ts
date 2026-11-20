/**
 * Regras de acesso aos mapas da nuvem, iguais às da função atlas_role no banco.
 * Ficam aqui para a nuvem simulada dos testes e para os testes de unidade.
 */
export type Role = 'owner' | 'edit' | 'view';
export type LinkAccess = 'edit' | 'view' | 'none';
export type ShareRole = 'edit' | 'view';

export interface AccessMap {
  ownerId: string | null;
  linkAccess: LinkAccess;
  token: string;
}
export interface AccessUser {
  id: string;
  email: string;
}

export function roleFor(map: AccessMap, shareRole: ShareRole | null, user: AccessUser | null, token: string | null): Role | null {
  if (user && map.ownerId === user.id) return 'owner';
  const share = user ? shareRole : null;
  const link: LinkAccess | null = token && token.length >= 24 && map.linkAccess !== 'none' && token === map.token ? map.linkAccess : null;
  if (share === 'edit' || link === 'edit') return 'edit';
  return share ?? (link === 'view' ? 'view' : null);
}

export function canEdit(role: Role | null | undefined) {
  return role === 'owner' || role === 'edit';
}

export function isEmail(s: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim()) && s.trim().length <= 254;
}
