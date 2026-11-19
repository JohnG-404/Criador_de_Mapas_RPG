import type { Point, Rect } from '../grid/GridSystem';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/**
 * Câmera 2D: guarda o deslocamento (pan) e o zoom, e converte entre
 * coordenadas de tela (pixels do canvas) e do mundo (pixels do mapa).
 * Não depende do PixiJS, para poder ser testada sem navegador.
 */
export class Camera {
  /** Posição do mundo que aparece no canto superior esquerdo da tela. */
  x = 0;
  y = 0;
  zoom = 1;
  viewWidth = 1;
  viewHeight = 1;

  setViewSize(width: number, height: number) {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
  }

  screenToWorld(p: Point): Point {
    return { x: this.x + p.x / this.zoom, y: this.y + p.y / this.zoom };
  }

  worldToScreen(p: Point): Point {
    return { x: (p.x - this.x) * this.zoom, y: (p.y - this.y) * this.zoom };
  }

  /** Área do mundo visível na tela. */
  visibleWorldRect(): Rect {
    return { x: this.x, y: this.y, width: this.viewWidth / this.zoom, height: this.viewHeight / this.zoom };
  }

  /** Move a câmera por um deslocamento em pixels de tela (arrastar). */
  panBy(dxScreen: number, dyScreen: number) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  /** Aplica zoom mantendo fixo o ponto do mundo que está sob o cursor. */
  zoomAt(screenPoint: Point, factor: number) {
    const before = this.screenToWorld(screenPoint);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.x = before.x - screenPoint.x / this.zoom;
    this.y = before.y - screenPoint.y / this.zoom;
  }

  /** Enquadra um retângulo do mundo inteiro na tela, com margem. */
  fit(rect: Rect, padding = 24) {
    const zx = (this.viewWidth - padding * 2) / rect.width;
    const zy = (this.viewHeight - padding * 2) / rect.height;
    this.zoom = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM);
    this.x = rect.x + rect.width / 2 - this.viewWidth / 2 / this.zoom;
    this.y = rect.y + rect.height / 2 - this.viewHeight / 2 / this.zoom;
  }

  /** Centraliza a câmera num ponto do mundo. */
  centerOn(p: Point) {
    this.x = p.x - this.viewWidth / 2 / this.zoom;
    this.y = p.y - this.viewHeight / 2 / this.zoom;
  }

  /** Impede que o mapa saia totalmente da tela: mantém pelo menos `margin` px visíveis. */
  clampTo(bounds: Rect, margin = 64) {
    const view = this.visibleWorldRect();
    const m = margin / this.zoom;
    this.x = clamp(this.x, bounds.x - view.width + m, bounds.x + bounds.width - m);
    this.y = clamp(this.y, bounds.y - view.height + m, bounds.y + bounds.height - m);
  }
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
