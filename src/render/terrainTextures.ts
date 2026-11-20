import agua from '../../assets/terreno/realista/agua.webp';
import grama from '../../assets/terreno/realista/grama.webp';
import pisoPedra from '../../assets/terreno/realista/piso-pedra.webp';
import terra from '../../assets/terreno/realista/terra.webp';
import areia from '../../assets/terreno/realista/areia.webp';
import neve from '../../assets/terreno/realista/neve.webp';
import lama from '../../assets/terreno/realista/lama.webp';
import cascalho from '../../assets/terreno/realista/cascalho.webp';
import chaoFloresta from '../../assets/terreno/realista/chao-floresta.webp';
import calcamento from '../../assets/terreno/realista/calcamento.webp';
import calcamentoMusgo from '../../assets/terreno/realista/calcamento-musgo.webp';
import pisoMadeira from '../../assets/terreno/realista/piso-madeira.webp';

/**
 * Texturas contínuas do estilo "Realista diurno".
 * As quatro primeiras foram geradas no SpriteCook; as demais são texturas CC0 do Poly Haven
 * (veja assets/terreno/realista/CREDITOS.md).
 */
export const TERRAIN_TEXTURE_URLS: Record<string, string> = {
  grama,
  terra,
  agua,
  'piso-pedra': pisoPedra,
  areia,
  neve,
  lama,
  cascalho,
  'chao-floresta': chaoFloresta,
  calcamento,
  'calcamento-musgo': calcamentoMusgo,
  'piso-madeira': pisoMadeira,
};

/** Quantas células uma repetição da textura cobre. */
export const TEXTURE_CELLS = 4;
