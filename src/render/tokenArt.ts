import { objectAsset, type Token } from '../core/doc/objects';

/** Retratos dos modelos de token: assets/tokens/<chave>.webp (veja CREDITOS.md lá). */
const files = import.meta.glob('../../assets/tokens/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const TOKEN_ART_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/([^/]+)\.webp$/, '$1'), url]),
);

/**
 * Chave da arte do token: a imagem própria (id em doc.assets) vale mais que a
 * do modelo pronto. Sem nenhuma, o token é desenhado com letra e cor.
 */
export function tokenArtKey(t: Pick<Token, 'art' | 'template'>): string | undefined {
  if (t.art && (objectAsset(t.art) as { data?: string } | undefined)?.data) return t.art;
  return t.template && TOKEN_ART_URLS[t.template] ? t.template : undefined;
}

/** Endereço da imagem do retrato (data URL da imagem própria ou arquivo do modelo). */
export function tokenArtUrl(t: Pick<Token, 'art' | 'template'>): string | undefined {
  const key = tokenArtKey(t);
  if (!key) return undefined;
  return TOKEN_ART_URLS[key] ?? (objectAsset(key) as { data?: string } | undefined)?.data;
}
