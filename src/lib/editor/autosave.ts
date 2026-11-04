/**
 * Bewaart automatisch kort nadat de gebruiker stopt met werken.
 * - wacht `delayMs` na de laatste wijziging (debounce), maar nooit langer dan `maxWaitMs`;
 * - nooit twee bewaaroperaties tegelijk; een wijziging tijdens het bewaren
 *   zorgt voor een nieuwe ronde erna;
 * - bij een fout: status "fout" en na `retryMs` opnieuw proberen.
 */

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

export interface AutosaveOptions<D> {
  save: (doc: D) => Promise<void>;
  onStatus: (s: SaveStatus) => void;
  delayMs?: number;
  maxWaitMs?: number;
  retryMs?: number;
}

export class Autosaver<D> {
  private pending: D | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstDirtyAt: number | null = null;
  private inFlight: Promise<void> | null = null;
  private status: SaveStatus = "saved";
  private readonly delayMs: number;
  private readonly maxWaitMs: number;
  private readonly retryMs: number;

  constructor(private readonly opts: AutosaveOptions<D>) {
    this.delayMs = opts.delayMs ?? 800;
    this.maxWaitMs = opts.maxWaitMs ?? 5000;
    this.retryMs = opts.retryMs ?? 4000;
  }

  get current(): SaveStatus {
    return this.status;
  }

  get hasUnsaved(): boolean {
    return this.pending !== null || this.inFlight !== null;
  }

  private setStatus(s: SaveStatus) {
    if (s !== this.status) {
      this.status = s;
      this.opts.onStatus(s);
    }
  }

  /** Meld een nieuwe versie van het document. */
  change(doc: D): void {
    this.pending = doc;
    if (this.status !== "saving") this.setStatus("dirty");
    const now = Date.now();
    this.firstDirtyAt ??= now;
    const waited = now - this.firstDirtyAt;
    const delay = Math.max(0, Math.min(this.delayMs, this.maxWaitMs - waited));
    this.schedule(delay);
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  /** Bewaar nu (bv. bij het verlaten van de pagina). */
  async flush(): Promise<void> {
    if (this.inFlight) {
      await this.inFlight;
      if (this.pending !== null && this.inFlight === null) return this.flush();
      return;
    }
    if (this.pending === null) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const doc = this.pending;
    this.pending = null;
    this.firstDirtyAt = null;
    this.setStatus("saving");
    this.inFlight = (async () => {
      try {
        await this.opts.save(doc);
        this.inFlight = null;
        if (this.pending !== null) {
          this.setStatus("dirty");
          this.schedule(0);
        } else {
          this.setStatus("saved");
        }
      } catch {
        this.inFlight = null;
        // niets verliezen: de nieuwste versie blijft klaarstaan
        this.pending ??= doc;
        this.setStatus("error");
        this.schedule(this.retryMs);
      }
    })();
    await this.inFlight;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
