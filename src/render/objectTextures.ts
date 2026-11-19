import arbusto from '../../assets/objetos/realista/arbusto.webp';
import arvore from '../../assets/objetos/realista/arvore.webp';
import barril from '../../assets/objetos/realista/barril.webp';
import bau from '../../assets/objetos/realista/bau.webp';
import mesa from '../../assets/objetos/realista/mesa.webp';
import rochas from '../../assets/objetos/realista/rochas.webp';
import tapete from '../../assets/objetos/realista/tapete.webp';
import tocha from '../../assets/objetos/realista/tocha.webp';
import pisoPedra from '../../assets/terreno/realista/piso-pedra.webp';

/** Imagens dos objetos do estilo "Realista diurno" (geradas no SpriteCook). */
export const OBJECT_TEXTURE_URLS: Record<string, string> = { arvore, arbusto, rochas, barril, bau, mesa, tapete, tocha };

/** Objetos rentes ao chão (sem sombra projetada). */
export const FLAT_OBJECTS = new Set(['tapete']);

/** Textura usada no topo das paredes. */
export const WALL_TEXTURE_URL = pisoPedra;
