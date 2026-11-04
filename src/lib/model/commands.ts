import type { Command } from "../history/history";
import { createFloor, DEFAULT_STOREY, floorNameFor, floorsBottomUp, normalizeAngle } from "./doc";
import type { Floor, Id, ProjectDoc, ProjectSettings, WallDefaults } from "./types";

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
      mapFloor(d, floorId, (f) => (keys.every((k) => f[k] === to[k]) ? f : { ...f, ...to })),
    revert: (d) => mapFloor(d, floorId, (f) => ({ ...f, ...from })),
  };
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
