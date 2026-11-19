import type { Command } from '../history/History';

export interface Item {
  id: string;
}

let counter = 0;
/** Id curto e único dentro da sessão (suficiente para o documento local). */
export function newId(prefix: string) {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Coleção de itens com id (paredes, objetos, tokens), em ordem de desenho.
 * Avisa os observadores quando muda.
 */
export class ItemLayer<T extends Item> {
  private items = new Map<string, T>();
  private listeners = new Set<() => void>();

  get(id: string) { return this.items.get(id); }
  all(): T[] { return [...this.items.values()]; }
  get size() { return this.items.size; }

  /** Coloca (ou substitui) um item; `null` remove. Mantém a posição na ordem ao substituir. */
  put(id: string, item: T | null) {
    if (item) this.items.set(id, item);
    else this.items.delete(id);
  }

  emit() { this.listeners.forEach((fn) => fn()); }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

/** Alteração em itens: para cada id, o item antes e depois (null = não existe). */
export class ItemsCommand<T extends Item> implements Command {
  private changes = new Map<string, { before: T | null; after: T | null }>();

  constructor(
    private layer: ItemLayer<T>,
    readonly label: string,
  ) {}

  /** Registra e aplica uma mudança. */
  set(id: string, after: T | null) {
    const existing = this.changes.get(id);
    const before = existing ? existing.before : (this.layer.get(id) ?? null);
    this.changes.set(id, { before, after });
    this.layer.put(id, after);
  }

  isEmpty() {
    for (const { before, after } of this.changes.values()) {
      if (JSON.stringify(before) !== JSON.stringify(after)) return false;
    }
    return true;
  }

  apply() {
    for (const [id, c] of this.changes) this.layer.put(id, c.after);
    this.layer.emit();
  }

  revert() {
    const entries = [...this.changes].reverse();
    for (const [id, c] of entries) this.layer.put(id, c.before);
    this.layer.emit();
  }
}
