import arbusto from '../../assets/objetos/realista/arbusto.webp';
import arvore from '../../assets/objetos/realista/arvore.webp';
import barril from '../../assets/objetos/realista/barril.webp';
import bau from '../../assets/objetos/realista/bau.webp';
import mesa from '../../assets/objetos/realista/mesa.webp';
import rochas from '../../assets/objetos/realista/rochas.webp';
import tapete from '../../assets/objetos/realista/tapete.webp';
import tocha from '../../assets/objetos/realista/tocha.webp';
import bauFerro from '../../assets/objetos/realista/bau-ferro.webp';
import caixote from '../../assets/objetos/realista/caixote.webp';
import caixoteLongo from '../../assets/objetos/realista/caixote-longo.webp';
import mesaPiquenique from '../../assets/objetos/realista/mesa-piquenique.webp';
import mesaRedonda from '../../assets/objetos/realista/mesa-redonda.webp';
import pedra from '../../assets/objetos/realista/pedra.webp';
import pedregulho from '../../assets/objetos/realista/pedregulho.webp';
import tronco from '../../assets/objetos/realista/tronco.webp';
import pisoPedra from '../../assets/terreno/realista/piso-pedra.webp';

/**
 * Imagens dos objetos do estilo "Realista diurno".
 * As oito primeiras foram geradas no SpriteCook; as demais são modelos CC0 do Poly Haven
 * renderizados de cima no Blender (veja assets/objetos/realista/CREDITOS.md).
 */
export const OBJECT_TEXTURE_URLS: Record<string, string> = {
  arvore, arbusto, rochas, barril, bau, mesa, tapete, tocha,
  caixote, 'caixote-longo': caixoteLongo, 'bau-ferro': bauFerro, pedregulho, pedra, tronco,
  'mesa-redonda': mesaRedonda, 'mesa-piquenique': mesaPiquenique,
};

/** Objetos rentes ao chão (sem sombra projetada). */
export const FLAT_OBJECTS = new Set(['tapete']);

/** Textura usada no topo das paredes. */
export const WALL_TEXTURE_URL = pisoPedra;
