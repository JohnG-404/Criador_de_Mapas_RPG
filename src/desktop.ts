/**
 * Integração com o app de desktop (Tauri). No navegador nada daqui é usado:
 * os módulos do Tauri só são carregados quando o app roda no desktop.
 */

/** Endereço público da versão web, usado nos links que vão para os jogadores. */
const PUBLIC_URL: string = import.meta.env.VITE_PUBLIC_URL || 'https://johng-404.github.io/Criador_de_Mapas_RPG/';

export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Base dos links de sala e de nuvem. No desktop o endereço da página é
 * interno do app e não abre em outro computador, então usa a versão web.
 */
export function shareBaseUrl(): string {
  return isDesktop() ? PUBLIC_URL : `${location.origin}${location.pathname}`;
}

type FileType = { description: string; accept: Record<string, string[]> };

/** "Salvar como" do sistema. Retorna false se a pessoa cancelar. */
export async function desktopSaveBlob(blob: Blob, name: string, type: FileType): Promise<boolean> {
  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const extensions = Object.values(type.accept).flat().map((e) => e.replace(/^\./, ''));
  const path = await save({ defaultPath: name, filters: [{ name: type.description, extensions }] });
  if (!path) return false;
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return true;
}

const PLAYER_LABEL = 'jogadores';

/** Janela dos jogadores como janela nativa do app (dá para levar a outro monitor ou TV). */
export async function openDesktopPlayerWindow(url: string) {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel(PLAYER_LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }
  new WebviewWindow(PLAYER_LABEL, {
    url,
    title: 'Atlas Board · Jogadores',
    width: 1280,
    height: 800,
    dragDropEnabled: false,
  });
}

/** F11 liga e desliga a tela cheia, como no navegador. */
export function installFullscreenKey() {
  if (!isDesktop()) return;
  window.addEventListener('keydown', async (e) => {
    if (e.key !== 'F11') return;
    e.preventDefault();
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    await w.setFullscreen(!(await w.isFullscreen()));
  });
}

/** Mapa aberto com duplo clique num arquivo .rpgmap, se o app foi aberto assim. */
export async function initialDesktopMap(): Promise<{ name: string; text: string } | null> {
  if (!isDesktop()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ name: string; text: string } | null>('initial_map_file');
}
