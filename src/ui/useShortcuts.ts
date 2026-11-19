import { useEffect } from 'react';
import { TERRAINS } from '../core/doc/terrain';
import { TOOLS, type Editor } from '../editor/Editor';

/** Atalhos de teclado do editor (ferramentas, terrenos, pincel e histórico). */
export function useShortcuts(editor: Editor, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) {
        if (!(t instanceof HTMLInputElement && t.type === 'range')) return;
      }
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) editor.undo();
        else if ((key === 'z' && e.shiftKey) || key === 'y') editor.redo();
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) return;
      const tool = TOOLS.find((x) => x.key === key);
      if (tool) { editor.setTool(tool.id); e.preventDefault(); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= TERRAINS.length) { editor.setTerrain(TERRAINS[n - 1].id); e.preventDefault(); return; }
      if (e.key === '[') { editor.setBrushSize(editor.getState().brushSize - 1); e.preventDefault(); }
      if (e.key === ']') { editor.setBrushSize(editor.getState().brushSize + 1); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, enabled]);
}
