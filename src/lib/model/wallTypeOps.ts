/**
 * Eigen muurtypes bewaren en verwijderen. Wijzigt de dikte van een type dat
 * al gebruikt wordt, dan passen al die muren mee aan: een gevel houdt de maat
 * van de kamer erachter, een muur tussen twee kamers blijft in het midden.
 */
import { analyzeFloor, setWallThickness } from "../geometry/plan";
import type { ProjectDoc } from "./types";
import { setCustomWallTypes, typeThickness, type WallType } from "./wallTypes";

export function newCustomTypeId(): string {
  return `eigen-${globalThis.crypto.randomUUID()}`;
}

/** Hoeveel muren (over alle verdiepingen) dit type gebruiken. */
export function typeUsage(doc: ProjectDoc, id: string): number {
  return doc.floors.reduce((n, f) => n + f.walls.filter((w) => w.type === id).length, 0);
}

export function saveWallType(doc: ProjectDoc, t: WallType): ProjectDoc {
  const list = doc.settings.customWallTypes ?? [];
  const types = list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t];
  // eerst aanmelden, zodat de berekening hieronder de nieuwe lagen kent
  setCustomWallTypes(types);
  const total = typeThickness(t);
  const floors = doc.floors.map((f) => {
    const ids = f.walls.filter((w) => w.type === t.id && w.thickness !== total).map((w) => w.id);
    if (ids.length === 0) return f;
    const a = analyzeFloor(f);
    const anchor = (wallId: string) => {
      const rooms = a.rooms.filter((r) => r.edgeWalls.includes(wallId));
      return rooms.length === 1 ? rooms[0].room.id : null;
    };
    return setWallThickness(f, ids, total, anchor);
  });
  const d = doc.settings.wallDefaults;
  const wallDefaults = {
    ...d,
    exterior: d.exteriorType === t.id ? total : d.exterior,
    interior: d.interiorType === t.id ? total : d.interior,
  };
  return { ...doc, floors, settings: { ...doc.settings, customWallTypes: types, wallDefaults } };
}

/** Enkel een ongebruikt type dat geen standaard is, kan weg. */
export function canDeleteWallType(doc: ProjectDoc, id: string): boolean {
  const d = doc.settings.wallDefaults;
  return typeUsage(doc, id) === 0 && d.exteriorType !== id && d.interiorType !== id;
}

export function deleteWallType(doc: ProjectDoc, id: string): ProjectDoc {
  const types = (doc.settings.customWallTypes ?? []).filter((t) => t.id !== id);
  return { ...doc, settings: { ...doc.settings, customWallTypes: types } };
}
