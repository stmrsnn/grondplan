/**
 * Samengestelde ramen en deuren: een kader met vakken naast elkaar (vast,
 * draaikiep, deur…) en eventueel een bovenlicht. Zo teken je "vast raam met
 * draaikiep ernaast" of "glazen deur met een vast zijlicht".
 *
 * De vakken staan van links naar rechts zoals je ze van binnen ziet. Alle
 * maten in mm.
 */

export type SashType = "vast" | "draaikiep" | "draai" | "kiep" | "schuif" | "deur";

export interface Sash {
  type: SashType;
  /** Breedte van het vak (zijn deel van de totale breedte); leeg = vanzelf. */
  width?: number;
  /** Draaien en deuren: scharnieren links of rechts. Schuiven: schuift open naar links of rechts. */
  hinge?: "left" | "right";
  /** Deur: met glas (anders een volle deur). */
  glass?: boolean;
}

export interface Transom {
  /** Hoogte van het bovenlicht, binnen de totale hoogte. */
  height: number;
  type: "vast" | "kiep";
}

export interface Frame {
  sashes: Sash[];
  transom?: Transom;
}

/** Een raam of deur om te kiezen: ingebouwd of zelf samengesteld. */
export interface FrameType {
  id: string;
  name: string;
  frame: Frame;
  width: number;
  height: number;
  sillHeight: number;
  /** Standaardbreedtes om uit te kiezen. */
  widths?: number[];
}

export const SASH_LABEL: Record<SashType, string> = {
  vast: "Vast",
  draaikiep: "Draaikiep",
  draai: "Draaiend",
  kiep: "Kiep",
  schuif: "Schuivend",
  deur: "Deur",
};

export const SASH_TYPES: SashType[] = ["vast", "draaikiep", "draai", "kiep", "schuif", "deur"];

/** Zichtbare breedte van een buitenstijl en van een tussenstijl (mm). */
export const FRAME_STILE = 60;
export const MULLION = 80;
/** Kleinste vak dat nog zinvol is. */
export const MIN_SASH = 200;

export const hasDoor = (f: Frame): boolean => f.sashes.some((s) => s.type === "deur");
export const opensInward = (t: SashType): boolean => t === "draai" || t === "draaikiep" || t === "deur";

/**
 * Breedte van elk vak. Vakken met een eigen maat houden die; de andere
 * verdelen wat overblijft. Past het niet, dan schalen alle vakken mee.
 */
export function sashWidths(frame: Frame, total: number): number[] {
  const n = frame.sashes.length;
  if (n === 0) return [];
  const fixed = frame.sashes.reduce((s, x) => s + (x.width ?? 0), 0);
  const autos = frame.sashes.filter((x) => !x.width).length;
  const rest = total - fixed;
  if (autos > 0 && rest >= autos * MIN_SASH) return frame.sashes.map((x) => x.width ?? rest / autos);
  // te krap of alles vast: alles in verhouding
  const weights = frame.sashes.map((x) => x.width ?? (fixed > 0 ? fixed / Math.max(1, n - autos) : 1));
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => (w / sum) * total);
}

/** Totale breedte als alle vakken een maat hebben, anders null. */
export function fixedTotal(frame: Frame): number | null {
  return frame.sashes.every((s) => s.width) ? frame.sashes.reduce((s, x) => s + (x.width ?? 0), 0) : null;
}

/** Spiegelen: links wordt rechts (de volgorde en de scharnieren). */
export function mirrorFrame(f: Frame): Frame {
  return {
    ...f,
    sashes: [...f.sashes].reverse().map((s) => (s.hinge ? { ...s, hinge: s.hinge === "left" ? "right" : "left" } : s)),
  };
}

/** Aandeel van de breedte met glas (een volle deur heeft geen glas). */
export function glassShare(f: Frame, total: number): number {
  const ws = sashWidths(f, total);
  const glass = f.sashes.reduce((s, x, i) => s + (x.type === "deur" && !x.glass ? 0 : ws[i]), 0);
  return total > 0 ? glass / total : 0;
}

/** Korte omschrijving: "Vast + draaikiep", "Deur + vast". */
export function describeFrame(f: Frame): string {
  const parts = f.sashes.map((s) => (s.type === "deur" ? (s.glass ? "glazen deur" : "deur") : SASH_LABEL[s.type].toLowerCase()));
  const text = parts.join(" + ");
  const withTop = f.transom ? `${text}, bovenlicht` : text;
  return withTop.charAt(0).toUpperCase() + withTop.slice(1);
}

/* ------------------------------------------------------------------ */
/* Ingebouwde soorten                                                   */
/* ------------------------------------------------------------------ */

const s = (type: SashType, extra: Partial<Sash> = {}): Sash => ({ type, ...extra });

export const FRAME_PRESETS: FrameType[] = [
  { id: "vast", name: "Vast raam", frame: { sashes: [s("vast")] }, width: 1200, height: 1350, sillHeight: 900, widths: [600, 900, 1200, 1500, 2000] },
  {
    id: "draaikiep",
    name: "Draaikiepraam",
    frame: { sashes: [s("draaikiep", { hinge: "left" })] },
    width: 900,
    height: 1350,
    sillHeight: 900,
    widths: [600, 800, 900, 1000, 1200],
  },
  {
    id: "vast-draaikiep",
    name: "Vast + draaikiep",
    frame: { sashes: [s("vast"), s("draaikiep", { hinge: "right" })] },
    width: 1800,
    height: 1350,
    sillHeight: 900,
    widths: [1200, 1500, 1800, 2100, 2400],
  },
  {
    id: "drieluik",
    name: "Driedelig raam",
    frame: { sashes: [s("draaikiep", { hinge: "left" }), s("vast"), s("draaikiep", { hinge: "right" })] },
    width: 2400,
    height: 1350,
    sillHeight: 900,
    widths: [1800, 2100, 2400, 3000],
  },
  {
    id: "openslaand",
    name: "Openslaand raam",
    frame: { sashes: [s("draai", { hinge: "left" }), s("draaikiep", { hinge: "right" })] },
    width: 1200,
    height: 1350,
    sillHeight: 900,
    widths: [1000, 1200, 1400, 1600],
  },
  {
    id: "kiep",
    name: "Kiepraam",
    frame: { sashes: [s("kiep")] },
    width: 900,
    height: 500,
    sillHeight: 1600,
    widths: [600, 800, 900, 1200],
  },
  {
    id: "bovenlicht",
    name: "Raam met bovenlicht",
    frame: { sashes: [s("vast"), s("draaikiep", { hinge: "right" })], transom: { height: 450, type: "kiep" } },
    width: 1800,
    height: 1800,
    sillHeight: 450,
    widths: [1200, 1500, 1800, 2400],
  },
  {
    id: "raamdeur",
    name: "Raamdeur",
    frame: { sashes: [s("deur", { hinge: "left", glass: true }), s("deur", { hinge: "right", glass: true })] },
    width: 1600,
    height: 2150,
    sillHeight: 0,
    widths: [1200, 1400, 1600, 1800],
  },
];

export const DOOR_PRESETS: FrameType[] = [
  {
    id: "glasdeur",
    name: "Glazen deur",
    frame: { sashes: [s("deur", { hinge: "left", glass: true })] },
    width: 1000,
    height: 2150,
    sillHeight: 0,
    widths: [900, 1000, 1100],
  },
  {
    id: "deur-zijlicht",
    name: "Deur + zijlicht",
    frame: { sashes: [s("deur", { hinge: "left", width: 1000 }), s("vast")] },
    width: 1400,
    height: 2150,
    sillHeight: 0,
    widths: [1300, 1400, 1600, 1800],
  },
  {
    id: "glasdeur-vast",
    name: "Glazen deur + vast raam",
    frame: { sashes: [s("deur", { hinge: "left", glass: true, width: 1000 }), s("vast")] },
    width: 2000,
    height: 2150,
    sillHeight: 0,
    widths: [1600, 2000, 2400, 3000],
  },
  {
    id: "voordeur",
    name: "Voordeur met zijlichten",
    frame: { sashes: [s("vast"), s("deur", { hinge: "left", width: 1050 }), s("vast")] },
    width: 1850,
    height: 2250,
    sillHeight: 0,
    widths: [1650, 1850, 2050],
  },
];

const PRESET_BY_ID = new Map([...FRAME_PRESETS, ...DOOR_PRESETS].map((t) => [t.id, t]));

/* ------------------------------------------------------------------ */
/* Eigen soorten (per project, zoals de muurtypes)                      */
/* ------------------------------------------------------------------ */

let custom = new Map<string, FrameType>();

export function setCustomFrameTypes(types: readonly FrameType[] | undefined): void {
  const next = new Map((types ?? []).map((t) => [t.id, t]));
  const same = next.size === custom.size && [...next].every(([id, t]) => JSON.stringify(custom.get(id)) === JSON.stringify(t));
  if (!same) custom = next;
}

export function customFrameTypes(): FrameType[] {
  return [...custom.values()];
}

export function frameType(id: string | undefined): FrameType | null {
  return (id && (custom.get(id) ?? PRESET_BY_ID.get(id))) || null;
}

export function isCustomFrameType(id: string | undefined): boolean {
  return !!id && custom.has(id);
}

/* ------------------------------------------------------------------ */
/* Nakijken van bewaarde gegevens                                       */
/* ------------------------------------------------------------------ */

const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : undefined;

export function cleanFrame(raw: unknown): Frame | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Frame>;
  const sashes = (Array.isArray(r.sashes) ? r.sashes : [])
    .slice(0, 8)
    .filter((x): x is Sash => !!x && SASH_TYPES.includes((x as Sash).type))
    .map((x) => {
      const out: Sash = { type: x.type };
      const w = num(x.width, 0, 6000);
      if (w && w >= MIN_SASH) out.width = w;
      if (x.type !== "vast" && x.type !== "kiep") out.hinge = x.hinge === "right" ? "right" : "left";
      if (x.type === "deur" && x.glass) out.glass = true;
      return out;
    });
  if (sashes.length === 0) return null;
  const frame: Frame = { sashes };
  const th = r.transom && num(r.transom.height, 150, 1500);
  if (th) frame.transom = { height: th, type: r.transom!.type === "kiep" ? "kiep" : "vast" };
  return frame;
}

export function cleanFrameType(raw: unknown): FrameType | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<FrameType>;
  if (typeof r.id !== "string" || !r.id.startsWith("eigen-") || typeof r.name !== "string") return null;
  const frame = cleanFrame(r.frame);
  if (!frame) return null;
  return {
    id: r.id,
    name: r.name.slice(0, 60) || "Eigen raam",
    frame,
    width: num(r.width, 300, 8000) ?? 1200,
    height: num(r.height, 300, 4000) ?? 1350,
    sillHeight: hasDoor(frame) ? 0 : (num(r.sillHeight, 0, 3000) ?? 900),
  };
}
