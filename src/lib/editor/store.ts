import { History, type Command } from "../history/history";
import type { Id, ProjectDoc } from "../model/types";

/**
 * De toestand van de editor buiten React, zodat ze testbaar is en elke
 * component er zuinig op kan inschrijven (useSyncExternalStore).
 */
export interface EditorState {
  doc: ProjectDoc;
  activeFloorId: Id;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

export class EditorStore {
  private history = new History<ProjectDoc>();
  private listeners = new Set<() => void>();
  private state: EditorState;
  private onDocChange?: (doc: ProjectDoc) => void;

  constructor(doc: ProjectDoc) {
    this.state = this.compose(doc, doc.floors[0].id);
  }

  private compose(doc: ProjectDoc, activeFloorId: Id): EditorState {
    const active = doc.floors.some((f) => f.id === activeFloorId)
      ? activeFloorId
      : doc.floors[0].id;
    return {
      doc,
      activeFloorId: active,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      undoLabel: this.history.undoLabel,
      redoLabel: this.history.redoLabel,
    };
  }

  getState = (): EditorState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(doc: ProjectDoc, activeFloorId = this.state.activeFloorId) {
    const docChanged = doc !== this.state.doc;
    this.state = this.compose(doc, activeFloorId);
    this.listeners.forEach((l) => l());
    if (docChanged) this.onDocChange?.(doc);
  }

  execute(cmd: Command<ProjectDoc>): void {
    const doc = this.history.execute(this.state.doc, cmd);
    this.set(doc);
  }

  /** Geeft een melding in gewone taal terug van wat er teruggedraaid werd. */
  undo(): string | null {
    const r = this.history.undo(this.state.doc);
    if (!r) return null;
    this.set(r.doc);
    return r.message;
  }

  redo(): string | null {
    const r = this.history.redo(this.state.doc);
    if (!r) return null;
    this.set(r.doc);
    return r.message;
  }

  /**
   * Vervangt het document zonder ongedaan-maak-stap (bv. de versie uit een ander
   * venster laden). De geschiedenis begint dan opnieuw.
   */
  reset(doc: ProjectDoc): void {
    this.history = new History<ProjectDoc>();
    this.state = this.compose(doc, this.state.activeFloorId);
    this.listeners.forEach((l) => l());
  }

  /** Laat een functie weten wanneer het document verandert; geeft een opruimfunctie terug. */
  listenToDoc(fn: (doc: ProjectDoc) => void): () => void {
    this.onDocChange = fn;
    return () => {
      if (this.onDocChange === fn) this.onDocChange = undefined;
    };
  }

  seal(): void {
    this.history.seal();
  }

  setActiveFloor(id: Id): void {
    if (id !== this.state.activeFloorId) this.set(this.state.doc, id);
  }
}
