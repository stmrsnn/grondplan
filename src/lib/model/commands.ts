import type { Command } from "../history/history";
import { createFloor, DEFAULT_STOREY, nextFloorName } from "./doc";
import type { Floor, Id, ProjectDoc, ProjectSettings } from "./types";

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
    mergeKey: "project-name",
    apply: (d) => (d.name === to ? d : { ...d, name: to }),
    revert: (d) => ({ ...d, name: from }),
  };
}

export function changeSettings(from: ProjectSettings, to: ProjectSettings): Cmd {
  return {
    label: "Instelling gewijzigd",
    apply: (d) => ({ ...d, settings: to }),
    revert: (d) => ({ ...d, settings: from }),
  };
}

/** Voegt een verdieping toe bovenop de hoogste. */
export function addFloor(doc: ProjectDoc): { cmd: Cmd; floorId: Id } {
  const top = doc.floors.reduce<Floor | undefined>(
    (a, f) => (!a || f.elevation > a.elevation ? f : a),
    undefined,
  );
  const floor = createFloor(nextFloorName(doc), top ? top.elevation + DEFAULT_STOREY : 0);
  return {
    floorId: floor.id,
    cmd: {
      label: "Verdieping toegevoegd",
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
    apply: (d) => ({ ...d, floors: d.floors.filter((f) => f.id !== id) }),
    revert: (d) => {
      const floors = [...d.floors];
      floors.splice(Math.min(index, floors.length), 0, floor);
      return { ...d, floors };
    },
  };
}

export function updateFloor(
  floorId: Id,
  from: Partial<Pick<Floor, "name" | "elevation" | "height">>,
  to: Partial<Pick<Floor, "name" | "elevation" | "height">>,
): Cmd {
  const key = Object.keys(to).sort().join(",");
  return {
    label: "Verdieping aangepast",
    mergeKey: `floor:${floorId}:${key}`,
    apply: (d) =>
      mapFloor(d, floorId, (f) =>
        (Object.keys(to) as (keyof typeof to)[]).every((k) => f[k] === to[k])
          ? f
          : { ...f, ...to },
      ),
    revert: (d) => mapFloor(d, floorId, (f) => ({ ...f, ...from })),
  };
}
