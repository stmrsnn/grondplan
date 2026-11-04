import { SCHEMA_VERSION, type Floor, type ProjectDoc } from "./types";

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export const DEFAULT_FLOOR_HEIGHT = 2600;
export const DEFAULT_STOREY = 2900; // vloer tot vloer, incl. vloerpakket

export function createFloor(name: string, elevation = 0): Floor {
  return {
    id: newId(),
    name,
    elevation,
    height: DEFAULT_FLOOR_HEIGHT,
    nodes: [],
    walls: [],
    openings: [],
    rooms: [],
    items: [],
  };
}

export function createDoc(name: string): ProjectDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    settings: { snapToGrid: true, gridSize: 50 },
    floors: [createFloor("Gelijkvloers")],
  };
}

/**
 * Zet een bewaard document om naar de huidige versie.
 * Elke toekomstige schemawijziging krijgt hier een stap (v1 → v2 → …).
 * Ontbrekende of kapotte velden worden aangevuld zodat de app nooit crasht.
 */
export function migrateDoc(raw: unknown, fallbackName = "Naamloos project"): ProjectDoc {
  const base = createDoc(fallbackName);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ProjectDoc> & { schemaVersion?: number };
  if (typeof r.schemaVersion === "number" && r.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      "Dit project werd gemaakt met een nieuwere versie van Plattegrond. Herlaad de pagina.",
    );
  }
  const floors = Array.isArray(r.floors) && r.floors.length > 0 ? r.floors : base.floors;
  return {
    schemaVersion: SCHEMA_VERSION,
    name: typeof r.name === "string" && r.name.trim() ? r.name : fallbackName,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    floors: floors.map((f, i) => ({
      ...createFloor(`Verdieping ${i}`),
      ...f,
    })),
  };
}

/** Naam voor een nieuwe verdieping op basis van wat er al is. */
export function nextFloorName(doc: ProjectDoc): string {
  const n = doc.floors.length;
  if (n === 0) return "Gelijkvloers";
  return `${n}e verdieping`;
}
