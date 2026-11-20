const MAX_SIDE = 512;
const MAX_BYTES = 15 * 1024 * 1024;
/** Tamanho, em células, do lado maior de uma imagem recém-importada. */
const DEFAULT_CELLS = 2;

export interface ImportedImage {
  name: string;
  data: string;
  w: number;
  h: number;
}

/**
 * Lê uma imagem do usuário, reduz para no máximo 512 px no lado maior e
 * devolve como data URL WebP (mantém a transparência e ocupa pouco no arquivo).
 */
export async function readImageAsset(file: File): Promise<ImportedImage> {
  if (!/^image\/(png|webp|jpeg)$/.test(file.type)) throw new Error('Use uma imagem PNG, WebP ou JPEG.');
  if (file.size > MAX_BYTES) throw new Error('A imagem é grande demais (máximo de 15 MB).');
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let data = canvas.toDataURL('image/webp', 0.9);
  if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/png');
  const longest = Math.max(w, h);
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imagem';
  return {
    name,
    data,
    w: Math.round((DEFAULT_CELLS * w) / longest * 100) / 100,
    h: Math.round((DEFAULT_CELLS * h) / longest * 100) / 100,
  };
}
