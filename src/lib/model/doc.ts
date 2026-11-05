import { addRectangle, functionLabel } from "../geometry/plan";
import { cleanItem } from "../furniture/place";
import { cleanFrame, cleanFrameType, type FrameType } from "./frames";
import { cleanWallType, DEFAULT_EXTERIOR_TYPE, DEFAULT_INTERIOR_TYPE, typeForThickness, typeThickness, wallType, type WallType } from "./wallTypes";
import {
  SCHEMA_VERSION,
  type Floor,
  type Item,
  type ProjectDoc,
  type ProjectSettings,
  type StartChoice,
} from "./types";

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export const DEFAULT_FLOOR_HEIGHT = 2600;
/** Vloer tot vloer: plafondhoogte + vloerpakket en draagvloer. */
export const DEFAULT_STOREY = 2900;

/** Gangbare Belgische opbouw: spouwmuur van 38 cm en een binnenmuur van 9 cm. */
export const DEFAULT_SETTINGS: ProjectSettings = {
  snapToGrid: true,
  gridSize: 50,
  measureMode: "inside",
  wallDefaults: {
    exterior: typeThickness(wallType(DEFAULT_EXTERIOR_TYPE)!),
    interior: typeThickness(wallType(DEFAULT_INTERIOR_TYPE)!),
    exteriorType: DEFAULT_EXTERIOR_TYPE,
    interiorType: DEFAULT_INTERIOR_TYPE,
  },
  northAngle: 0,
};

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

export function createDoc(name: string, start: StartChoice = { kind: "house" }): ProjectDoc {
  const doc: ProjectDoc = {
    schemaVersion: SCHEMA_VERSION,
    name,
    start,
    settings: structuredClone(DEFAULT_SETTINGS),
    floors: [createFloor("Gelijkvloers")],
  };
  return withStartRoom(doc);
}

/**
 * "Eén kamer inrichten": teken de kamer meteen, met de opgegeven binnenmaten
 * en buitenmuren rondom.
 */
export function withStartRoom(doc: ProjectDoc): ProjectDoc {
  const start = doc.start;
  if (start.kind !== "room" || doc.floors.some((f) => f.walls.length > 0)) return doc;
  const t = doc.settings.wallDefaults.exterior;
  const floor = doc.floors[0];
  const built = addRectangle(
    floor,
    { x: -t / 2, y: -t / 2 },
    { x: start.width + t / 2, y: start.depth + t / 2 },
    { thickness: t, height: floor.height, kind: "exterior", loadBearing: true, type: doc.settings.wallDefaults.exteriorType },
  );
  const label = functionLabel(start.roomFunction);
  const rooms = built.rooms.map((r) => ({
    ...r,
    name: start.roomFunction === "andere" ? "Kamer" : label,
    function: start.roomFunction,
  }));
  return { ...doc, floors: [{ ...built, rooms }, ...doc.floors.slice(1)] };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function migrateStart(raw: unknown): StartChoice {
  const r = raw as Partial<StartChoice> | undefined;
  if (r?.kind === "room") {
    const room = r as Partial<Extract<StartChoice, { kind: "room" }>>;
    if (isNum(room.width) && isNum(room.depth))
      return {
        kind: "room",
        width: room.width,
        depth: room.depth,
        roomFunction: typeof room.roomFunction === "string" ? room.roomFunction : "living",
      };
  }
  if (r?.kind === "trace" || r?.kind === "example") return { kind: r.kind };
  return { kind: "house" };
}

/**
 * Zet een bewaard document om naar de huidige versie.
 * v1 → v2: startkeuze, standaardmuren, maatafspraak en noordrichting aangevuld.
 * v2 → v3: de kamer uit de startvraag wordt eenmalig getekend.
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
  const s = (r.settings ?? {}) as Partial<ProjectSettings>;
  const fromVersion = typeof r.schemaVersion === "number" ? r.schemaVersion : 1;
  const migrated: ProjectDoc = {
    schemaVersion: SCHEMA_VERSION,
    name: typeof r.name === "string" && r.name.trim() ? r.name : fallbackName,
    start: migrateStart(r.start),
    settings: {
      ...DEFAULT_SETTINGS,
      ...s,
      measureMode: "inside",
      // vóór v4 had een project enkel diktes: neem de nieuwe standaardopbouw
      wallDefaults:
        fromVersion < 4 ? { ...DEFAULT_SETTINGS.wallDefaults } : { ...DEFAULT_SETTINGS.wallDefaults, ...(s.wallDefaults ?? {}) },
      northAngle: isNum(s.northAngle) ? normalizeAngle(s.northAngle) : 0,
      customWallTypes: Array.isArray(s.customWallTypes)
        ? s.customWallTypes.map(cleanWallType).filter((t): t is WallType => t !== null)
        : [],
      customFrameTypes: Array.isArray(s.customFrameTypes)
        ? s.customFrameTypes.map(cleanFrameType).filter((t): t is FrameType => t !== null)
        : [],
    },
    floors: floors.map((f, i) => {
      const floor = { ...createFloor(`Verdieping ${i}`), ...f };
      // v3 → v4: bestaande muren krijgen de opbouw die bij hun dikte past (35 cm = spouwmuur…)
      if (fromVersion < 4)
        floor.walls = floor.walls.map((w) => {
          const type = w.type ?? typeForThickness(w.thickness, w.kind);
          return type ? { ...w, type } : w;
        });
      // meubels nakijken (onbekende of kapotte vallen weg)
      floor.items = (Array.isArray(floor.items) ? floor.items : []).map(cleanItem).filter((x): x is Item => x !== null);
      // samengestelde ramen nakijken (een kapotte samenstelling valt weg: dan een gewoon raam)
      floor.openings = (floor.openings ?? []).map((o) => {
        if (o.frame === undefined) return o;
        const frame = cleanFrame(o.frame);
        if (frame) return { ...o, frame };
        const { frame: _f, frameType: _t, ...rest } = o;
        void _f;
        void _t;
        return rest;
      });
      return floor;
    }),
  };
  // v2 → v3: een "één kamer"-project van vóór het tekenen krijgt eenmalig zijn muren
  return fromVersion < 3 ? withStartRoom(migrated) : migrated;
}

export function normalizeAngle(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/** Verdiepingen van onder naar boven. */
export function floorsBottomUp(doc: ProjectDoc): Floor[] {
  return [...doc.floors].sort((a, b) => a.elevation - b.elevation);
}

/** Naam voor een nieuwe verdieping op basis van het peil. */
export function floorNameFor(doc: ProjectDoc, where: "above" | "below"): string {
  const sorted = floorsBottomUp(doc);
  if (where === "below") {
    const basements = sorted.filter((f) => f.elevation < 0).length;
    return basements === 0 ? "Kelder" : `Kelder ${basements + 1}`;
  }
  const above = sorted.filter((f) => f.elevation > 0).length;
  if (sorted.length === 0) return "Gelijkvloers";
  return `${above + 1}e verdieping`;
}
