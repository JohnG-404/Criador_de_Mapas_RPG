import type { Rolagem } from '../table/rolls';

export interface SkinInfo { id: string; nome: string; descricao: string }
export interface ShowOptions {
  /** Nome no topo da tela. */
  nome?: string;
  /** Cor do jogador, ou 'mestre'. */
  cor?: string;
  /** Elemento com o detalhe dos dados, mostrado sob o total. */
  detalhe?: HTMLElement;
  /** Rolagem de quem está vendo (fica um pouco mais na tela). */
  proprio?: boolean;
}

export const LISTA_SKINS: SkinInfo[];
export function suporta(rol: Rolagem): boolean;
/** Mostra a rolagem em 3D; resolve true quando a animação termina (false se não deu para mostrar). */
export function mostrar(rol: Rolagem, opcoes?: ShowOptions): Promise<boolean>;
export function preaquecer(skin: string | null, papel: string, cor?: string): void;
export function abrirVitrine(o: { atual: string | null; papel: string; cor?: string; aoEscolher?: (id: string) => void }): Promise<void>;
