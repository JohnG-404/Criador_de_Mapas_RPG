import type { MapDocument } from '../core/doc/MapDocument';
import { docToJson, mapFileName, MAP_EXTENSION, parseMap } from '../core/doc/serialize';
import type { Editor } from './Editor';

const AUTOSAVE_KEY = 'atlas-board:autosave';
const AUTOSAVE_DELAY_MS = 800;

/** Lê o salvamento automático, se houver um válido. */
export function loadAutosave(): MapDocument | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text ? parseMap(text) : null;
  } catch {
    return null;
  }
}

/**
 * Salva o mapa no navegador pouco depois de cada edição (e ao fechar a aba).
 * Retorna a função que desliga o salvamento.
 */
export function startAutosave(editor: Editor, onSaved?: (ok: boolean) => void) {
  let timer = 0;
  const save = () => {
    window.clearTimeout(timer);
    timer = 0;
    try {
      localStorage.setItem(AUTOSAVE_KEY, docToJson(editor.doc));
      onSaved?.(true);
    } catch {
      // Cota cheia ou armazenamento bloqueado: o mapa continua na memória.
      onSaved?.(false);
    }
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(save, AUTOSAVE_DELAY_MS);
  };
  let docVersion = editor.getState().docVersion;
  const offHistory = editor.history.onChange(schedule);
  const offState = editor.subscribe(() => {
    const v = editor.getState().docVersion;
    if (v !== docVersion) { docVersion = v; schedule(); }
  });
  const onHide = () => { if (timer) save(); };
  window.addEventListener('pagehide', onHide);
  return () => {
    offHistory();
    offState();
    window.removeEventListener('pagehide', onHide);
    if (timer) save();
  };
}

interface SaveFilePicker {
  showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }> }>;
}

/** Baixa um arquivo (ou abre o "Salvar como" do sistema, onde o navegador permite). */
export async function saveBlob(blob: Blob, name: string, type: { description: string; accept: Record<string, string[]> }) {
  const w = window as unknown as SaveFilePicker;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: name, types: [type] });
      const out = await handle.createWritable();
      await out.write(blob);
      await out.close();
      return true;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return false;
      // Outros erros: cai no download comum.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function saveMapFile(doc: MapDocument) {
  return saveBlob(new Blob([docToJson(doc)], { type: 'application/json' }), mapFileName(doc.options.name), {
    description: 'Mapa do Atlas Board',
    accept: { 'application/json': [MAP_EXTENSION] },
  });
}

export async function readMapFile(file: File): Promise<MapDocument> {
  return parseMap(await file.text());
}
