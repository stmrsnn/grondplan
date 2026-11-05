import type { ProjectDoc } from "@/lib/model/types";

/**
 * Alles wat de editor nodig heeft om te bewaren, los van Supabase, zodat
 * de proefbank (zonder aanmelden) en testen dezelfde editor kunnen gebruiken.
 */
export interface EditorBackend {
  /** Bewaart; gooit SaveConflict als het project elders gewijzigd werd. */
  save(doc: ProjectDoc): Promise<void>;
  /** Laadt de nieuwste versie uit de database (na een conflict). */
  loadLatest(): Promise<ProjectDoc>;
  /** Maakt het mogelijk om na een conflict toch de eigen versie te bewaren. */
  takeOver(): Promise<void>;
  listVersions(): Promise<{ id: string; label: string; created_at: string }[]>;
  loadVersion(id: string): Promise<ProjectDoc>;
  addVersion(doc: ProjectDoc, label: string): Promise<void>;
  /** Bewaart een onderlegger (afbeelding) en geeft de verwijzing terug. */
  uploadUnderlay(blob: Blob): Promise<string>;
  /** Link om een bewaarde onderlegger te tonen. */
  underlayUrl(src: string): Promise<string>;
}
