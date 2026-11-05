import type { Command } from "../history/history";
import { createFloor, DEFAULT_STOREY, floorNameFor, floorsBottomUp, normalizeAngle } from "./doc";
import type { Floor, Id, ProjectDoc, ProjectSettings, Room, Wall, WallDefaults } from "./types";

type Cmd = Command<ProjectDoc>;

function mapFloor(doc: ProjectDoc, id: Id, fn: (f: Floor) => Floor): ProjectDoc {
  let changed = false;
  const floors = doc.floors.map((f) => {
    if (f.id !== id) return f;
    const nf = fn(f);
    if (nf !== f) changed = true;
    return nf;
  });
  return changed ? { ...doc, floors } : doc;
}

export function renameProject(from: string, to: string): Cmd {
  return {
    label: "Projectnaam gewijzigd",
    undoMessage: `Naam teruggezet naar "${from}"`,
    redoMessage: `Naam opnieuw "${to}"`,
    mergeKey: "project-name",
    apply: (d) => (d.name === to ? d : { ...d, name: to }),
    revert: (d) => ({ ...d, name: from }),
  };
}

function settingsCmd(
  from: ProjectSettings,
  to: ProjectSettings,
  what: string,
  mergeKey?: string,
): Cmd {
  return {
    label: `${what} gewijzigd`,
    undoMessage: `${what}: vorige instelling teruggezet`,
    redoMessage: `${what}: wijziging opnieuw toegepast`,
    mergeKey,
    apply: (d) => (JSON.stringify(d.settings) === JSON.stringify(to) ? d : { ...d, settings: to }),
    revert: (d) => ({ ...d, settings: from }),
  };
}

export function setSnap(s: ProjectSettings, snapToGrid: boolean): Cmd {
  return settingsCmd(s, { ...s, snapToGrid }, "Magnetisch raster");
}

export function setWallDefaults(s: ProjectSettings, wallDefaults: WallDefaults): Cmd {
  return settingsCmd(s, { ...s, wallDefaults }, "Standaard muurdikte");
}

export function setNorth(s: ProjectSettings, angle: number): Cmd {
  return settingsCmd(s, { ...s, northAngle: normalizeAngle(angle) }, "Noordrichting", "north");
}

/** Voegt een verdieping toe bovenop de hoogste, of een kelder onder de laagste. */
export function addFloor(
  doc: ProjectDoc,
  where: "above" | "below" = "above",
): { cmd: Cmd; floorId: Id } {
  const sorted = floorsBottomUp(doc);
  const ref = where === "above" ? sorted[sorted.length - 1] : sorted[0];
  const elevation = ref ? ref.elevation + (where === "above" ? DEFAULT_STOREY : -DEFAULT_STOREY) : 0;
  const floor = createFloor(floorNameFor(doc, where), elevation);
  return {
    floorId: floor.id,
    cmd: {
      label: `${floor.name} toegevoegd`,
      undoMessage: `${floor.name} weer weggehaald`,
      redoMessage: `${floor.name} terug toegevoegd`,
      apply: (d) => ({ ...d, floors: [...d.floors, floor] }),
      revert: (d) => ({ ...d, floors: d.floors.filter((f) => f.id !== floor.id) }),
    },
  };
}

export function removeFloor(doc: ProjectDoc, id: Id): Cmd | null {
  const index = doc.floors.findIndex((f) => f.id === id);
  if (index < 0 || doc.floors.length <= 1) return null; // er blijft altijd één verdieping
  const floor = doc.floors[index];
  return {
    label: `${floor.name} verwijderd`,
    undoMessage: `${floor.name} teruggezet`,
    redoMessage: `${floor.name} weer verwijderd`,
    apply: (d) => ({ ...d, floors: d.floors.filter((f) => f.id !== id) }),
    revert: (d) => {
      const floors = [...d.floors];
      floors.splice(Math.min(index, floors.length), 0, floor);
      return { ...d, floors };
    },
  };
}

type FloorFields = Partial<Pick<Floor, "name" | "elevation" | "height">>;

const FIELD_NAMES: Record<keyof FloorFields, string> = {
  name: "naam",
  elevation: "vloerpeil",
  height: "plafondhoogte",
};

export function updateFloor(floorId: Id, from: FloorFields, to: FloorFields, floorName: string): Cmd {
  const keys = Object.keys(to) as (keyof FloorFields)[];
  const what = keys.map((k) => FIELD_NAMES[k]).join(" en ");
  return {
    label: `${floorName}: ${what} aangepast`,
    undoMessage: `${floorName}: vorige ${what} teruggezet`,
    redoMessage: `${floorName}: nieuwe ${what} opnieuw toegepast`,
    mergeKey: `floor:${floorId}:${keys.sort().join(",")}`,
    apply: (d) =>
      mapFloor(d, floorId, (f) =>
        keys.every((k) => f[k] === to[k]) ? f : withWallHeights({ ...f, ...to }, from.height, to.height),
      ),
    revert: (d) =>
      mapFloor(d, floorId, (f) => withWallHeights({ ...f, ...from }, to.height, from.height)),
  };
}

/** Muren die de plafondhoogte volgden, volgen mee naar de nieuwe hoogte. */
function withWallHeights(f: Floor, from?: number, to?: number): Floor {
  if (from === undefined || to === undefined || from === to) return f;
  return { ...f, walls: f.walls.map((w) => (w.height === from ? { ...w, height: to } : w)) };
}

/** Zet een eerdere versie terug als één stap die je ook weer ongedaan kan maken. */
export function restoreVersion(current: ProjectDoc, version: ProjectDoc, when: string): Cmd {
  return {
    label: `Versie van ${when} teruggezet`,
    undoMessage: "Terug naar hoe het was vóór het terugzetten",
    redoMessage: `Versie van ${when} opnieuw teruggezet`,
    apply: () => version,
    revert: () => current,
  };
}

/**
 * Elke tekenhandeling (muur, kamer, verslepen, maat aanpassen) vervangt de
 * verdieping door een nieuwe versie. Omdat verdiepingen onveranderlijk zijn,
 * bewaart dit enkel twee verwijzingen: snel en zuinig, ook bij grote plannen.
 */
export function editFloor(
  before: Floor,
  after: Floor,
  label: string,
  undoMessage?: string,
  redoMessage?: string,
): Cmd {
  return {
    label,
    undoMessage: undoMessage ?? `Teruggedraaid: ${label.toLowerCase()}`,
    redoMessage: redoMessage ?? `Opnieuw: ${label.toLowerCase()}`,
    apply: (d) =>
      before === after
        ? d
        : { ...d, floors: d.floors.map((f) => (f.id === before.id ? after : f)) },
    revert: (d) => ({ ...d, floors: d.floors.map((f) => (f.id === before.id ? before : f)) }),
  };
}

/** Eigenschappen van een ruimte (naam, functie, vloer) aanpassen. */
export function updateRoom(
  floorId: Id,
  roomId: Id,
  from: Partial<Pick<Room, "name" | "function" | "floorFinish" | "wallColor">>,
  to: Partial<Pick<Room, "name" | "function" | "floorFinish" | "wallColor">>,
): Cmd {
  const keys = Object.keys(to) as (keyof typeof to)[];
  return {
    label: "Ruimte aangepast",
    undoMessage: "Ruimte: vorige gegevens teruggezet",
    redoMessage: "Ruimte: wijziging opnieuw toegepast",
    mergeKey: `room:${roomId}:${keys.sort().join(",")}`,
    apply: (d) =>
      mapFloor(d, floorId, (f) => ({
        ...f,
        rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, ...to } : r)),
      })),
    revert: (d) =>
      mapFloor(d, floorId, (f) => ({
        ...f,
        rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, ...from } : r)),
      })),
  };
}

/** Eigenschappen van een muur (dikte, hoogte, dragend) aanpassen. */
export function updateWall(
  floorId: Id,
  wallId: Id,
  from: Partial<Pick<Wall, "thickness" | "height" | "loadBearing">>,
  to: Partial<Pick<Wall, "thickness" | "height" | "loadBearing">>,
  what: string,
): Cmd {
  return {
    label: `Muur: ${what} aangepast`,
    undoMessage: `Muur: vorige ${what} teruggezet`,
    redoMessage: `Muur: nieuwe ${what} opnieuw toegepast`,
    apply: (d) =>
      mapFloor(d, floorId, (f) => ({
        ...f,
        walls: f.walls.map((w) => (w.id === wallId ? { ...w, ...to } : w)),
      })),
    revert: (d) =>
      mapFloor(d, floorId, (f) => ({
        ...f,
        walls: f.walls.map((w) => (w.id === wallId ? { ...w, ...from } : w)),
      })),
  };
}

/** Een wijziging over het hele document (bv. een muurtype met al zijn muren). */
export function docCmd(before: ProjectDoc, after: ProjectDoc, label: string, undoMessage: string, redoMessage: string): Cmd {
  return {
    label,
    undoMessage,
    redoMessage,
    apply: () => after,
    revert: () => before,
  };
}

export function setFacade(s: ProjectSettings, facade: string): Cmd {
  return settingsCmd(s, { ...s, facade }, "Gevel");
}
