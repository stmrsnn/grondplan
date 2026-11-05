/**
 * Deuren, ramen en doorgangen: altijd vast aan één muur.
 *
 * Een opening ligt op de lijn van haar muur, met `offset` = afstand van het
 * begin van de muur tot het midden van de opening. Alles hier is zuiver en
 * getest: plaatsen, binnen de muur houden, niet laten overlappen, afstanden tot
 * de hoeken, de vorm om te tekenen, botsende deuren en daglicht.
 */
import type { Floor, Id, Opening, OpeningKind, OpeningVariant, Wall } from "../model/types";
import { wallLayers } from "../model/wallTypes";
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

/** Breedte van het deurkader aan elke kant (mm). */
export const DOOR_FRAME = 50;

/**
 * Ruwbouwopening langs de muur. Bij deuren is `width` de breedte van het
 * deurblad (zoals je een deur koopt: 83 cm); de opening in de muur is dan
 * het blad plus het kader aan beide kanten. Bij ramen, poorten en doorgangen
 * is `width` meteen de opening.
 */
export function openingSpan(o: Pick<Opening, "kind" | "variant" | "width">): number {
  return o.kind === "door" && o.variant !== "garage" ? o.width + 2 * DOOR_FRAME : o.width;
}

/** Breder dan dit in een dragende muur: een latei of balk is nodig. */
export const LINTEL_LIMIT = 1000;

export function needsLintel(o: Opening, wall: Wall): boolean {
  return wall.loadBearing && openingSpan(o) > LINTEL_LIMIT;
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
    .map((o) => [o.offset - openingSpan(o) / 2, o.offset + openingSpan(o) / 2] as const)
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
  const offset = fitOffset(floor, frame, openingSpan(o), o.offset);
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
  const offset = fitOffset(floor, frame, openingSpan(next), next.offset, id);
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

/**
 * Alles om een opening te tekenen zoals op een uitvoeringsplan, in
 * wereldcoördinaten.
 */
export interface OpeningShape {
  opening: Opening;
  /** Uitsparing in de muur (wordt papier). */
  cut: Vec[];
  /** Stukjes muurvlak die wegvallen (de snijlijn loopt niet door de opening). */
  erase: [Vec, Vec][];
  /** Nieuwe snijlijnen: dagkanten, aanslag (dik). */
  cutLines: [Vec, Vec][];
  /** Aanslag van het buitenblad: stukjes gevelsteen die voor het kader komen. */
  rebates: Vec[][];
  /** Kaders (raam- en deurkader): papier met een lijn. */
  frames: Vec[][];
  /** Deurbladen en schuivende delen: rechthoeken. */
  panels: Vec[][];
  /** Glas: dunne lijnen. */
  glass: [Vec, Vec][];
  /** Zichtlijnen onder de snede: dorpel buiten, vensterbank binnen (dun). */
  thin: [Vec, Vec][];
  /** Stippellijnen: open stand van een schuifdeur, een poort onder het plafond. */
  dashed: [Vec, Vec][];
  /** Draaiende bladen met hun kwartcirkel. */
  leaves: Leaf[];
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

/** Maten van kaders en details (mm), zoals gangbaar. */
const FRAME_DEPTH = 70; // raam- of buitendeurkader
const STILE = 60; // zichtbare breedte van een raamstijl
const REBATE = 40; // aanslag van het buitenblad voor het kader
const SILL_OUT = 40; // dorpel steekt buiten uit
const BENCH_IN = 25; // vensterbank steekt binnen uit
const LEAF = 40; // dikte van een deurblad

/**
 * Doorsnede van een muur dwars op de muur: waar ligt de buitenkant, en hoe
 * diep zitten de lagen. Bij een binnenmuur is "buiten" gewoon links.
 */
function section(floor: Floor, f: WallFrame) {
  const s = wallSides(f.wall);
  const outSign = analyzeFloor(floor).wallOutside.get(f.wall.id) ?? 0;
  const sigmaOut = outSign === -1 ? -s.right : s.left;
  const inward = outSign === -1 ? 1 : -1;
  const layers = wallLayers(f.wall);
  const T = f.wall.thickness;
  const isoIndex = layers.findIndex((l) => l.material === "isolatie" || l.material === "wol");
  const depthBefore = (i: number) => layers.slice(0, i).reduce((sum, l) => sum + l.thickness, 0);
  const cavity = outSign !== 0 && isoIndex > 0 && layers[0].material === "gevelsteen";
  return {
    exterior: outSign !== 0,
    T,
    cavity,
    outerLeaf: cavity ? layers[0].thickness : 0,
    /** Diepte (vanaf buiten) waar het kader begint: tegen de isolatie, of in het midden. */
    frameAt: isoIndex > 0 && outSign !== 0 ? depthBefore(isoIndex) : Math.max(0, (T - FRAME_DEPTH) / 2),
    /** Punt op afstand t langs de muur en `depth` vanaf het buitenvlak. */
    at: (t: number, depth: number) => add(add(f.a, scale(f.d, t)), scale(f.n, sigmaOut + inward * depth)),
    /** Diepte van het muurvlak aan de linker- of rechterkant. */
    depthOfSide: (side: "left" | "right") => ((side === "left") === (outSign !== -1) ? 0 : T),
  };
}

const rect = (P: (t: number, d: number) => Vec, t0: number, t1: number, d0: number, d1: number): Vec[] => [
  P(t0, d0),
  P(t1, d0),
  P(t1, d1),
  P(t0, d1),
];

export function openingShape(floor: Floor, o: Opening): OpeningShape | null {
  const f = wallFrame(floor, o.wall);
  if (!f) return null;
  const sec = section(floor, f);
  const P = sec.at;
  const T = sec.T;
  const span = openingSpan(o);
  const t0 = o.offset - span / 2;
  const t1 = o.offset + span / 2;
  const swing = o.swing ?? { side: "left" as const, hinge: "start" as const };
  const out = swing.side === "left" ? f.n : scale(f.n, -1);
  const center = add(f.a, scale(f.d, o.offset));
  const swingDepth = sec.depthOfSide(swing.side);
  const shape: OpeningShape = {
    opening: o,
    cut: rect(P, t0, t1, 0, T),
    erase: [
      [P(t0, 0), P(t1, 0)],
      [P(t0, T), P(t1, T)],
    ],
    cutLines: [],
    rebates: [],
    frames: [],
    panels: [],
    glass: [],
    thin: [],
    dashed: [],
    leaves: [],
    center,
    d: f.d,
    out,
    farFace: P(o.offset, T - swingDepth),
  };
  const c = choiceOf(o);
  const framed = o.kind === "window" || (o.kind === "door" && c !== "garage");
  // aanslag: het buitenblad (gevelsteen) komt een paar cm voor het kader
  const rebate = sec.cavity && framed ? REBATE : 0;
  if (rebate) {
    const g = sec.outerLeaf;
    shape.rebates.push(rect(P, t0, t0 + rebate, 0, g), rect(P, t1 - rebate, t1, 0, g));
    shape.cutLines.push(
      [P(t0, 0), P(t0 + rebate, 0)],
      [P(t0 + rebate, 0), P(t0 + rebate, g)],
      [P(t0, g), P(t0 + rebate, g)],
      [P(t1, 0), P(t1 - rebate, 0)],
      [P(t1 - rebate, 0), P(t1 - rebate, g)],
      [P(t1, g), P(t1 - rebate, g)],
      [P(t0, g), P(t0, T)],
      [P(t1, g), P(t1, T)],
    );
  } else {
    shape.cutLines.push([P(t0, 0), P(t0, T)], [P(t1, 0), P(t1, T)]);
  }

  if (o.kind === "passage") return shape;

  if (o.kind === "window") {
    const fd = sec.frameAt;
    // kader: twee stijlen (de onderdorpel ligt onder de snede)
    shape.frames.push(rect(P, t0, t0 + STILE, fd, fd + FRAME_DEPTH), rect(P, t1 - STILE, t1, fd, fd + FRAME_DEPTH));
    const g0 = t0 + STILE;
    const g1 = t1 - STILE;
    const mid = fd + FRAME_DEPTH / 2;
    if (c === "window") {
      // dubbele beglazing
      shape.glass.push([P(g0, mid - 10), P(g1, mid - 10)], [P(g0, mid + 10), P(g1, mid + 10)]);
    } else {
      // schuifraam: twee vleugels die elkaar in het midden overlappen
      const lap = Math.min(100, span / 8);
      const m = o.offset;
      shape.frames.push(rect(P, g0, m + lap, fd + 6, fd + 30), rect(P, m - lap, g1, fd + 40, fd + 64));
      shape.glass.push([P(g0, fd + 18), P(m + lap, fd + 18)], [P(m - lap, fd + 52), P(g1, fd + 52)]);
    }
    if (sec.exterior) {
      // dorpel buiten (onder de snede: dunne lijn) en vensterbank binnen
      const a = t0 + rebate;
      const b = t1 - rebate;
      shape.thin.push([P(a, -SILL_OUT), P(b, -SILL_OUT)], [P(a, -SILL_OUT), P(a, 0)], [P(b, -SILL_OUT), P(b, 0)]);
      if (o.sillHeight > 0)
        shape.thin.push(
          [P(t0 - 20, T + BENCH_IN), P(t1 + 20, T + BENCH_IN)],
          [P(t0 - 20, T), P(t0 - 20, T + BENCH_IN)],
          [P(t1 + 20, T), P(t1 + 20, T + BENCH_IN)],
        );
    }
    return shape;
  }

  // deuren
  if (c === "garage") {
    shape.panels.push(rect(P, t0, t1, T / 2 - 20, T / 2 + 20));
    const inner = swingDepth === 0 ? -400 : T + 400;
    shape.dashed.push([P(t0, inner), P(t1, inner)]);
    return shape;
  }
  // kader: buitendeur in het isolatievlak, binnendeur over de hele muurdikte (omkasting)
  const fd0 = sec.exterior ? sec.frameAt : 0;
  const fd1 = sec.exterior ? sec.frameAt + FRAME_DEPTH : T;
  shape.frames.push(rect(P, t0, t0 + DOOR_FRAME, fd0, fd1), rect(P, t1 - DOOR_FRAME, t1, fd0, fd1));
  const a = t0 + DOOR_FRAME;
  const b = t1 - DOOR_FRAME;
  // het blad draait aan de kaderzijde die naar de draaikant kijkt
  const hingeDepth = swingDepth === 0 ? fd0 : fd1;
  const into = swingDepth === 0 ? -1 : 1; // diepte-richting naar de draaikant
  if (sec.exterior) shape.thin.push([P(a, -SILL_OUT), P(b, -SILL_OUT)], [P(a, -SILL_OUT), P(a, 0)], [P(b, -SILL_OUT), P(b, 0)]);

  if (c === "sliding") {
    // blad tegen de muur aan de draaikant, dicht voor de opening; open stand in stippellijn
    const d0 = swingDepth + into * 15;
    const d1 = swingDepth + into * (15 + LEAF);
    shape.panels.push(rect(P, a - 20, b + 20, d0, d1));
    const shift = swing.hinge === "start" ? -(o.width + 40) : o.width + 40;
    const s0 = a - 20 + shift;
    const s1 = b + 20 + shift;
    const q = [P(s0, d0), P(s1, d0), P(s1, d1), P(s0, d1)];
    shape.dashed.push([q[0], q[1]], [q[1], q[2]], [q[2], q[3]], [q[3], q[0]]);
    return shape;
  }

  const leafAt = (hingeT: number, toward: 1 | -1, width: number) => {
    const H = P(hingeT, hingeDepth);
    const tipT = hingeT;
    // open: loodrecht op de muur, met zijn dikte naar de opening toe
    shape.panels.push([H, P(tipT, hingeDepth + into * width), P(tipT + toward * LEAF, hingeDepth + into * width), P(hingeT + toward * LEAF, hingeDepth)]);
    shape.leaves.push(leaf(H, scale(sub(P(hingeT, hingeDepth + into), H), 1 / length(sub(P(hingeT, hingeDepth + into), H))), P(hingeT + toward * width, hingeDepth), width));
  };
  if (c === "double") {
    leafAt(a, 1, o.width / 2);
    leafAt(b, -1, o.width / 2);
  } else if (swing.hinge === "start") {
    leafAt(a, 1, o.width);
  } else {
    leafAt(b, -1, o.width);
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
    if (Math.abs(t - o.offset) <= openingSpan(o) / 2 + tol && across <= s.left + tol && across >= -s.right - tol) return o;
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
  const span = openingSpan(o);
  const e0 = o.offset - span / 2;
  const e1 = o.offset + span / 2;
  const gaps = cornerGaps(f, o.offset, span);
  const marks: { from: Vec; to: Vec; len: number; out: Vec; kind: "gap" | "width" }[] = [];
  if (gaps.start > 0) marks.push({ from: at(f.startMargin), to: at(e0), len: gaps.start, out, kind: "gap" });
  marks.push({ from: at(e0), to: at(e1), len: span, out, kind: "width" });
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
