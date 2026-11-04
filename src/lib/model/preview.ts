import { wallBodyLine } from "../geometry/plan";
import { bounds } from "../geometry/polygon";
import type { ProjectDoc } from "./types";

/**
 * Kleine samenvatting van het plan voor de projectkaart: enkel lijnstukken,
 * geschaald naar een vak van 240 × 144. Bewust geen SVG-tekst, zodat er nooit
 * opmaak uit de database rechtstreeks op de pagina belandt.
 */
export interface PlanPreview {
  w: number;
  h: number;
  /** [x1, y1, x2, y2, dikte] in previewcoördinaten (afgerond op 0,1). */
  lines: [number, number, number, number, number][];
}

export const PREVIEW_W = 240;
export const PREVIEW_H = 144;
const MAX_LINES = 400;

export function makePreview(doc: ProjectDoc): PlanPreview | null {
  // de verdieping met de meeste muren, bij gelijkheid het gelijkvloers
  const floor = [...doc.floors].sort(
    (a, b) => b.walls.length - a.walls.length || Math.abs(a.elevation) - Math.abs(b.elevation),
  )[0];
  if (!floor || floor.walls.length === 0) return null;
  const nodes = new Map(floor.nodes.map((n) => [n.id, n]));
  const segs = floor.walls
    .map((w) => {
      const a = nodes.get(w.start);
      const b = nodes.get(w.end);
      if (!a || !b) return null;
      const [p, q] = wallBodyLine(w, a, b);
      return { a: p, b: q, t: w.thickness };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, MAX_LINES);
  const bb = bounds(segs.flatMap((s) => [s.a, s.b]));
  if (!bb) return null;
  const pad = 12;
  const sw = Math.max(bb.maxX - bb.minX, 1);
  const sh = Math.max(bb.maxY - bb.minY, 1);
  const k = Math.min((PREVIEW_W - 2 * pad) / sw, (PREVIEW_H - 2 * pad) / sh);
  const ox = (PREVIEW_W - sw * k) / 2 - bb.minX * k;
  const oy = (PREVIEW_H - sh * k) / 2 - bb.minY * k;
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    w: PREVIEW_W,
    h: PREVIEW_H,
    lines: segs.map((s) => [
      r(s.a.x * k + ox),
      r(s.a.y * k + oy),
      r(s.b.x * k + ox),
      r(s.b.y * k + oy),
      r(Math.max(1, s.t * k)),
    ]),
  };
}

/** Controleert een preview uit de database voor we ze tekenen. */
export function readPreview(raw: unknown): PlanPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as PlanPreview;
  if (!Array.isArray(p.lines)) return null;
  const lines = p.lines
    .filter((l) => Array.isArray(l) && l.length === 5 && l.every((v) => typeof v === "number" && Number.isFinite(v)))
    .slice(0, MAX_LINES);
  return lines.length ? { w: PREVIEW_W, h: PREVIEW_H, lines } : null;
}
