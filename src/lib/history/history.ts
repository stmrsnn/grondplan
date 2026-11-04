/**
 * Ongedaan maken en opnieuw doen volgens het commandopatroon.
 *
 * Een commando is een zuivere functie-paar op een onveranderlijk document:
 *  - apply(doc)  → nieuw document
 *  - revert(doc) → document zoals vóór apply
 * Omdat commando's hun eigen "vorige waarde" bijhouden, blijft de geschiedenis
 * klein (geen volledige kopieën per stap) en werken ze ook voor 300+ muren.
 *
 * Opeenvolgende commando's met dezelfde `mergeKey` (bv. typen in een naamveld of
 * een maat versleuren) worden samengevoegd tot één stap, zodat één keer
 * Ctrl+Z de hele handeling ongedaan maakt.
 */

export interface Command<D> {
  /** Korte omschrijving in gewone taal, bv. "Verdieping toegevoegd". */
  label: string;
  /** Melding na ongedaan maken, bv. "1e verdieping weer weggehaald". */
  undoMessage?: string;
  /** Melding na opnieuw doen, bv. "1e verdieping terug toegevoegd". */
  redoMessage?: string;
  apply(doc: D): D;
  revert(doc: D): D;
  /** Commando's met dezelfde sleutel binnen het venster worden samengevoegd. */
  mergeKey?: string;
}

interface Entry<D> {
  cmd: Command<D>;
  at: number;
}

export interface HistoryOptions {
  limit?: number;
  mergeWindowMs?: number;
  now?: () => number;
}

export interface Step<D> {
  doc: D;
  label: string;
  message: string;
}

export class History<D> {
  private undoStack: Entry<D>[] = [];
  private redoStack: Entry<D>[] = [];
  private readonly limit: number;
  private readonly mergeWindowMs: number;
  private readonly now: () => number;

  constructor(opts: HistoryOptions = {}) {
    this.limit = opts.limit ?? 300;
    this.mergeWindowMs = opts.mergeWindowMs ?? 1000;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Voert een commando uit en zet het op de stapel. */
  execute(doc: D, cmd: Command<D>): D {
    const next = cmd.apply(doc);
    if (next === doc) return doc; // niets veranderd: geen lege stap
    const t = this.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      top &&
      cmd.mergeKey &&
      top.cmd.mergeKey === cmd.mergeKey &&
      t - top.at <= this.mergeWindowMs
    ) {
      const first = top.cmd;
      top.cmd = {
        label: cmd.label,
        undoMessage: cmd.undoMessage,
        redoMessage: cmd.redoMessage,
        mergeKey: cmd.mergeKey,
        apply: (d) => cmd.apply(first.apply(d)),
        revert: (d) => first.revert(cmd.revert(d)),
      };
      top.at = t;
    } else {
      this.undoStack.push({ cmd, at: t });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.redoStack = [];
    return next;
  }

  undo(doc: D): Step<D> | null {
    const e = this.undoStack.pop();
    if (!e) return null;
    this.redoStack.push(e);
    return {
      doc: e.cmd.revert(doc),
      label: e.cmd.label,
      message: e.cmd.undoMessage ?? `Teruggedraaid: ${e.cmd.label.toLowerCase()}`,
    };
  }

  redo(doc: D): Step<D> | null {
    const e = this.redoStack.pop();
    if (!e) return null;
    e.at = -Infinity; // nooit samenvoegen met een opnieuw gedane stap
    this.undoStack.push(e);
    return {
      doc: e.cmd.apply(doc),
      label: e.cmd.label,
      message: e.cmd.redoMessage ?? `Opnieuw: ${e.cmd.label.toLowerCase()}`,
    };
  }

  /** Sluit de huidige samenvoeg-reeks af (bv. bij het loslaten van de muis). */
  seal(): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top) top.at = -Infinity;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get undoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.cmd.label;
  }
  get redoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.cmd.label;
  }
}
