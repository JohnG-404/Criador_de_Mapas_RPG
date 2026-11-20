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
import paredeCaverna from '../../assets/paredes/realista/caverna.webp';
import paredeMadeira from '../../assets/paredes/realista/madeira.webp';
import paredePedraAntiga from '../../assets/paredes/realista/pedra-antiga.webp';
import paredePedraMusgo from '../../assets/paredes/realista/pedra-musgo.webp';
import paredeTijolo from '../../assets/paredes/realista/tijolo.webp';
import rochasQuebradas from '../../assets/objetos/realista/rochas-quebradas.webp';
import rochaGrande from '../../assets/objetos/realista/rocha-grande.webp';
import pedraVermelha from '../../assets/objetos/realista/pedra-vermelha.webp';
import rochaEscura from '../../assets/objetos/realista/rocha-escura.webp';
import galhoSeco from '../../assets/objetos/realista/galho-seco.webp';
import samambaia from '../../assets/objetos/realista/samambaia.webp';
import fogueira from '../../assets/objetos/realista/fogueira.webp';
import estatua from '../../assets/objetos/realista/estatua.webp';
import mesaPequena from '../../assets/objetos/realista/mesa-pequena.webp';
import banco from '../../assets/objetos/realista/banco.webp';
import banquinho from '../../assets/objetos/realista/banquinho.webp';
import cadeira from '../../assets/objetos/realista/cadeira.webp';
import comoda from '../../assets/objetos/realista/comoda.webp';
import balde from '../../assets/objetos/realista/balde.webp';
import cesto from '../../assets/objetos/realista/cesto.webp';
import vaso from '../../assets/objetos/realista/vaso.webp';
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
  'rochas-quebradas': rochasQuebradas,
  'rocha-grande': rochaGrande,
  'pedra-vermelha': pedraVermelha,
  'rocha-escura': rochaEscura,
  'galho-seco': galhoSeco,
  samambaia,
  fogueira,
  estatua,
  'mesa-pequena': mesaPequena,
  banco,
  banquinho,
  cadeira,
  comoda,
  balde,
  cesto,
  vaso,
};

/** Objetos rentes ao chão (sem sombra projetada). */
export const FLAT_OBJECTS = new Set(['tapete']);

/**
 * Textura do topo das paredes, por tema (ver WALL_STYLES). "pedra" é a do
 * SpriteCook; as demais são texturas CC0 do Poly Haven (assets/paredes/realista/CREDITOS.md).
 */
export const WALL_TEXTURE_URLS: Record<string, string> = {
  pedra: pisoPedra,
  'pedra-antiga': paredePedraAntiga,
  'pedra-musgo': paredePedraMusgo,
  tijolo: paredeTijolo,
  madeira: paredeMadeira,
  caverna: paredeCaverna,
};
