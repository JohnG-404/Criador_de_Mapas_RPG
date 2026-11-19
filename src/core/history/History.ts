/** Uma alteração que sabe se aplicar e se desfazer. */
export interface Command {
  readonly label: string;
  apply(): void;
  revert(): void;
  /** Comandos vazios (que não mudaram nada) não entram no histórico. */
  isEmpty?(): boolean;
}

const LIMIT = 500;

/** Vários comandos como um único passo (ex.: gerar um mapa mexe em todas as camadas). */
export class CompositeCommand implements Command {
  constructor(readonly label: string, private parts: Command[]) {}
  apply() { for (const c of this.parts) c.apply(); }
  revert() { for (let i = this.parts.length - 1; i >= 0; i--) this.parts[i].revert(); }
  isEmpty() { return this.parts.every((c) => c.isEmpty?.() ?? false); }
}

/** Pilhas de desfazer/refazer. */
export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  /** Registra um comando que JÁ foi aplicado (ex.: um traço de pincel). */
  push(cmd: Command) {
    if (cmd.isEmpty?.()) return;
    this.undoStack.push(cmd);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }

  /** Aplica e registra. */
  execute(cmd: Command) {
    cmd.apply();
    this.push(cmd);
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.revert();
    this.redoStack.push(cmd);
    this.emit();
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.apply();
    this.undoStack.push(cmd);
    this.emit();
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack.at(-1)?.label; }
  get redoLabel() { return this.redoStack.at(-1)?.label; }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() { this.listeners.forEach((fn) => fn()); }
}
