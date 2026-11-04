import { openingShape } from "../geometry/openings";
import { analyzeFloor, roomCategory, type RoomCategory } from "../geometry/plan";
import type { Vec } from "../geometry/vec";
import { bounds } from "../geometry/polygon";
import type { ProjectDoc } from "./types";

/**
 * Kleine samenvatting van het plan voor de projectkaart, in dezelfde stijl als
 * het tekenvlak: ruimtes in hun kleur, grijze muren, deuren en ramen als
 * uitsparing. Enkel getallen (geen SVG-tekst), zodat er nooit opmaak uit de
 * database rechtstreeks op de pagina belandt.
 */
export const ROOM_CATEGORIES: RoomCategory[] = ["leven", "slapen", "nat", "doorgang", "berging", "andere"];

export interface PlanPreview {
  w: number;
  h: number;
  /** Per ruimte: [index in ROOM_CATEGORIES, x1, y1, x2, y2, …]. */
  rooms: number[][];
  /** Muren als veelhoek: [x1, y1, x2, y2, …]. */
  walls: number[][];
  /** Uitsparingen voor deuren en ramen. */
  cuts: number[][];
  /** Oude voorbeelden: [x1, y1, x2, y2, dikte]. */
  lines: [number, number, number, number, number][];
}

export const PREVIEW_W = 240;
export const PREVIEW_H = 144;
const MAX_SHAPES = 400;

export function makePreview(doc: ProjectDoc): PlanPreview | null {
  // de verdieping met de meeste muren, bij gelijkheid het gelijkvloers
  const floor = [...doc.floors].sort(
    (a, b) => b.walls.length - a.walls.length || Math.abs(a.elevation) - Math.abs(b.elevation),
  )[0];
  if (!floor || floor.walls.length === 0) return null;
  const a = analyzeFloor(floor);
  const wallPolys = [...a.wallPolys.values()].slice(0, MAX_SHAPES);
  const bb = bounds(wallPolys.flat());
  if (!bb) return null;
  const pad = 12;
  const sw = Math.max(bb.maxX - bb.minX, 1);
  const sh = Math.max(bb.maxY - bb.minY, 1);
  const k = Math.min((PREVIEW_W - 2 * pad) / sw, (PREVIEW_H - 2 * pad) / sh);
  const ox = (PREVIEW_W - sw * k) / 2 - bb.minX * k;
  const oy = (PREVIEW_H - sh * k) / 2 - bb.minY * k;
  const r = (v: number) => Math.round(v * 10) / 10;
  const flat = (poly: Vec[]) => poly.flatMap((p) => [r(p.x * k + ox), r(p.y * k + oy)]);
  return {
    w: PREVIEW_W,
    h: PREVIEW_H,
    rooms: a.rooms.slice(0, MAX_SHAPES).map((ri) => [ROOM_CATEGORIES.indexOf(roomCategory(ri.room.function)), ...flat(ri.inner)]),
    walls: wallPolys.map(flat),
    cuts: floor.openings
      .slice(0, MAX_SHAPES)
      .map((o) => openingShape(floor, o))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((x) => flat(x.cut)),
    lines: [],
  };
}

const nums = (v: unknown, min: number, max = 4000): v is number[] =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every((x) => typeof x === "number" && Number.isFinite(x));

/** Controleert een preview uit de database voor we ze tekenen. */
export function readPreview(raw: unknown): PlanPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Record<keyof PlanPreview, unknown>>;
  const list = (v: unknown, min: number) => (Array.isArray(v) ? v.filter((x) => nums(x, min)).slice(0, MAX_SHAPES) : []);
  const rooms = list(p.rooms, 7).filter((x) => Number.isInteger(x[0]) && x[0] >= 0 && x[0] < ROOM_CATEGORIES.length && x.length % 2 === 1);
  const walls = list(p.walls, 6).filter((x) => x.length % 2 === 0);
  const cuts = list(p.cuts, 6).filter((x) => x.length % 2 === 0);
  const lines = list(p.lines, 5).filter((x) => x.length === 5) as PlanPreview["lines"];
  if (!walls.length && !lines.length) return null;
  return { w: PREVIEW_W, h: PREVIEW_H, rooms, walls, cuts, lines };
}

/** Coördinaten → SVG-pad (enkel getallen, dus veilig). */
export function previewPath(coords: number[]): string {
  let d = "";
  for (let i = 0; i + 1 < coords.length; i += 2) d += `${i === 0 ? "M" : "L"}${coords[i]} ${coords[i + 1]}`;
  return d + "Z";
}
