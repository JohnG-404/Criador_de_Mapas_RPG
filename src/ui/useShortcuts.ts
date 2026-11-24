import { useEffect } from 'react';
import { TERRAINS } from '../core/doc/terrain';
import { TOOLS, type Editor } from '../editor/Editor';
import { getA11y } from './a11y/settings';

/** Atalhos de teclado do editor (ferramentas, terrenos, pincel, seleção e histórico). */
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
        else if (key === 'a') editor.selectAll();
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) return;
      // Acessibilidade: atalhos de uma tecla podem ser desligados (WCAG 2.1.4).
      if (!getA11y().letterShortcuts) {
        if (e.key === 'Escape') { editor.clearRuler(); if (editor.hasSelection) editor.clearSelection(); }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.hasSelection) { editor.deleteSelection(); e.preventDefault(); }
        return;
      }
      const tool = TOOLS.find((x) => x.key === key);
      if (tool) { editor.setTool(tool.id); e.preventDefault(); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= TERRAINS.length) { editor.setTerrain(TERRAINS[n - 1].id); e.preventDefault(); return; }
      if (e.key === 'Escape') editor.clearRuler();
      const hasSelection = editor.hasSelection;
      if (e.key === '[' || e.key === ']') {
        const step = e.key === ']' ? 1 : -1;
        if (hasSelection) editor.resizeSelection(step);
        else editor.setBrushSize(editor.getState().brushSize + step);
        e.preventDefault();
        return;
      }
      if (!hasSelection) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { editor.deleteSelection(); e.preventDefault(); }
      else if (key === 'r') { editor.rotateSelection(e.shiftKey ? -15 : 15); e.preventDefault(); }
      else if (e.key === 'Escape') { editor.clearSelection(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, enabled]);
}
