/**
 * Het plan als netwerk van knooppunten en muren (hartlijnen met een dikte).
 *
 * Alles hier is zuiver en getest:
 *  - normalizeGraph: knooppunten samenvoegen, muren splitsen waar ze elkaar
 *    raken of kruisen, dubbele muren opruimen (zo "sluiten muren aan");
 *  - findFaces: gesloten ruimtes vinden in het netwerk;
 *  - innerPolygon: de binnenkant van een ruimte (hartlijn min halve muurdikte),
 *    waarop netto vloeroppervlakte en binnenmaten gebaseerd zijn;
 *  - wallPolygons: de omtrek van elke muur, met nette verstekhoeken;
 *  - rebuildFloor: alles samen na elke wijziging, ruimtes behouden hun naam.
 */
import type { Floor, Id, Node, Room, Wall } from "../model/types";
import { signedArea } from "./polygon";
import { add, cross, dot, length, scale, sub, type Vec } from "./vec";

/** Tolerantie in mm: alles wat dichter ligt, valt samen. */
export const EPS = 2;

export interface Graph {
  nodes: Node[];
  walls: Wall[];
}

export type IdGen = () => string;
const defaultId: IdGen = () => globalThis.crypto.randomUUID();

/* ------------------------------------------------------------------ */
/* Normaliseren                                                         */
/* ------------------------------------------------------------------ */

function mergeNodes(nodes: Node[], walls: Wall[]): Graph {
  const keep: Node[] = [];
  const map = new Map<Id, Id>();
  for (const n of nodes) {
    const hit = keep.find((k) => Math.abs(k.x - n.x) <= EPS && Math.abs(k.y - n.y) <= EPS);
    if (hit) map.set(n.id, hit.id);
    else {
      keep.push(n);
      map.set(n.id, n.id);
    }
  }
  const ws = walls
    .map((w) => {
      const s = map.get(w.start) ?? w.start;
      const e = map.get(w.end) ?? w.end;
      return s === w.start && e === w.end ? w : { ...w, start: s, end: e };
    })
    .filter((w) => w.start !== w.end);
  return { nodes: keep, walls: ws };
}

/** Snijpunt van twee lijnstukken, enkel als het strikt binnen beide ligt. */
export function segmentIntersection(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(c, a), s) / den;
  const u = cross(sub(c, a), r) / den;
  const lr = length(r);
  const ls = length(s);
  if (t * lr <= EPS || (1 - t) * lr <= EPS || u * ls <= EPS || (1 - u) * ls <= EPS) return null;
  return add(a, scale(r, t));
}

function addIntersections(nodes: Node[], walls: Wall[], newId: IdGen): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const extra: Node[] = [];
  for (let i = 0; i < walls.length; i++) {
    const w1 = walls[i];
    const a = byId.get(w1.start);
    const b = byId.get(w1.end);
    if (!a || !b) continue;
    for (let j = i + 1; j < walls.length; j++) {
      const w2 = walls[j];
      if (w2.start === w1.start || w2.start === w1.end || w2.end === w1.start || w2.end === w1.end)
        continue;
      const c = byId.get(w2.start);
      const d = byId.get(w2.end);
      if (!c || !d) continue;
      const p = segmentIntersection(a, b, c, d);
      if (p) extra.push({ id: newId(), x: Math.round(p.x), y: Math.round(p.y) });
    }
  }
  return extra.length ? [...nodes, ...extra] : nodes;
}

function splitAtNodes(nodes: Node[], walls: Wall[], newId: IdGen): Wall[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Wall[] = [];
  for (const w of walls) {
    const a = byId.get(w.start);
    const b = byId.get(w.end);
    if (!a || !b) continue;
    const ab = sub(b, a);
    const len = length(ab);
    if (len <= EPS) continue;
    const hits: { id: Id; t: number }[] = [];
    for (const n of nodes) {
      if (n.id === w.start || n.id === w.end) continue;
      // snelle uitsluiting via omhullende rechthoek
      if (
        n.x < Math.min(a.x, b.x) - EPS ||
        n.x > Math.max(a.x, b.x) + EPS ||
        n.y < Math.min(a.y, b.y) - EPS ||
        n.y > Math.max(a.y, b.y) + EPS
      )
        continue;
      const t = dot(sub(n, a), ab) / (len * len);
      if (t * len <= EPS || (1 - t) * len <= EPS) continue;
      const p = add(a, scale(ab, t));
      if (Math.hypot(n.x - p.x, n.y - p.y) <= EPS) hits.push({ id: n.id, t });
    }
    if (hits.length === 0) {
      out.push(w);
      continue;
    }
    hits.sort((p, q) => p.t - q.t);
    let prev = w.start;
    hits.forEach((h, i) => {
      out.push({ ...w, id: i === 0 ? w.id : newId(), start: prev, end: h.id });
      prev = h.id;
    });
    out.push({ ...w, id: newId(), start: prev, end: w.end });
  }
  return out;
}

function dedupeWalls(walls: Wall[]): Wall[] {
  const seen = new Set<string>();
  const out: Wall[] = [];
  for (const w of walls) {
    const key = w.start < w.end ? `${w.start}|${w.end}` : `${w.end}|${w.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/**
 * Maakt van een losse verzameling muren een net netwerk: wat op elkaar valt,
 * wordt één knooppunt; een muur die tegen een andere eindigt of hem kruist,
 * deelt hem op; dubbele muren verdwijnen (de oudste blijft).
 */
export function normalizeGraph(g: Graph, newId: IdGen = defaultId): Graph {
  let nodes = g.nodes.map((n) =>
    Number.isInteger(n.x) && Number.isInteger(n.y) ? n : { ...n, x: Math.round(n.x), y: Math.round(n.y) },
  );
  let walls = g.walls;
  ({ nodes, walls } = mergeNodes(nodes, walls));
  nodes = addIntersections(nodes, walls, newId);
  ({ nodes, walls } = mergeNodes(nodes, walls));
  walls = dedupeWalls(splitAtNodes(nodes, walls, newId));
  const used = new Set<Id>();
  for (const w of walls) {
    used.add(w.start);
    used.add(w.end);
  }
  return { nodes: nodes.filter((n) => used.has(n.id)), walls };
}

/* ------------------------------------------------------------------ */
/* Ruimtes vinden                                                       */
/* ------------------------------------------------------------------ */

export interface HalfEdge {
  wall: Wall;
  from: Node;
  to: Node;
}

export interface Face {
  edges: HalfEdge[];
  /** Hartlijn-veelhoek. */
  polygon: Vec[];
  signed: number;
}

/** Laat losse uiteinden weg: die omsluiten nooit een ruimte. */
function pruneDangling(walls: Wall[]): Wall[] {
  let ws = walls;
  for (;;) {
    const deg = new Map<Id, number>();
    for (const w of ws) {
      deg.set(w.start, (deg.get(w.start) ?? 0) + 1);
      deg.set(w.end, (deg.get(w.end) ?? 0) + 1);
    }
    const next = ws.filter((w) => (deg.get(w.start) ?? 0) > 1 && (deg.get(w.end) ?? 0) > 1);
    if (next.length === ws.length) return ws;
    ws = next;
  }
}

/**
 * Alle vlakken van het netwerk. Begrensde ruimtes hebben een positieve
 * oppervlakte; het "buitenvlak" rond elk los geheel een negatieve.
 */
export function findFaces(g: Graph): { bounded: Face[]; outer: Face[] } {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const walls = pruneDangling(g.walls);
  const out = new Map<Id, { wall: Wall; to: Node; angle: number }[]>();
  for (const w of walls) {
    const a = byId.get(w.start);
    const b = byId.get(w.end);
    if (!a || !b) continue;
    (out.get(a.id) ?? out.set(a.id, []).get(a.id)!).push({ wall: w, to: b, angle: Math.atan2(b.y - a.y, b.x - a.x) });
    (out.get(b.id) ?? out.set(b.id, []).get(b.id)!).push({ wall: w, to: a, angle: Math.atan2(a.y - b.y, a.x - b.x) });
  }
  for (const list of out.values()) list.sort((p, q) => p.angle - q.angle);

  const visited = new Set<string>();
  const key = (w: Wall, from: Id) => `${w.id}:${from}`;
  const bounded: Face[] = [];
  const outer: Face[] = [];

  for (const [startId, list] of out) {
    for (const first of list) {
      if (visited.has(key(first.wall, startId))) continue;
      const edges: HalfEdge[] = [];
      let from = byId.get(startId)!;
      let cur = first;
      let guard = 0;
      while (!visited.has(key(cur.wall, from.id)) && guard++ < 10000) {
        visited.add(key(cur.wall, from.id));
        edges.push({ wall: cur.wall, from, to: cur.to });
        const at = cur.to;
        const outs = out.get(at.id)!;
        const back = outs.findIndex((o) => o.wall.id === cur.wall.id && o.to.id === from.id);
        // volgende muur: de eerstvolgende met de klok mee na de terugweg
        const nxt = outs[(back - 1 + outs.length) % outs.length];
        from = at;
        cur = nxt;
      }
      const polygon = edges.map((e) => ({ x: e.from.x, y: e.from.y }));
      const signed = signedArea(polygon);
      const face = { edges, polygon, signed };
      if (signed > 1) bounded.push(face);
      else outer.push(face);
    }
  }
  return { bounded, outer };
}

/* ------------------------------------------------------------------ */
/* Binnenkant, oppervlakte en verstekhoeken                             */
/* ------------------------------------------------------------------ */

function lineIntersection(p1: Vec, d1: Vec, p2: Vec, d2: Vec): Vec | null {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, scale(d1, t));
}

const unit = (v: Vec): Vec => {
  const l = length(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};

/** Linkernormaal (−dy, dx); bij een positieve veelhoek wijst die naar binnen. */
const leftNormal = (d: Vec): Vec => ({ x: -d.y, y: d.x });

/**
 * De binnenkant van een ruimte: elke zijde schuift de halve muurdikte naar
 * binnen, hoeken worden opnieuw gesneden. Geeft per zijde ook de muur terug.
 */
export function innerPolygon(face: Face): { points: Vec[]; walls: Id[] } {
  const n = face.edges.length;
  const lines = face.edges.map((e) => {
    const d = unit(sub(e.to, e.from));
    const nrm = leftNormal(d);
    return { p: add(e.from, scale(nrm, e.wall.thickness / 2)), d, nrm, e };
  });
  const points: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const hit = lineIntersection(prev.p, prev.d, cur.p, cur.d);
    points.push(hit ?? add(cur.e.from, scale(cur.nrm, cur.e.wall.thickness / 2)));
  }
  return { points, walls: face.edges.map((e) => e.wall.id) };
}

/**
 * Omtrek van elke muur als veelhoek, met verstek waar muren samenkomen.
 * Bij heel scherpe hoeken valt hij terug op een rechte afsluiting.
 */
export function wallPolygons(g: Graph): Map<Id, Vec[]> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  type End = { wall: Wall; d: Vec; h: number; angle: number };
  const ends = new Map<Id, End[]>();
  for (const w of g.walls) {
    const a = byId.get(w.start);
    const b = byId.get(w.end);
    if (!a || !b) continue;
    const d = unit(sub(b, a));
    const h = w.thickness / 2;
    (ends.get(a.id) ?? ends.set(a.id, []).get(a.id)!).push({ wall: w, d, h, angle: Math.atan2(d.y, d.x) });
    const nd = scale(d, -1);
    (ends.get(b.id) ?? ends.set(b.id, []).get(b.id)!).push({ wall: w, d: nd, h, angle: Math.atan2(nd.y, nd.x) });
  }
  // per knooppunt en muur: hoek links (L) en rechts (R) van de muur, uitgaand bekeken
  const corners = new Map<string, { L: Vec; R: Vec }>();
  for (const [nodeId, list] of ends) {
    const p = byId.get(nodeId)!;
    list.sort((x, y) => x.angle - y.angle);
    const k = list.length;
    for (let i = 0; i < k; i++) {
      const e = list[i];
      const l = leftNormal(e.d);
      let L = add(p, scale(l, e.h));
      let R = add(p, scale(l, -e.h));
      if (k === 2) {
        // gewone hoek: verstek
        const other = list[(i + 1) % k];
        const ol = leftNormal(other.d);
        const hitL = lineIntersection(L, e.d, add(p, scale(ol, -other.h)), other.d);
        const hitR = lineIntersection(R, e.d, add(p, scale(ol, other.h)), other.d);
        const lim = 4 * Math.max(e.h, other.h);
        if (hitL && length(sub(hitL, p)) <= lim) L = hitL;
        if (hitR && length(sub(hitR, p)) <= lim) R = hitR;
      } else if (k > 2) {
        // T- of kruisaansluiting: elke muur loopt door tot de verste rand van de andere;
        // overlappingen zijn onzichtbaar want alle muren hebben dezelfde kleur
        const ext = Math.max(...list.filter((o) => o !== e).map((o) => o.h));
        L = add(L, scale(e.d, -ext));
        R = add(R, scale(e.d, -ext));
      }
      corners.set(`${nodeId}|${e.wall.id}`, { L, R });
    }
  }
  const polys = new Map<Id, Vec[]>();
  for (const w of g.walls) {
    const A = corners.get(`${w.start}|${w.id}`);
    const B = corners.get(`${w.end}|${w.id}`);
    if (!A || !B) continue;
    polys.set(w.id, [A.L, B.R, B.L, A.R]);
  }
  return polys;
}

/* ------------------------------------------------------------------ */
/* Opnieuw opbouwen na een wijziging                                     */
/* ------------------------------------------------------------------ */

export const ROOM_FUNCTIONS = [
  ["living", "Living"],
  ["keuken", "Keuken"],
  ["eetkamer", "Eetkamer"],
  ["slaapkamer", "Slaapkamer"],
  ["badkamer", "Badkamer"],
  ["toilet", "Toilet"],
  ["bureau", "Bureau"],
  ["hal", "Hal"],
  ["berging", "Berging"],
  ["wasplaats", "Wasplaats"],
  ["technisch", "Technische ruimte"],
  ["garage", "Garage"],
  ["andere", "Andere"],
] as const;

/** Soort ruimte, voor de kleur op het plan. */
export type RoomCategory = "leven" | "slapen" | "nat" | "doorgang" | "berging" | "andere";

export function roomCategory(fn: string): RoomCategory {
  switch (fn) {
    case "living":
    case "keuken":
    case "eetkamer":
    case "bureau":
      return "leven";
    case "slaapkamer":
      return "slapen";
    case "badkamer":
    case "toilet":
    case "wasplaats":
      return "nat";
    case "hal":
      return "doorgang";
    case "berging":
    case "technisch":
    case "garage":
      return "berging";
    default:
      return "andere";
  }
}

/**
 * Telt mee voor de bewoonbare oppervlakte (zoals je ze in België meestal
 * opgeeft): niet de garage, berging, technische ruimte of een kelder.
 */
export function isHabitable(fn: string, floorElevation: number): boolean {
  if (floorElevation < 0) return false;
  return !["garage", "berging", "technisch"].includes(fn);
}

export const FLOOR_FINISHES = [
  ["", "Nog niet gekozen"],
  ["parket", "Parket"],
  ["laminaat", "Laminaat"],
  ["tegels", "Tegels"],
  ["vinyl", "Vinyl"],
  ["gietvloer", "Gietvloer"],
  ["tapijt", "Tapijt"],
] as const;

export function functionLabel(fn: string): string {
  return ROOM_FUNCTIONS.find(([v]) => v === fn)?.[1] ?? "Ruimte";
}

function jaccard(a: Id[], b: Set<Id>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.length + b.size - inter || 1);
}

/**
 * Koppelt gevonden ruimtes aan bestaande, zodat namen en functies blijven.
 * Eerst op gedeelde muren; lukt dat niet (na grote wijzigingen), dan op
 * ligging: een ruimte die over de plek van een oude ruimte ligt, erft haar naam.
 */
export function reconcileRooms(
  faces: Face[],
  old: Room[],
  newId: IdGen = defaultId,
  oldCenters: Map<Id, Vec> = new Map(),
): Room[] {
  const used = new Set<Id>();
  const candidates = faces.map((f, i) => {
    const ids = f.edges.map((e) => e.wall.id);
    let best: { room: Room; score: number } | null = null;
    for (const r of old) {
      const s = jaccard(ids, new Set(r.walls));
      if (s >= 0.2 && (!best || s > best.score)) best = { room: r, score: s };
    }
    return { i, ids, best, area: f.signed, polygon: f.polygon };
  });
  // sterkste overeenkomsten eerst; bij een gesplitste kamer houdt het grootste deel de naam
  candidates.sort(
    (p, q) =>
      Math.round(((q.best?.score ?? 0) - (p.best?.score ?? 0)) * 10) || q.area - p.area,
  );
  const result: Room[] = new Array(faces.length);
  const pending: typeof candidates = [];
  for (const c of candidates) {
    if (c.best && !used.has(c.best.room.id)) {
      used.add(c.best.room.id);
      result[c.i] = { ...c.best.room, walls: c.ids };
    } else pending.push(c);
  }
  let counter = old.length;
  for (const c of pending) {
    const byPlace = old.find((r) => !used.has(r.id) && oldCenters.has(r.id) && pointInPolygon(oldCenters.get(r.id)!, c.polygon));
    if (byPlace) {
      used.add(byPlace.id);
      result[c.i] = { ...byPlace, walls: c.ids };
    } else {
      counter++;
      result[c.i] = { id: newId(), walls: c.ids, name: `Ruimte ${counter}`, function: "andere", floorFinish: "" };
    }
  }
  return result;
}

/** Absolute plaats van elke opening, zodat ze na een wijziging terug aan een muur kan. */
function openingPositions(floor: Floor): Map<Id, { p: Vec; dir: Vec }> {
  const byId = new Map(floor.nodes.map((n) => [n.id, n]));
  const out = new Map<Id, { p: Vec; dir: Vec }>();
  for (const o of floor.openings) {
    const w = floor.walls.find((x) => x.id === o.wall);
    const a = w && byId.get(w.start);
    const b = w && byId.get(w.end);
    if (!a || !b) continue;
    const d = unit(sub(b, a));
    out.set(o.id, { p: add(a, scale(d, o.offset)), dir: d });
  }
  return out;
}

/**
 * Na elke wijziging aan muren: netwerk netjes maken, ruimtes zoeken en hun
 * gegevens behouden, muren indelen als buiten- of binnenmuur, en deuren en
 * ramen terug aan de juiste muur hangen (ook als die in stukken viel).
 */
export function rebuildFloor(floor: Floor, newId: IdGen = defaultId, previous?: Floor): Floor {
  // waar lagen de ruimtes vóór deze wijziging? (om namen op ligging te kunnen behouden)
  const oldCenters = new Map<Id, Vec>();
  if (previous) for (const r of analyzeFloor(previous).rooms) oldCenters.set(r.room.id, r.center);
  const openingPos = openingPositions(floor);

  const g = normalizeGraph({ nodes: floor.nodes, walls: floor.walls }, newId);
  const { bounded, outer } = findFaces(g);
  const rooms = reconcileRooms(bounded, floor.rooms, newId, oldCenters);
  const outerWalls = new Set(outer.flatMap((f) => f.edges.map((e) => e.wall.id)));
  const roomWalls = new Set(bounded.flatMap((f) => f.edges.map((e) => e.wall.id)));
  const walls = g.walls.map((w) => {
    const kind = !roomWalls.has(w.id) ? w.kind : outerWalls.has(w.id) ? "exterior" : "interior";
    return kind === w.kind ? w : { ...w, kind };
  });

  // openingen terug aan een muur: de muur die door hun punt loopt, in dezelfde richting
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const openings = floor.openings.flatMap((o) => {
    const pos = openingPos.get(o.id);
    if (!pos) return [];
    for (const w of walls) {
      const a = byId.get(w.start);
      const b = byId.get(w.end);
      if (!a || !b) continue;
      const d = unit(sub(b, a));
      if (Math.abs(cross(d, pos.dir)) > 1e-3) continue;
      const c = closestPoint(pos.p, a, b);
      if (c.dist > EPS + 1 || c.t <= 0 || c.t >= 1) continue;
      return [{ ...o, wall: w.id, offset: Math.round(length(sub(pos.p, a))) }];
    }
    return [];
  });

  return { ...floor, nodes: g.nodes, walls, rooms, openings };
}

function closestPoint(p: Vec, a: Vec, b: Vec): { t: number; dist: number } {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  const t = L2 === 0 ? 0 : dot(sub(p, a), ab) / L2;
  const q = add(a, scale(ab, Math.max(0, Math.min(1, t))));
  return { t, dist: length(sub(p, q)) };
}

/* ------------------------------------------------------------------ */
/* Analyse voor het tekenen en de overzichten                           */
/* ------------------------------------------------------------------ */

export interface RoomInfo {
  room: Room;
  /** Binnenkant (netto). */
  inner: Vec[];
  /** Per zijde van de binnenkant de muur. */
  edgeWalls: Id[];
  /** Netto vloeroppervlakte in mm². */
  area: number;
  center: Vec;
}

export interface FloorAnalysis {
  rooms: RoomInfo[];
  wallPolys: Map<Id, Vec[]>;
  nodeById: Map<Id, Node>;
  /** Omhullende rechthoek van alle muren (buitenmaat), of null. */
  outerBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Buitenomtrek(ken) van het gebouw: de buitenkant van de buitenmuren. */
  outerContours: Vec[][];
  /** Losse muren die geen ruimte of gevel vormen (bv. een halfhoge muur). */
  looseWalls: Id[];
  totalArea: number;
}

/** Een representatief punt binnen een veelhoek (voor het label). */
function labelPoint(poly: Vec[]): Vec {
  // zwaartepunt, en als dat buiten valt: het midden van de langste horizontale doorsnede
  const A = signedArea(poly);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  const c = Math.abs(A) > 1e-6 ? { x: cx / (6 * A), y: cy / (6 * A) } : poly[0];
  if (pointInPolygon(c, poly)) return c;
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if ((p.y > c.y) !== (q.y > c.y)) xs.push(p.x + ((c.y - p.y) / (q.y - p.y)) * (q.x - p.x));
  }
  xs.sort((a, b) => a - b);
  let best = c;
  let bestW = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > bestW) {
      bestW = xs[i + 1] - xs[i];
      best = { x: (xs[i] + xs[i + 1]) / 2, y: c.y };
    }
  }
  return best;
}

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Verdiepingen zijn onveranderlijk: dezelfde verdieping wordt nooit twee keer doorgerekend. */
const analysisCache = new WeakMap<Floor, FloorAnalysis>();

export function analyzeFloor(floor: Floor): FloorAnalysis {
  const hit = analysisCache.get(floor);
  if (hit) return hit;
  const result = computeAnalysis(floor);
  analysisCache.set(floor, result);
  return result;
}

function computeAnalysis(floor: Floor): FloorAnalysis {
  const g = { nodes: floor.nodes, walls: floor.walls };
  const { bounded, outer } = findFaces(g);
  const byWalls = new Map(floor.rooms.map((r) => [[...r.walls].sort().join(","), r]));
  // het buitenvlak naar buiten verschuiven geeft de buitenkant van de gevels
  const outerContours = outer
    .filter((f) => f.edges.length >= 3 && Math.abs(f.signed) > 1)
    .map((f) => innerPolygon(f).points);
  const rooms: RoomInfo[] = bounded.map((f, i) => {
    const { points, walls } = innerPolygon(f);
    const key = [...walls].sort().join(",");
    const room =
      byWalls.get(key) ??
      floor.rooms[i] ?? { id: `tmp-${i}`, walls, name: "Ruimte", function: "andere", floorFinish: "" };
    return { room, inner: points, edgeWalls: walls, area: Math.abs(signedArea(points)), center: labelPoint(points) };
  });
  const wallPolys = wallPolygons(g);
  let outerBounds: FloorAnalysis["outerBounds"] = null;
  for (const poly of wallPolys.values()) {
    for (const p of poly) {
      if (!outerBounds) outerBounds = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
      else {
        outerBounds.minX = Math.min(outerBounds.minX, p.x);
        outerBounds.minY = Math.min(outerBounds.minY, p.y);
        outerBounds.maxX = Math.max(outerBounds.maxX, p.x);
        outerBounds.maxY = Math.max(outerBounds.maxY, p.y);
      }
    }
  }
  return {
    rooms,
    wallPolys,
    nodeById: new Map(floor.nodes.map((n) => [n.id, n])),
    outerBounds,
    outerContours,
    looseWalls: (() => {
      const used = new Set([...bounded, ...outer].flatMap((f) => f.edges.map((e) => e.wall.id)));
      return floor.walls.filter((w) => !used.has(w.id)).map((w) => w.id);
    })(),
    totalArea: rooms.reduce((s, r) => s + r.area, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Bewerkingen                                                          */
/* ------------------------------------------------------------------ */

export interface WallProps {
  thickness: number;
  height: number;
  kind: Wall["kind"];
  loadBearing: boolean;
}

/** Voegt een reeks punten toe als aaneengesloten muren. */
export function addPolyline(floor: Floor, pts: Vec[], props: WallProps, newId: IdGen = defaultId): Floor {
  if (pts.length < 2) return floor;
  const nodes = pts.map((p) => ({ id: newId(), x: Math.round(p.x), y: Math.round(p.y) }));
  const walls: Wall[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    walls.push({ id: newId(), start: nodes[i].id, end: nodes[i + 1].id, ...props });
  }
  return rebuildFloor(
    { ...floor, nodes: [...floor.nodes, ...nodes], walls: [...floor.walls, ...walls] },
    newId,
    floor,
  );
}

/** Rechthoekige ruimte waarvan de hartlijnen van (x0,y0) tot (x1,y1) lopen. */
export function addRectangle(floor: Floor, a: Vec, b: Vec, props: WallProps, newId: IdGen = defaultId): Floor {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const pts = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];
  return addPolyline(floor, pts, props, newId);
}

/** Verplaatst knooppunten (bv. een hoek of de twee uiteinden van een muur). */
export function moveNodes(floor: Floor, moves: Map<Id, Vec>): Floor {
  return {
    ...floor,
    nodes: floor.nodes.map((n) => {
      const m = moves.get(n.id);
      return m ? { ...n, x: Math.round(m.x), y: Math.round(m.y) } : n;
    }),
  };
}

/**
 * "Rekken": alles wat voorbij een snijlijn ligt (in richting u) schuift
 * `delta` mm op. Zo wordt een kamer breder en schuift de rest van het plan
 * netjes mee, zonder schuine muren.
 * Geeft null als er een knooppunt in de weg zou liggen bij inkrimpen.
 */
export function stretch(floor: Floor, u: Vec, cut: number, delta: number): Floor | null {
  const dir = unit(u);
  if (delta < 0) {
    const blocked = floor.nodes.some((n) => {
      const s = dot(n, dir);
      return s < cut - EPS && s > cut + delta + EPS;
    });
    if (blocked) return null;
  }
  return {
    ...floor,
    nodes: floor.nodes.map((n) =>
      dot(n, dir) >= cut - EPS
        ? { ...n, x: Math.round(n.x + dir.x * delta), y: Math.round(n.y + dir.y * delta) }
        : n,
    ),
  };
}

/** Verwijdert muren; ruimtes die erdoor openvallen, verdwijnen vanzelf. */
export function removeWalls(floor: Floor, ids: Set<Id>, newId: IdGen = defaultId): Floor {
  return rebuildFloor({ ...floor, walls: floor.walls.filter((w) => !ids.has(w.id)) }, newId, floor);
}

/** Muren die enkel bij deze ruimte horen (niet gedeeld met een andere ruimte). */
export function ownWalls(floor: Floor, roomId: Id): Set<Id> {
  const room = floor.rooms.find((r) => r.id === roomId);
  if (!room) return new Set();
  const others = new Set(floor.rooms.filter((r) => r.id !== roomId).flatMap((r) => r.walls));
  return new Set(room.walls.filter((w) => !others.has(w)));
}

export function wallLength(floor: Floor, w: Wall): number {
  const a = floor.nodes.find((n) => n.id === w.start);
  const b = floor.nodes.find((n) => n.id === w.end);
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
}

/**
 * Muurdikte aanpassen. Met een "ankerkamer" blijft de binnenmaat van die kamer
 * gelijk: de muur schuift dan opzij en enkel de kamer aan de andere kant
 * verandert. Zonder anker blijft de hartlijn liggen.
 *
 * Loopt de muur rechtdoor verder als een muur die niet verandert (bv. de
 * gedeelde muur is maar een stuk van een lange gevel), dan krijgt het plan op
 * dat punt een kleine sprong in plaats van een schuine muur.
 */
export function setWallThickness(
  floor: Floor,
  wallIds: Id[],
  thickness: number,
  anchor: Id | null | ((wallId: Id) => Id | null),
  newId: IdGen = defaultId,
): Floor {
  const a = analyzeFloor(floor);
  const byId = new Map(floor.nodes.map((n) => [n.id, n]));
  const targets = new Set(wallIds.filter((id) => floor.walls.find((w) => w.id === id && w.thickness !== thickness)));
  // verschuiving per muur (langs zijn normaal)
  const shiftOf = new Map<Id, Vec>();
  for (const id of targets) {
    const w = floor.walls.find((x) => x.id === id)!;
    const roomId = typeof anchor === "function" ? anchor(id) : anchor;
    const room = roomId ? a.rooms.find((r) => r.room.id === roomId) : null;
    if (!room) {
      shiftOf.set(id, { x: 0, y: 0 });
      continue;
    }
    const A = byId.get(w.start)!;
    const B = byId.get(w.end)!;
    const d = unit(sub(B, A));
    let n = leftNormal(d);
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    if (!pointInPolygon(add(mid, scale(n, w.thickness / 2 + 5)), room.inner)) n = scale(n, -1);
    shiftOf.set(id, scale(n, (w.thickness - thickness) / 2));
  }

  let nodes = [...floor.nodes];
  let walls = floor.walls.map((w) => (targets.has(w.id) ? { ...w, thickness } : w));
  const extraWalls: Wall[] = [];
  for (const node of floor.nodes) {
    const here = floor.walls.filter((w) => w.start === node.id || w.end === node.id);
    const moved = here.filter((w) => targets.has(w.id));
    if (moved.length === 0) continue;
    // som van de verschuivingen, maar evenwijdige verschuivingen maar één keer
    const vs: Vec[] = [];
    for (const w of moved) {
      const v = shiftOf.get(w.id)!;
      if (!vs.some((u) => Math.abs(cross(u, v)) < 1e-6 && dot(u, v) > 0)) vs.push(v);
    }
    const v = vs.reduce((acc, u) => add(acc, u), { x: 0, y: 0 });
    if (Math.hypot(v.x, v.y) < 0.5) continue;
    const dirOf = (w: Wall) => {
      const o = byId.get(w.start === node.id ? w.end : w.start)!;
      return unit(sub(o, node));
    };
    // muren die rechtdoor verder lopen en zelf niet veranderen
    const continuing = here.filter(
      (w) => !targets.has(w.id) && moved.some((m) => Math.abs(cross(dirOf(m), dirOf(w))) < 1e-6),
    );
    const target = { x: Math.round(node.x + v.x), y: Math.round(node.y + v.y) };
    if (continuing.length === 0) {
      nodes = nodes.map((n) => (n.id === node.id ? { ...n, ...target } : n));
    } else {
      // sprong: nieuw knooppunt voor wat verschuift, een kort muurstuk ertussen
      const nn = { id: newId(), ...target };
      nodes.push(nn);
      const keep = new Set(continuing.map((w) => w.id));
      walls = walls.map((w) => {
        if (keep.has(w.id)) return w;
        if (w.start === node.id) return { ...w, start: nn.id };
        if (w.end === node.id) return { ...w, end: nn.id };
        return w;
      });
      const c = continuing[0];
      extraWalls.push({ ...c, id: newId(), start: node.id, end: nn.id });
    }
  }
  return rebuildFloor({ ...floor, nodes, walls: [...walls, ...extraWalls] }, newId, floor);
}

/**
 * Een rechthoekige kamer plaatsen met binnenmaten zoals getekend of getypt.
 * Zijden die op een bestaande muur vallen, delen die muur: een buitenmuur wordt
 * dan een binnenmuur, de bestaande kamer blijft even groot en de nieuwe kamer
 * krijgt exact haar binnenmaat.
 *
 * `a` en `b` zijn de hartlijnhoeken in de veronderstelling dat alle muren
 * `props.thickness` dik zijn (zo rekent het kamergereedschap).
 */
export function placeRoom(
  floor: Floor,
  a: Vec,
  b: Vec,
  props: WallProps,
  interiorThickness: number,
  newId: IdGen = defaultId,
): { floor: Floor; roomId: Id | null } {
  let x0 = Math.min(a.x, b.x);
  let x1 = Math.max(a.x, b.x);
  let y0 = Math.min(a.y, b.y);
  let y1 = Math.max(a.y, b.y);
  const byId = new Map(floor.nodes.map((n) => [n.id, n]));
  const tE = props.thickness;
  /** Dikte van een bestaande muur op deze lijn, als die de zijde overlapt. */
  const existingOn = (vertical: boolean, at: number, from: number, to: number): number | null => {
    for (const w of floor.walls) {
      const p = byId.get(w.start);
      const q = byId.get(w.end);
      if (!p || !q) continue;
      if (vertical) {
        if (Math.abs(p.x - at) > EPS || Math.abs(q.x - at) > EPS) continue;
        const lo = Math.min(p.y, q.y);
        const hi = Math.max(p.y, q.y);
        if (Math.min(hi, to) - Math.max(lo, from) > EPS) return w.thickness;
      } else {
        if (Math.abs(p.y - at) > EPS || Math.abs(q.y - at) > EPS) continue;
        const lo = Math.min(p.x, q.x);
        const hi = Math.max(p.x, q.x);
        if (Math.min(hi, to) - Math.max(lo, from) > EPS) return w.thickness;
      }
    }
    return null;
  };
  // eindtoestand van een gedeelde zijde: een buitenmuur wordt binnenmuur
  const finalT = (tExisting: number) => (tExisting === tE ? interiorThickness : tExisting);
  // hoeveel de kamer groeit langs een gedeelde zijde, en dus aan de overkant terug moet
  const grow = (tExisting: number) => tE / 2 + tExisting / 2 - finalT(tExisting);
  const left = existingOn(true, x0, y0, y1);
  const right = existingOn(true, x1, y0, y1);
  const top = existingOn(false, y0, x0, x1);
  const bottom = existingOn(false, y1, x0, x1);
  if (left !== null && right === null) x1 -= grow(left);
  if (right !== null && left === null) x0 += grow(right);
  if (top !== null && bottom === null) y1 -= grow(top);
  if (bottom !== null && top === null) y0 += grow(bottom);

  const before = new Set(floor.rooms.map((r) => r.id));
  let after = addRectangle(floor, { x: x0, y: y0 }, { x: x1, y: y1 }, props, newId);
  const fresh = after.rooms.find((r) => !before.has(r.id));
  if (!fresh) return { floor: after, roomId: null };
  const shared = sharedWalls(after, fresh.id).filter((id) => after.walls.find((w) => w.id === id)?.thickness === tE);
  if (shared.length) {
    // de bestaande kamer aan de andere kant is het anker: zij blijft even groot
    const owners = new Map<Id, Id>();
    for (const r of after.rooms) if (r.id !== fresh.id) for (const w of r.walls) owners.set(w, r.id);
    after = setWallThickness(after, shared, interiorThickness, (id) => owners.get(id) ?? null, newId);
  }
  const center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const room = analyzeFloor(after).rooms.find((r) => pointInPolygon(center, r.inner));
  return { floor: after, roomId: room?.room.id ?? fresh.id };
}

/** Muren die een ruimte delen met een andere ruimte. */
export function sharedWalls(floor: Floor, roomId: Id): Id[] {
  const room = floor.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const others = new Set(floor.rooms.filter((r) => r.id !== roomId).flatMap((r) => r.walls));
  return room.walls.filter((w) => others.has(w));
}

/** Bewoonbare en totale netto oppervlakte van een verdieping (mm²). */
export function floorAreas(floor: Floor): { total: number; habitable: number } {
  const a = analyzeFloor(floor);
  let habitable = 0;
  for (const r of a.rooms) if (isHabitable(r.room.function, floor.elevation)) habitable += r.area;
  return { total: a.totalArea, habitable };
}
