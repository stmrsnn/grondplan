/**
 * Deuren, ramen en doorgangen: altijd vast aan één muur.
 *
 * Een opening ligt op de lijn van haar muur, met `offset` = afstand van het
 * begin van de muur tot het midden van de opening. Alles hier is zuiver en
 * getest: plaatsen, binnen de muur houden, niet laten overlappen, afstanden tot
 * de hoeken, en de vorm om te tekenen.
 */
import type { Floor, Id, Opening, OpeningKind, Wall } from "../model/types";
import { wallSides } from "./plan";
import { add, cross, dot, length, scale, sub, type Vec } from "./vec";

const unit = (v: Vec): Vec => {
  const l = length(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};
const leftNormal = (d: Vec): Vec => ({ x: -d.y, y: d.x });

/** Standaardmaten (mm), zoals in België gebruikelijk. */
export const DOOR_WIDTHS = [730, 780, 830, 880, 930, 1000];
export const WINDOW_WIDTHS = [600, 900, 1200, 1500, 1800, 2400];
export const PASSAGE_WIDTHS = [900, 1200, 1500, 2000];

export function widthsFor(kind: OpeningKind): number[] {
  return kind === "door" ? DOOR_WIDTHS : kind === "window" ? WINDOW_WIDTHS : PASSAGE_WIDTHS;
}

/** Een redelijke eerste maat: een buitendeur is breder dan een binnendeur. */
export function openingDefaults(
  kind: OpeningKind,
  wallKind: Wall["kind"],
): Pick<Opening, "width" | "height" | "sillHeight"> {
  if (kind === "door") return { width: wallKind === "exterior" ? 1000 : 830, height: wallKind === "exterior" ? 2200 : 2100, sillHeight: 0 };
  if (kind === "window") return { width: 1200, height: 1350, sillHeight: 900 };
  return { width: 900, height: 2100, sillHeight: 0 };
}

export const OPENING_LABEL: Record<OpeningKind, string> = { door: "Deur", window: "Raam", passage: "Doorgang" };

/** Ligging van een muur: begin, einde, richting, normaal en lengte. */
export interface WallFrame {
  wall: Wall;
  a: Vec;
  b: Vec;
  d: Vec;
  n: Vec;
  len: number;
  /** Hoeveel van de lijn aan het begin/einde in een dwarsmuur zit (daar kan geen opening). */
  startMargin: number;
  endMargin: number;
}

/** Hoe ver dwarse muren aan een knooppunt in richting `v` reiken. */
function reachAt(floor: Floor, nodeId: Id, self: Wall, v: Vec, byId: Map<Id, Vec>): number {
  let best = 0;
  for (const o of floor.walls) {
    if (o.id === self.id || (o.start !== nodeId && o.end !== nodeId)) continue;
    const a = byId.get(o.start);
    const b = byId.get(o.end);
    if (!a || !b) continue;
    const od = unit(sub(b, a));
    if (Math.abs(cross(od, v)) < 1e-6) continue; // rechtdoor: geen hoek
    const s = wallSides(o);
    best = Math.max(best, dot(leftNormal(od), v) > 0 ? s.left : s.right);
  }
  return best;
}

export function wallFrame(floor: Floor, wallId: Id): WallFrame | null {
  const wall = floor.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const byId = new Map(floor.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const a = byId.get(wall.start);
  const b = byId.get(wall.end);
  if (!a || !b) return null;
  const len = length(sub(b, a));
  if (len < 1) return null;
  const d = unit(sub(b, a));
  return {
    wall,
    a,
    b,
    d,
    n: leftNormal(d),
    len,
    startMargin: reachAt(floor, wall.start, wall, d, byId),
    endMargin: reachAt(floor, wall.end, wall, scale(d, -1), byId),
  };
}

/**
 * Houdt een opening binnen de muur (tussen de dwarsmuren) en weg van andere
 * openingen. Geeft het dichtstbijzijnde geldige midden, of null als ze er niet
 * past.
 */
export function fitOffset(
  floor: Floor,
  frame: WallFrame,
  width: number,
  wanted: number,
  ignore?: Id,
): number | null {
  const lo = frame.startMargin + width / 2;
  const hi = frame.len - frame.endMargin - width / 2;
  if (hi < lo - 0.5) return null;
  // vrije stukken tussen de andere openingen op deze muur
  const taken = floor.openings
    .filter((o) => o.wall === frame.wall.id && o.id !== ignore)
    .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as const)
    .sort((p, q) => p[0] - q[0]);
  const free: [number, number][] = [];
  let from = lo;
  for (const [s, e] of taken) {
    const to = s - width / 2;
    if (to >= from - 0.5) free.push([from, to]);
    from = Math.max(from, e + width / 2);
  }
  if (hi >= from - 0.5) free.push([from, hi]);
  let best: number | null = null;
  for (const [s, e] of free) {
    const c = Math.min(Math.max(wanted, s), Math.max(s, e));
    if (best === null || Math.abs(c - wanted) < Math.abs(best - wanted)) best = c;
  }
  return best === null ? null : Math.round(best);
}

/** Vrije afstand van de opening tot de binnenhoek aan het begin en aan het einde. */
export function cornerGaps(frame: WallFrame, offset: number, width: number): { start: number; end: number } {
  return {
    start: Math.round(offset - width / 2 - frame.startMargin),
    end: Math.round(frame.len - frame.endMargin - offset - width / 2),
  };
}

/**
 * Magneet langs de muur: mooi gecentreerd als je in de buurt van het midden
 * zit, anders afstand tot de hoek op 5 cm.
 */
export function snapOffset(frame: WallFrame, width: number, raw: number, step = 50): number {
  const free = frame.len - frame.startMargin - frame.endMargin;
  const mid = frame.startMargin + free / 2;
  if (Math.abs(raw - mid) <= Math.max(80, step * 1.5)) return Math.round(mid);
  const gap = raw - width / 2 - frame.startMargin;
  return Math.round(frame.startMargin + Math.round(gap / step) * step + width / 2);
}

/** Dichtste muur onder een punt: welke, hoe ver langs de muur, en aan welke kant. */
export function projectOnWall(
  floor: Floor,
  p: Vec,
  tol: number,
): { frame: WallFrame; along: number; side: "left" | "right" } | null {
  let best: { frame: WallFrame; along: number; side: "left" | "right"; dist: number } | null = null;
  for (const w of floor.walls) {
    const f = wallFrame(floor, w.id);
    if (!f) continue;
    const t = dot(sub(p, f.a), f.d);
    if (t < 0 || t > f.len) continue;
    const across = dot(sub(p, f.a), f.n);
    const s = wallSides(w);
    // binnen het muurlichaam (plus wat speling)
    if (across > s.left + tol || across < -s.right - tol) continue;
    const mid = (s.left - s.right) / 2;
    const dist = Math.abs(across - mid);
    if (!best || dist < best.dist) best = { frame: f, along: t, side: across >= mid ? "left" : "right", dist };
  }
  return best ? { frame: best.frame, along: best.along, side: best.side } : null;
}

/** Een nieuwe opening op een muur; null als ze er niet past. */
export function addOpening(
  floor: Floor,
  o: Omit<Opening, "id" | "offset"> & { offset: number },
  id: Id,
): Floor | null {
  const frame = wallFrame(floor, o.wall);
  if (!frame) return null;
  const offset = fitOffset(floor, frame, o.width, o.offset);
  if (offset === null) return null;
  return { ...floor, openings: [...floor.openings, { ...o, id, offset }] };
}

/** Een opening wijzigen (maat, plaats, soort…), binnen de muur gehouden. Null als het niet past. */
export function updateOpening(floor: Floor, id: Id, patch: Partial<Opening>): Floor | null {
  const cur = floor.openings.find((o) => o.id === id);
  if (!cur) return null;
  const next: Opening = { ...cur, ...patch };
  const frame = wallFrame(floor, next.wall);
  if (!frame) return null;
  const offset = fitOffset(floor, frame, next.width, next.offset, id);
  if (offset === null) return null;
  return { ...floor, openings: floor.openings.map((o) => (o.id === id ? { ...next, offset } : o)) };
}

export function removeOpening(floor: Floor, id: Id): Floor {
  return { ...floor, openings: floor.openings.filter((o) => o.id !== id) };
}

/** Alles wat nodig is om een opening te tekenen, in wereldcoördinaten. */
export interface OpeningShape {
  opening: Opening;
  /** De vier hoeken van de uitsparing in de muur. */
  cut: Vec[];
  /** Dagkanten: de twee dwarse lijntjes aan de randen. */
  jambs: [Vec, Vec][];
  /** Lijnen evenwijdig aan de muur (raam: twee vlakken en het glas). */
  lines: [Vec, Vec][];
  /** Stukjes muurvlak die weg moeten (de deuropening loopt door). */
  gaps: [Vec, Vec][];
  /** Deur: blad en draaicirkel. */
  leaf?: { hinge: Vec; tip: Vec; to: Vec; radius: number; sweep: 0 | 1 };
  /** Midden van de opening (voor labels en maten). */
  center: Vec;
}

export function openingShape(floor: Floor, o: Opening): OpeningShape | null {
  const f = wallFrame(floor, o.wall);
  if (!f) return null;
  const s = wallSides(f.wall);
  const half = o.width / 2;
  const p0 = add(f.a, scale(f.d, o.offset - half));
  const p1 = add(f.a, scale(f.d, o.offset + half));
  const L = (p: Vec) => add(p, scale(f.n, s.left));
  const R = (p: Vec) => add(p, scale(f.n, -s.right));
  const cut = [L(p0), L(p1), R(p1), R(p0)];
  const jambs: [Vec, Vec][] = [
    [L(p0), R(p0)],
    [L(p1), R(p1)],
  ];
  const center = add(f.a, scale(f.d, o.offset));
  if (o.kind === "window") {
    const mid = (p: Vec) => add(p, scale(f.n, (s.left - s.right) / 2));
    return { opening: o, cut, jambs, lines: [[L(p0), L(p1)], [R(p0), R(p1)], [mid(p0), mid(p1)]], gaps: [], center };
  }
  const gaps: [Vec, Vec][] = [
    [L(p0), L(p1)],
    [R(p0), R(p1)],
  ];
  if (o.kind === "passage") return { opening: o, cut, jambs, lines: [], gaps, center };
  // deur: scharnier op het vlak aan de kant waar het blad naartoe draait
  const swing = o.swing ?? { side: "left", hinge: "start" };
  const face = swing.side === "left" ? L : R;
  const into = swing.side === "left" ? f.n : scale(f.n, -1);
  const hinge = face(swing.hinge === "start" ? p0 : p1);
  const to = face(swing.hinge === "start" ? p1 : p0);
  const tip = add(hinge, scale(into, o.width));
  // draaizin van de boog van het blad naar de andere dagkant (y wijst naar beneden)
  const sweep = cross(sub(tip, hinge), sub(to, hinge)) > 0 ? 1 : 0;
  return { opening: o, cut, jambs, lines: [], gaps, leaf: { hinge, tip, to, radius: o.width, sweep }, center };
}

/** Welke opening ligt onder dit punt? */
export function hitOpening(floor: Floor, p: Vec, tol: number): Opening | null {
  for (const o of floor.openings) {
    const f = wallFrame(floor, o.wall);
    if (!f) continue;
    const s = wallSides(f.wall);
    const t = dot(sub(p, f.a), f.d);
    const across = dot(sub(p, f.a), f.n);
    if (Math.abs(t - o.offset) <= o.width / 2 + tol && across <= s.left + tol && across >= -s.right - tol) return o;
  }
  return null;
}

/**
 * Maatlijnen bij een opening, langs het muurvlak aan de draaikant (of links):
 * de vrije afstand tot de binnenhoek aan elke kant, en de breedte zelf.
 */
export function openingMarks(floor: Floor, o: Opening): { from: Vec; to: Vec; len: number; out: Vec; kind: "gap" | "width" }[] {
  const f = wallFrame(floor, o.wall);
  if (!f) return [];
  const s = wallSides(f.wall);
  const side = o.swing?.side ?? "left";
  const out = side === "left" ? f.n : scale(f.n, -1);
  const ext = side === "left" ? s.left : s.right;
  const at = (t: number) => add(add(f.a, scale(f.d, t)), scale(out, ext));
  const e0 = o.offset - o.width / 2;
  const e1 = o.offset + o.width / 2;
  const gaps = cornerGaps(f, o.offset, o.width);
  const marks: { from: Vec; to: Vec; len: number; out: Vec; kind: "gap" | "width" }[] = [];
  if (gaps.start > 0) marks.push({ from: at(f.startMargin), to: at(e0), len: gaps.start, out, kind: "gap" });
  marks.push({ from: at(e0), to: at(e1), len: o.width, out, kind: "width" });
  if (gaps.end > 0) marks.push({ from: at(e1), to: at(f.len - f.endMargin), len: gaps.end, out, kind: "gap" });
  return marks;
}
