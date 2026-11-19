import agua from '../../assets/terreno/realista/agua.webp';
import grama from '../../assets/terreno/realista/grama.webp';
import pisoPedra from '../../assets/terreno/realista/piso-pedra.webp';
import terra from '../../assets/terreno/realista/terra.webp';

/** Texturas contínuas do estilo "Realista diurno" (geradas no SpriteCook). */
export const TERRAIN_TEXTURE_URLS: Record<string, string> = {
  grama,
  terra,
  agua,
  'piso-pedra': pisoPedra,
};

/** Quantas células uma repetição da textura cobre. */
export const TEXTURE_CELLS = 4;
