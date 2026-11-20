/*
 * Layout responsivo.
 * A barra, o painel e os diálogos usam `zoom: var(--ui-scale)`, então o espaço
 * que a interface realmente tem é a largura da janela dividida pela escala
 * escolhida em Acessibilidade. Media queries não enxergam essa escala, por isso
 * o tamanho efetivo vira um atributo em <html> (data-layout) que o CSS usa.
 */

export type Layout = 'phone' | 'compact' | 'medium' | 'wide';

/** Limites em px de interface (já divididos pela escala). */
export const LAYOUT_BREAKPOINTS = { phone: 760, compact: 1100, medium: 1480 } as const;

export function layoutFor(windowWidth: number, uiScale = 1): Layout {
  const scale = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  const w = windowWidth / scale;
  if (w < LAYOUT_BREAKPOINTS.phone) return 'phone';
  if (w < LAYOUT_BREAKPOINTS.compact) return 'compact';
  if (w < LAYOUT_BREAKPOINTS.medium) return 'medium';
  return 'wide';
}

export function applyLayout(root: HTMLElement = document.documentElement) {
  const scale = parseFloat(getComputedStyle(root).getPropertyValue('--ui-scale')) || 1;
  const next = layoutFor(window.innerWidth, scale);
  if (root.dataset.layout !== next) root.dataset.layout = next;
}

/** Recalcula ao redimensionar a janela (e na troca de orientação). */
export function installResponsiveLayout() {
  applyLayout();
  let frame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => applyLayout());
  });
}
