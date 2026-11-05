/**
 * Eigen ramen en deuren bewaren en verwijderen. Wijzig je een eigen soort,
 * dan krijgen de geplaatste ramen van die soort de nieuwe vakken mee.
 */
import { setCustomFrameTypes, type FrameType } from "./frames";
import type { ProjectDoc } from "./types";

export function newFrameTypeId(): string {
  return `eigen-${globalThis.crypto.randomUUID()}`;
}

/** Hoeveel ramen of deuren (over alle verdiepingen) deze soort gebruiken. */
export function frameTypeUsage(doc: ProjectDoc, id: string): number {
  return doc.floors.reduce((n, f) => n + f.openings.filter((o) => o.frameType === id).length, 0);
}

export function saveFrameType(doc: ProjectDoc, t: FrameType): ProjectDoc {
  const list = doc.settings.customFrameTypes ?? [];
  const types = list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t];
  setCustomFrameTypes(types);
  const floors = doc.floors.map((f) =>
    f.openings.some((o) => o.frameType === t.id)
      ? { ...f, openings: f.openings.map((o) => (o.frameType === t.id ? { ...o, frame: t.frame } : o)) }
      : f,
  );
  return { ...doc, settings: { ...doc.settings, customFrameTypes: types }, floors };
}

/** Verwijderen: geplaatste ramen blijven zoals ze zijn, als "samengesteld raam". */
export function deleteFrameType(doc: ProjectDoc, id: string): ProjectDoc {
  const types = (doc.settings.customFrameTypes ?? []).filter((t) => t.id !== id);
  setCustomFrameTypes(types);
  const floors = doc.floors.map((f) =>
    f.openings.some((o) => o.frameType === id)
      ? {
          ...f,
          openings: f.openings.map((o) => {
            if (o.frameType !== id) return o;
            const { frameType: _t, ...rest } = o;
            void _t;
            return rest;
          }),
        }
      : f,
  );
  return { ...doc, settings: { ...doc.settings, customFrameTypes: types }, floors };
}
