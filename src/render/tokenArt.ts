/** Retratos dos modelos de token: assets/tokens/<chave>.webp (veja CREDITOS.md lá). */
const files = import.meta.glob('../../assets/tokens/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const TOKEN_ART_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/([^/]+)\.webp$/, '$1'), url]),
);
