/**
 * Deuren, ramen en doorgangen: altijd vast aan één muur.
 *
 * Een opening ligt op de lijn van haar muur, met `offset` = afstand van het
 * begin van de muur tot het midden van de opening. Alles hier is zuiver en
 * getest: plaatsen, binnen de muur houden, niet laten overlappen, afstanden tot
 * de hoeken, de vorm om te tekenen, botsende deuren en daglicht.
 */
import type { Floor, Id, Opening, OpeningKind, OpeningVariant, Wall } from "../model/types";
import { analyzeFloor, pointInPolygon, wallSides, type FloorAnalysis } from "./plan";
import { add, cross, dot, length, scale, sub, type Vec } from "./vec";

const unit = (v: Vec): Vec => {
  const l = length(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};
const leftNormal = (d: Vec): Vec => ({ x: -d.y, y: d.x });

/* ------------------------------------------------------------------ */
/* Soorten en standaardmaten                                            */
/* ------------------------------------------------------------------ */

/** Wat je in het gereedschap of paneel kiest: soort + uitvoering in één. */
export type OpeningChoice = "single" | "double" | "sliding" | "garage" | "passage" | "window" | "slidingWindow" | "patio";

interface ChoiceInfo {
  kind: OpeningKind;
  variant?: OpeningVariant;
  label: string;
  /** Standaardbreedtes (mm), zoals in België gebruikelijk. */
  widths: number[];
  defaults: (wallKind: Wall["kind"]) => Pick<Opening, "width" | "height" | "sillHeight">;
}

export const CHOICES: Record<OpeningChoice, ChoiceInfo> = {
  single: {
    kind: "door",
    label: "Deur",
    widths: [730, 780, 830, 880, 930, 1000],
    defaults: (k) => ({ width: k === "exterior" ? 1000 : 830, height: k === "exterior" ? 2200 : 2100, sillHeight: 0 }),
  },
  double: {
    kind: "door",
    variant: "double",
    label: "Dubbele deur",
    widths: [1200, 1400, 1600, 1800],
    defaults: (k) => ({ width: 1400, height: k === "exterior" ? 2200 : 2100, sillHeight: 0 }),
  },
  sliding: {
    kind: "door",
    variant: "sliding",
    label: "Schuifdeur",
    widths: [780, 830, 930, 1000, 1200],
    defaults: () => ({ width: 930, height: 2100, sillHeight: 0 }),
  },
  garage: {
    kind: "door",
    variant: "garage",
    label: "Garagepoort",
    widths: [2400, 2500, 3000, 5000],
    defaults: () => ({ width: 2500, height: 2200, sillHeight: 0 }),
  },
  passage: {
    kind: "passage",
    label: "Doorgang",
    widths: [900, 1200, 1500, 2000],
    defaults: () => ({ width: 900, height: 2100, sillHeight: 0 }),
  },
  window: {
    kind: "window",
    label: "Raam",
    widths: [600, 900, 1200, 1500, 1800, 2400],
    defaults: () => ({ width: 1200, height: 1350, sillHeight: 900 }),
  },
  slidingWindow: {
    kind: "window",
    variant: "slidingWindow",
    label: "Schuifraam",
    widths: [1500, 1800, 2400, 3000],
    defaults: () => ({ width: 1800, height: 1350, sillHeight: 900 }),
  },
  patio: {
    kind: "window",
    variant: "patio",
    label: "Terrasraam",
    widths: [1800, 2400, 3000, 3600, 4800],
    defaults: () => ({ width: 2400, height: 2150, sillHeight: 0 }),
  },
};

export const DOOR_CHOICES: OpeningChoice[] = ["single", "double", "sliding", "garage", "passage"];
export const WINDOW_CHOICES: OpeningChoice[] = ["window", "slidingWindow", "patio"];

export function choiceOf(o: Pick<Opening, "kind" | "variant">): OpeningChoice {
  if (o.kind === "passage") return "passage";
  if (o.kind === "window") return o.variant === "slidingWindow" || o.variant === "patio" ? o.variant : "window";
  return o.variant === "double" || o.variant === "sliding" || o.variant === "garage" ? o.variant : "single";
}

export const OPENING_LABEL: Record<OpeningKind, string> = { door: "Deur", window: "Raam", passage: "Doorgang" };

/** Naam zoals de gebruiker hem ziet ("Schuifraam", "Dubbele deur"…). */
export function openingName(o: Pick<Opening, "kind" | "variant">): string {
  return CHOICES[choiceOf(o)].label;
}

/** Soort + uitvoering + standaardmaten voor een keuze. */
export function choiceProps(
  c: OpeningChoice,
  wallKind: Wall["kind"],
): Pick<Opening, "kind" | "variant" | "width" | "height" | "sillHeight"> {
  const info = CHOICES[c];
  return { kind: info.kind, variant: info.variant, ...info.defaults(wallKind) };
}

/** Breder dan dit in een dragende muur: een latei of balk is nodig. */
export const LINTEL_LIMIT = 1000;

export function needsLintel(o: Opening, wall: Wall): boolean {
  return wall.loadBearing && o.width > LINTEL_LIMIT;
}

/* ------------------------------------------------------------------ */
/* Ligging van muren (één keer per verdieping berekend)                 */
/* ------------------------------------------------------------------ */

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

const frameCache = new WeakMap<Floor, Map<Id, WallFrame>>();

function computeFrames(floor: Floor): Map<Id, WallFrame> {
  const byId = new Map(floor.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const atNode = new Map<Id, Wall[]>();
  for (const w of floor.walls) {
    (atNode.get(w.start) ?? atNode.set(w.start, []).get(w.start)!).push(w);
    (atNode.get(w.end) ?? atNode.set(w.end, []).get(w.end)!).push(w);
  }
  /** Hoe ver dwarse muren aan een knooppunt in richting `v` reiken. */
  const reach = (nodeId: Id, self: Wall, v: Vec): number => {
    let best = 0;
    for (const o of atNode.get(nodeId) ?? []) {
      if (o.id === self.id) continue;
      const a = byId.get(o.start);
      const b = byId.get(o.end);
      if (!a || !b) continue;
      const od = unit(sub(b, a));
      if (Math.abs(cross(od, v)) < 1e-6) continue; // rechtdoor: geen hoek
      const s = wallSides(o);
      best = Math.max(best, dot(leftNormal(od), v) > 0 ? s.left : s.right);
    }
    return best;
  };
  const out = new Map<Id, WallFrame>();
  for (const wall of floor.walls) {
    const a = byId.get(wall.start);
    const b = byId.get(wall.end);
    if (!a || !b) continue;
    const len = length(sub(b, a));
    if (len < 1) continue;
    const d = unit(sub(b, a));
    out.set(wall.id, {
      wall,
      a,
      b,
      d,
      n: leftNormal(d),
      len,
      startMargin: reach(wall.start, wall, d),
      endMargin: reach(wall.end, wall, scale(d, -1)),
    });
  }
  return out;
}

function frames(floor: Floor): Map<Id, WallFrame> {
  let f = frameCache.get(floor);
  if (!f) {
    f = computeFrames(floor);
    frameCache.set(floor, f);
  }
  return f;
}

export function wallFrame(floor: Floor, wallId: Id): WallFrame | null {
  return frames(floor).get(wallId) ?? null;
}

/** Aan welke kant van de muur ligt een ruimte? (voor een gevel: de binnenkant) */
export function roomSide(floor: Floor, frame: WallFrame): "left" | "right" | null {
  const s = wallSides(frame.wall);
  const mid = add(frame.a, scale(frame.d, frame.len / 2));
  const rooms = analyzeFloor(floor).rooms;
  const inAny = (p: Vec) => rooms.some((r) => pointInPolygon(p, r.inner));
  if (inAny(add(mid, scale(frame.n, s.left + 60)))) return "left";
  if (inAny(add(mid, scale(frame.n, -s.right - 60)))) return "right";
  return null;
}

/* ------------------------------------------------------------------ */
/* Plaatsen                                                             */
/* ------------------------------------------------------------------ */

/**
 * Houdt een opening binnen de muur (tussen de dwarsmuren) en weg van andere
 * openingen. Geeft het dichtstbijzijnde geldige midden, of null als ze er niet
 * past.
 */
export function fitOffset(floor: Floor, frame: WallFrame, width: number, wanted: number, ignore?: Id): number | null {
  const lo = frame.startMargin + width / 2;
  const hi = frame.len - frame.endMargin - width / 2;
  if (hi < lo - 0.5) return null;
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
  for (const f of frames(floor).values()) {
    const t = dot(sub(p, f.a), f.d);
    if (t < 0 || t > f.len) continue;
    const across = dot(sub(p, f.a), f.n);
    const s = wallSides(f.wall);
    if (across > s.left + tol || across < -s.right - tol) continue;
    const mid = (s.left - s.right) / 2;
    const dist = Math.abs(across - mid);
    if (!best || dist < best.dist) best = { frame: f, along: t, side: across >= mid ? "left" : "right", dist };
  }
  return best ? { frame: best.frame, along: best.along, side: best.side } : null;
}

/** Een nieuwe opening op een muur; null als ze er niet past. */
export function addOpening(floor: Floor, o: Omit<Opening, "id">, id: Id): Floor | null {
  const frame = wallFrame(floor, o.wall);
  if (!frame) return null;
  const offset = fitOffset(floor, frame, o.width, o.offset);
  if (offset === null) return null;
  const clean: Opening = { ...o, id, offset };
  if (clean.variant === undefined) delete clean.variant;
  return { ...floor, openings: [...floor.openings, clean] };
}

/** Een opening wijzigen (maat, plaats, soort…), binnen de muur gehouden. Null als het niet past. */
export function updateOpening(floor: Floor, id: Id, patch: Partial<Opening>): Floor | null {
  const cur = floor.openings.find((o) => o.id === id);
  if (!cur) return null;
  const next: Opening = { ...cur, ...patch };
  if (next.variant === undefined) delete next.variant;
  const frame = wallFrame(floor, next.wall);
  if (!frame) return null;
  const offset = fitOffset(floor, frame, next.width, next.offset, id);
  if (offset === null) return null;
  return { ...floor, openings: floor.openings.map((o) => (o.id === id ? { ...next, offset } : o)) };
}

export function removeOpening(floor: Floor, id: Id): Floor {
  return { ...floor, openings: floor.openings.filter((o) => o.id !== id) };
}

/* ------------------------------------------------------------------ */
/* Tekenen                                                              */
/* ------------------------------------------------------------------ */

export interface Leaf {
  hinge: Vec;
  /** Uiteinde van het blad als de deur helemaal open staat. */
  tip: Vec;
  /** Uiteinde van het blad als de deur dicht is. */
  to: Vec;
  radius: number;
  sweep: 0 | 1;
}

/** Alles wat nodig is om een opening te tekenen, in wereldcoördinaten. */
export interface OpeningShape {
  opening: Opening;
  /** De vier hoeken van de uitsparing in de muur. */
  cut: Vec[];
  /** Dagkanten: de twee dwarse lijntjes aan de randen. */
  jambs: [Vec, Vec][];
  /** Dunne lijnen evenwijdig aan de muur (raam: twee vlakken en het glas). */
  lines: [Vec, Vec][];
  /** Dikke lijnen: een schuivend deurblad, een poort. */
  panels: [Vec, Vec][];
  /** Stippellijnen: open stand van een schuifdeur, een poort onder het plafond. */
  dashed: [Vec, Vec][];
  /** Stukjes muurvlak die weg moeten (de deuropening loopt door). */
  gaps: [Vec, Vec][];
  /** Draaiende bladen met hun kwartcirkel. */
  leaves: Leaf[];
  /** Midden van de opening (voor labels en maten). */
  center: Vec;
  /** Richting van de muur, en de normaal naar de draaikant. */
  d: Vec;
  out: Vec;
  /** Midden van het muurvlak aan de andere kant (voor een raam: buiten). */
  farFace: Vec;
}

function leaf(hinge: Vec, into: Vec, to: Vec, radius: number): Leaf {
  const tip = add(hinge, scale(into, radius));
  // draaizin van de boog van het blad naar de andere dagkant (y wijst naar beneden)
  const sweep = cross(sub(tip, hinge), sub(to, hinge)) > 0 ? 1 : 0;
  return { hinge, tip, to, radius, sweep };
}

export function openingShape(floor: Floor, o: Opening): OpeningShape | null {
  const f = wallFrame(floor, o.wall);
  if (!f) return null;
  const s = wallSides(f.wall);
  const half = o.width / 2;
  const p0 = add(f.a, scale(f.d, o.offset - half));
  const p1 = add(f.a, scale(f.d, o.offset + half));
  const at = (p: Vec, across: number) => add(p, scale(f.n, across));
  const L = (p: Vec) => at(p, s.left);
  const R = (p: Vec) => at(p, -s.right);
  const midAcross = (s.left - s.right) / 2;
  const swing = o.swing ?? { side: "left" as const, hinge: "start" as const };
  const sideSign = swing.side === "left" ? 1 : -1;
  const out = scale(f.n, sideSign);
  const center = add(f.a, scale(f.d, o.offset));
  const shape: OpeningShape = {
    opening: o,
    cut: [L(p0), L(p1), R(p1), R(p0)],
    jambs: [
      [L(p0), R(p0)],
      [L(p1), R(p1)],
    ],
    lines: [],
    panels: [],
    dashed: [],
    gaps: [],
    leaves: [],
    center,
    d: f.d,
    out,
    farFace: swing.side === "left" ? R(center) : L(center),
  };
  const c = choiceOf(o);

  if (o.kind === "window") {
    shape.lines.push([L(p0), L(p1)], [R(p0), R(p1)]);
    if (c === "window") {
      shape.lines.push([at(p0, midAcross), at(p1, midAcross)]);
    } else {
      // schuifraam: twee vleugels die elkaar in het midden overlappen
      const lap = Math.min(100, o.width / 8);
      const q = (s.left + s.right) / 8;
      shape.lines.push(
        [at(p0, midAcross - q), at(add(center, scale(f.d, lap)), midAcross - q)],
        [at(add(center, scale(f.d, -lap)), midAcross + q), at(p1, midAcross + q)],
      );
    }
    return shape;
  }

  shape.gaps.push([L(p0), L(p1)], [R(p0), R(p1)]);
  if (o.kind === "passage") return shape;

  const face = (p: Vec) => (swing.side === "left" ? L(p) : R(p));
  if (c === "double") {
    const m = face(center);
    shape.leaves.push(leaf(face(p0), out, m, half), leaf(face(p1), out, m, half));
  } else if (c === "sliding") {
    // dicht: blad in het midden van de muur; open: langs de muur, aan de scharnierkant
    shape.panels.push([at(p0, midAcross), at(p1, midAcross)]);
    const dir = swing.hinge === "start" ? -1 : 1;
    const from = swing.hinge === "start" ? p0 : p1;
    const inset = (s.left + s.right) / 2 + 30;
    const lineAt = (p: Vec) => at(p, midAcross + sideSign * inset);
    shape.dashed.push([lineAt(from), lineAt(add(from, scale(f.d, dir * o.width)))]);
  } else if (c === "garage") {
    // sectionale poort: dicht in de muur, open als stippellijn onder het plafond
    const inset = (s.left + s.right) / 2 + 400;
    shape.panels.push([at(p0, midAcross), at(p1, midAcross)]);
    shape.dashed.push([at(p0, midAcross + sideSign * inset), at(p1, midAcross + sideSign * inset)]);
  } else {
    const hinge = face(swing.hinge === "start" ? p0 : p1);
    const to = face(swing.hinge === "start" ? p1 : p0);
    shape.leaves.push(leaf(hinge, out, to, o.width));
  }
  return shape;
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
export function openingMarks(
  floor: Floor,
  o: Opening,
): { from: Vec; to: Vec; len: number; out: Vec; kind: "gap" | "width" }[] {
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

/* ------------------------------------------------------------------ */
/* Botsende deuren                                                      */
/* ------------------------------------------------------------------ */

/** Punten verspreid binnen de draaicirkel van een blad (niet op de rand). */
function sweepSamples(l: Leaf): Vec[] {
  const u = unit(sub(l.tip, l.hinge));
  const v = unit(sub(l.to, l.hinge));
  const pts: Vec[] = [];
  for (const r of [0.2, 0.4, 0.6, 0.8, 0.95]) {
    for (const a of [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]) {
      const th = (a * Math.PI) / 2;
      pts.push(add(l.hinge, add(scale(v, Math.cos(th) * r * l.radius), scale(u, Math.sin(th) * r * l.radius))));
    }
  }
  return pts;
}

function inSweep(p: Vec, l: Leaf): boolean {
  const u = unit(sub(l.tip, l.hinge));
  const v = unit(sub(l.to, l.hinge));
  const q = sub(p, l.hinge);
  const a = dot(q, v);
  const b = dot(q, u);
  return a > 0 && b > 0 && a * a + b * b < l.radius * l.radius;
}

/**
 * Deuren die tegen een muur of tegen (de draaicirkel van) een andere deur
 * slaan. Geeft per deur de reden.
 */
export function doorConflicts(floor: Floor, analysis: FloorAnalysis = analyzeFloor(floor)): Map<Id, "muur" | "deur"> {
  const shapes = floor.openings
    .filter((o) => o.kind === "door")
    .map((o) => openingShape(floor, o))
    .filter((x): x is OpeningShape => x !== null && x.leaves.length > 0);
  const out = new Map<Id, "muur" | "deur">();
  for (const sh of shapes) {
    const pts = sh.leaves.flatMap(sweepSamples);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    let hitWall = false;
    for (const [wid, poly] of analysis.wallPolys) {
      if (wid === sh.opening.wall) continue;
      // snelle uitsluiting met de omhullende rechthoek
      if (poly.every((p) => p.x < x0) || poly.every((p) => p.x > x1) || poly.every((p) => p.y < y0) || poly.every((p) => p.y > y1))
        continue;
      if (pts.some((p) => pointInPolygon(p, poly))) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) {
      out.set(sh.opening.id, "muur");
      continue;
    }
    for (const other of shapes) {
      if (other === sh) continue;
      if (pts.some((p) => other.leaves.some((l) => inSweep(p, l)))) {
        out.set(sh.opening.id, "deur");
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Daglicht                                                             */
/* ------------------------------------------------------------------ */

/** Ruimtes waarvoor de Vlaamse norm geldt: leefruimtes en slaapkamers. */
const DAYLIGHT_FUNCTIONS = new Set(["living", "eetkamer", "slaapkamer"]);
/** Deel van de dagmaat dat echt glas is (de rest is kader). */
export const GLASS_FACTOR = 0.75;

export interface Daylight {
  /** Geschatte glasoppervlakte (mm²). */
  glass: number;
  /** Nodig volgens de norm: 1/12 van de vloeroppervlakte (mm²). */
  needed: number;
  ok: boolean;
}

/**
 * Daglicht per ruimte: ramen in de gevels rond de ruimte, tegenover de
 * Vlaamse norm (glas minstens 1/12 van de vloer). Enkel voor leefruimtes en
 * slaapkamers.
 */
export function roomDaylight(floor: Floor, analysis: FloorAnalysis = analyzeFloor(floor)): Map<Id, Daylight> {
  const out = new Map<Id, Daylight>();
  const wallKind = new Map(floor.walls.map((w) => [w.id, w.kind]));
  for (const r of analysis.rooms) {
    if (!DAYLIGHT_FUNCTIONS.has(r.room.function)) continue;
    const walls = new Set(r.edgeWalls);
    let glass = 0;
    for (const o of floor.openings) {
      if (o.kind !== "window" || !walls.has(o.wall) || wallKind.get(o.wall) !== "exterior") continue;
      glass += o.width * o.height * GLASS_FACTOR;
    }
    const needed = r.area / 12;
    out.set(r.room.id, { glass, needed, ok: glass >= needed });
  }
  return out;
}
