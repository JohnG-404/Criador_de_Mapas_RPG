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
import chaoCaverna from '../../assets/terreno/realista/chao-caverna.webp';
import rochaLisa from '../../assets/terreno/realista/rocha-lisa.webp';
import pedrasSoltas from '../../assets/terreno/realista/pedras-soltas.webp';
import seixos from '../../assets/terreno/realista/seixos.webp';
import rochaMusgo from '../../assets/terreno/realista/rocha-musgo.webp';
import folhasSecas from '../../assets/terreno/realista/folhas-secas.webp';
import terraRachada from '../../assets/terreno/realista/terra-rachada.webp';
import terraQueimada from '../../assets/terreno/realista/terra-queimada.webp';
import trilha from '../../assets/terreno/realista/trilha.webp';

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
  'chao-caverna': chaoCaverna,
  'rocha-lisa': rochaLisa,
  'pedras-soltas': pedrasSoltas,
  seixos,
  'rocha-musgo': rochaMusgo,
  'folhas-secas': folhasSecas,
  'terra-rachada': terraRachada,
  'terra-queimada': terraQueimada,
  trilha,
};

/** Quantas células uma repetição da textura cobre. */
export const TEXTURE_CELLS = 4;
