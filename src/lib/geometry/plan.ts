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
import { clipToRect, signedArea } from "./polygon";
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
 * Hoe ver het muurlichaam links en rechts van de lijn reikt (in de richting
 * start → end). Een uitgelijnde muur kan aan één kant zelfs negatief reiken:
 * dan ligt het hele lichaam aan de andere kant van de lijn.
 */
export function wallSides(w: Wall): { left: number; right: number } {
  const o = w.offset ?? 0;
  return { left: w.thickness / 2 + o, right: w.thickness / 2 - o };
}

/** Reikwijdte van de muur aan de linkerkant van een halve rand (from → to). */
function leftExtent(w: Wall, fromId: Id): number {
  const s = wallSides(w);
  return fromId === w.start ? s.left : s.right;
}

/** Zet de uitlijning zo dat de muur `ext` mm reikt in richting `v` (vanaf de lijn). */
function withExtentToward(w: Wall, a: Vec, b: Vec, v: Vec, ext: number, thickness = w.thickness): Wall {
  const n = leftNormal(unit(sub(b, a)));
  const o = Math.round(dot(n, v) > 0 ? ext - thickness / 2 : thickness / 2 - ext);
  const { offset: _old, ...rest } = w;
  void _old;
  return o === 0 ? { ...rest, thickness } : { ...rest, thickness, offset: o };
}

/** Hoe ver de muur reikt in richting `v` (loodrecht op de muur). */
function extentToward(w: Wall, a: Vec, b: Vec, v: Vec): number {
  const n = leftNormal(unit(sub(b, a)));
  const s = wallSides(w);
  return dot(n, v) > 0 ? s.left : s.right;
}

/** De middellijn van het muurlichaam (voor aanklikken en voorbeeldjes). */
export function wallBodyLine(w: Wall, a: Vec, b: Vec): [Vec, Vec] {
  const o = w.offset ?? 0;
  if (!o) return [a, b];
  const n = scale(leftNormal(unit(sub(b, a))), o);
  return [add(a, n), add(b, n)];
}

/**
 * De binnenkant van een ruimte: elke zijde schuift de halve muurdikte naar
 * binnen, hoeken worden opnieuw gesneden. Geeft per zijde ook de muur terug.
 */
export function innerPolygon(face: Face): { points: Vec[]; walls: Id[] } {
  const n = face.edges.length;
  const lines = face.edges.map((e) => {
    const d = unit(sub(e.to, e.from));
    const nrm = leftNormal(d);
    return { p: add(e.from, scale(nrm, leftExtent(e.wall, e.from.id))), d, nrm, e };
  });
  const points: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const hit = lineIntersection(prev.p, prev.d, cur.p, cur.d);
    points.push(hit ?? cur.p);
  }
  return { points, walls: face.edges.map((e) => e.wall.id) };
}

/**
 * Omtrek van elke muur als veelhoek, met verstek waar muren samenkomen.
 * Bij heel scherpe hoeken valt hij terug op een rechte afsluiting.
 */
export function wallPolygons(g: Graph): Map<Id, Vec[]> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  // hL/hR: hoe ver de muur links/rechts reikt, uitgaand vanaf het knooppunt bekeken
  type End = { wall: Wall; d: Vec; hL: number; hR: number; angle: number };
  const ends = new Map<Id, End[]>();
  for (const w of g.walls) {
    const a = byId.get(w.start);
    const b = byId.get(w.end);
    if (!a || !b) continue;
    const d = unit(sub(b, a));
    const s = wallSides(w);
    (ends.get(a.id) ?? ends.set(a.id, []).get(a.id)!).push({ wall: w, d, hL: s.left, hR: s.right, angle: Math.atan2(d.y, d.x) });
    const nd = scale(d, -1);
    (ends.get(b.id) ?? ends.set(b.id, []).get(b.id)!).push({ wall: w, d: nd, hL: s.right, hR: s.left, angle: Math.atan2(nd.y, nd.x) });
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
      let L = add(p, scale(l, e.hL));
      let R = add(p, scale(l, -e.hR));
      if (k === 2) {
        // gewone hoek: verstek (rechtdoor met een andere dikte: rechte afsluiting)
        const other = list[(i + 1) % k];
        const ol = leftNormal(other.d);
        const hitL = lineIntersection(L, e.d, add(p, scale(ol, -other.hR)), other.d);
        const hitR = lineIntersection(R, e.d, add(p, scale(ol, other.hL)), other.d);
        const lim = 4 * Math.max(e.hL, e.hR, other.hL, other.hR);
        if (hitL && length(sub(hitL, p)) <= lim) L = hitL;
        if (hitR && length(sub(hitR, p)) <= lim) R = hitR;
      } else if (k > 2) {
        // T- of kruisaansluiting: elke muur loopt door tot de verste rand van de muren
        // die er dwars op staan (en niet verder, anders steekt hij een kamer in);
        // overlappingen zijn onzichtbaar want alle muren hebben dezelfde kleur
        const v = scale(e.d, -1);
        const reaches = list
          .filter((o) => o !== e && Math.abs(cross(o.d, e.d)) > 1e-6)
          .map((o) => (dot(leftNormal(o.d), v) > 0 ? o.hL : o.hR));
        const ext = reaches.length ? Math.max(...reaches) : 0;
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
      const moved = { ...o, wall: w.id, offset: Math.round(length(sub(pos.p, a))) };
      // muur in de andere richting: links/rechts en begin/einde wisselen
      if (dot(d, pos.dir) < 0 && o.swing)
        moved.swing = {
          side: o.swing.side === "left" ? "right" : "left",
          hinge: o.swing.hinge === "start" ? "end" : "start",
        };
      return [moved];
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

/** Punten midden op een rechte zijde weglaten (die zijn geen echte hoek). */
function dropCollinear(poly: Vec[]): Vec[] {
  const out = poly.filter((p, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length];
    const b = poly[(i + 1) % poly.length];
    return Math.abs(cross(sub(p, a), sub(b, p))) > 1 || dot(sub(p, a), sub(b, p)) < 0;
  });
  return out.length >= 3 ? out : poly;
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
    .map((f) => dropCollinear(innerPolygon(f).points));
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

/**
 * Kruist een muur aan een van deze knooppunten nu een andere muur? Dat
 * gebeurt bij het verslepen van een hoek of muur door een andere kamer, en
 * zou van elke kruising een nieuw kamertje maken.
 */
export function createsCrossing(floor: Floor, moved: Set<Id>): boolean {
  const byId = new Map(floor.nodes.map((n) => [n.id, n]));
  const movedWalls = floor.walls.filter((w) => moved.has(w.start) || moved.has(w.end));
  for (const w of movedWalls) {
    const a = byId.get(w.start);
    const b = byId.get(w.end);
    if (!a || !b) continue;
    for (const o of floor.walls) {
      if (o.id === w.id || o.start === w.start || o.start === w.end || o.end === w.start || o.end === w.end) continue;
      const c = byId.get(o.start);
      const d = byId.get(o.end);
      if (c && d && segmentIntersection(a, b, c, d)) return true;
    }
  }
  return false;
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
 * gelijk: de muur wordt enkel aan de andere kant dunner of dikker (de lijn
 * blijft liggen, de uitlijning verandert). Zonder anker blijft het midden van
 * de muur liggen.
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
  const targets = new Set(wallIds);
  const walls = floor.walls.map((w) => {
    if (!targets.has(w.id) || w.thickness === thickness) return w;
    const A = byId.get(w.start);
    const B = byId.get(w.end);
    if (!A || !B) return { ...w, thickness };
    const roomId = typeof anchor === "function" ? anchor(w.id) : anchor;
    const room = roomId ? a.rooms.find((r) => r.room.id === roomId) : null;
    if (!room) return { ...w, thickness };
    // aan welke kant ligt de ankerkamer?
    const n = leftNormal(unit(sub(B, A)));
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const s = wallSides(w);
    const v = pointInPolygon(add(mid, scale(n, s.left + 5)), room.inner)
      ? n
      : pointInPolygon(add(mid, scale(n, -s.right - 5)), room.inner)
        ? scale(n, -1)
        : null;
    if (!v) return { ...w, thickness };
    return withExtentToward(w, A, B, v, extentToward(w, A, B, v), thickness);
  });
  return rebuildFloor({ ...floor, walls }, newId, floor);
}

/**
 * "Magnetisch" plaatsen: een kamer die net naast een bestaande muur valt,
 * schuift er exact tegenaan. Anders ontstaan er flinterdunne kamertjes en
 * muren die net naast elkaar lopen.
 *  - "move": de hele rechthoek schuift (maten blijven exact, bv. bij getypte
 *    maten of een standaardkamer);
 *  - "resize": elke zijde apart (bij een gesleepte rechthoek).
 * `tol` is de maximale afstand tussen de lijnen in mm.
 */
export function snapRoomRect(
  floor: Floor,
  a: Vec,
  b: Vec,
  mode: "move" | "resize",
  tol: number,
): { a: Vec; b: Vec } {
  let x0 = Math.min(a.x, b.x);
  let x1 = Math.max(a.x, b.x);
  let y0 = Math.min(a.y, b.y);
  let y1 = Math.max(a.y, b.y);
  const byId = new Map(floor.nodes.map((n) => [n.id, n]));
  type L = { at: number; lo: number; hi: number };
  const vert: L[] = [];
  const hor: L[] = [];
  for (const w of floor.walls) {
    const p = byId.get(w.start);
    const q = byId.get(w.end);
    if (!p || !q) continue;
    if (Math.abs(p.x - q.x) <= EPS) vert.push({ at: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
    else if (Math.abs(p.y - q.y) <= EPS) hor.push({ at: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
  }
  // dichtste lijn bij een zijde, als die de zijde overlapt of er vlak naast eindigt
  // (zo lijnt een keuken naast de living ook uit met de gevel van de living)
  const nearest = (lines: L[], side: number, lo: number, hi: number): number | null => {
    let best: number | null = null;
    for (const l of lines) {
      if (Math.min(l.hi, hi) - Math.max(l.lo, lo) < -tol) continue;
      const d = l.at - side;
      if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    return best;
  };
  for (let pass = 0; pass < 2; pass++) {
    const dl = nearest(vert, x0, y0, y1);
    const dr = nearest(vert, x1, y0, y1);
    const dt = nearest(hor, y0, x0, x1);
    const db = nearest(hor, y1, x0, x1);
    if (mode === "move") {
      const dx = [dl, dr].filter((d): d is number => d !== null).sort((p, q) => Math.abs(p) - Math.abs(q))[0] ?? 0;
      const dy = [dt, db].filter((d): d is number => d !== null).sort((p, q) => Math.abs(p) - Math.abs(q))[0] ?? 0;
      x0 += dx;
      x1 += dx;
      y0 += dy;
      y1 += dy;
    } else {
      if (dl !== null) x0 += dl;
      if (dr !== null) x1 += dr;
      if (dt !== null) y0 += dt;
      if (db !== null) y1 += db;
    }
  }
  return { a: { x: x0, y: y0 }, b: { x: x1, y: y1 } };
}

/**
 * Mag hier een nieuwe kamer komen? Ze mag tegen andere kamers liggen, of
 * volledig binnen één kamer (om die op te delen), maar niet half over andere
 * kamers heen: dan zou elke kruising van muren een nieuw kamertje worden.
 * `a` en `b` zijn hartlijnhoeken, `t` de muurdikte.
 */
export function roomFits(floor: Floor, a: Vec, b: Vec, t: number): boolean {
  const m = t / 2 + 20;
  const x0 = Math.min(a.x, b.x) + m;
  const x1 = Math.max(a.x, b.x) - m;
  const y0 = Math.min(a.y, b.y) + m;
  const y1 = Math.max(a.y, b.y) - m;
  if (x1 <= x0 || y1 <= y0) return true;
  const rectArea = (x1 - x0) * (y1 - y0);
  const hits: number[] = [];
  for (const r of analyzeFloor(floor).rooms) {
    const part = clipToRect(r.inner, x0, y0, x1, y1);
    const ov = part.length >= 3 ? Math.abs(signedArea(part)) : 0;
    if (ov > 50_000) hits.push(ov); // meer dan 0,05 m² overlap telt
  }
  if (hits.length === 0) return true;
  return hits.length === 1 && hits[0] >= rectArea * 0.99;
}

/**
 * Een rechthoekige kamer plaatsen met binnenmaten zoals getekend of getypt.
 * Zijden die op een bestaande muur vallen, delen die muur: een buitenmuur wordt
 * dan een binnenmuur die enkel aan de kant van de nieuwe kamer dunner wordt.
 * De bestaande kamer blijft dus even groot, de nieuwe kamer krijgt exact haar
 * binnenmaat, en alle lijnen blijven recht (geen verspringingen).
 *
 * `a` en `b` zijn de hartlijnhoeken in de veronderstelling dat alle muren
 * `props.thickness` dik en gecentreerd zijn (zo rekent het kamergereedschap).
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
  const h = props.thickness / 2;

  /** Een gedeelde zijde: welke lijn, naar welke kant de bestaande kamer ligt, en de doelmaten. */
  type Side = { vertical: boolean; at: number; out: Vec; keep: number; final: number; face: number };
  const sideOn = (vertical: boolean, at: number, from: number, to: number, out: Vec): Side | null => {
    for (const w of floor.walls) {
      const p = byId.get(w.start);
      const q = byId.get(w.end);
      if (!p || !q) continue;
      const on = vertical
        ? Math.abs(p.x - at) <= EPS && Math.abs(q.x - at) <= EPS
        : Math.abs(p.y - at) <= EPS && Math.abs(q.y - at) <= EPS;
      if (!on) continue;
      const lo = vertical ? Math.min(p.y, q.y) : Math.min(p.x, q.x);
      const hi = vertical ? Math.max(p.y, q.y) : Math.max(p.x, q.x);
      if (Math.min(hi, to) - Math.max(lo, from) <= EPS) continue;
      // de bestaande kant houdt zijn reikwijdte; een buitenmuur wordt binnenmuur
      const keep = extentToward(w, p, q, out);
      const final = w.kind === "exterior" ? interiorThickness : w.thickness;
      return { vertical, at, out, keep, final, face: final - keep };
    }
    return null;
  };
  const left = sideOn(true, x0, y0, y1, { x: -1, y: 0 });
  const right = sideOn(true, x1, y0, y1, { x: 1, y: 0 });
  const top = sideOn(false, y0, x0, x1, { x: 0, y: -1 });
  const bottom = sideOn(false, y1, x0, x1, { x: 0, y: 1 });
  // de overkant opschuiven zodat de binnenmaat exact blijft
  if (left && !right) x1 += left.face - h;
  if (right && !left) x0 -= right.face - h;
  if (top && !bottom) y1 += top.face - h;
  if (bottom && !top) y0 -= bottom.face - h;

  const before = new Set(floor.rooms.map((r) => r.id));
  const after = addRectangle(floor, { x: x0, y: y0 }, { x: x1, y: y1 }, props, newId);
  const fresh = after.rooms.find((r) => !before.has(r.id));
  if (!fresh) return { floor: after, roomId: null };
  const sides = [left, right, top, bottom].filter((x): x is Side => x !== null);
  if (sides.length === 0) return { floor: after, roomId: fresh.id };

  const nodes = new Map(after.nodes.map((n) => [n.id, n]));
  const freshWalls = new Set(fresh.walls);
  const otherWalls = new Set(after.rooms.filter((r) => r.id !== fresh.id).flatMap((r) => r.walls));
  const walls = after.walls.map((w) => {
    if (!freshWalls.has(w.id)) return w;
    const p = nodes.get(w.start)!;
    const q = nodes.get(w.end)!;
    for (const sd of sides) {
      const on = sd.vertical
        ? Math.abs(p.x - sd.at) <= EPS && Math.abs(q.x - sd.at) <= EPS
        : Math.abs(p.y - sd.at) <= EPS && Math.abs(q.y - sd.at) <= EPS;
      if (!on) continue;
      if (otherWalls.has(w.id)) {
        // gedeeld stuk: binnenmuur, de bestaande kamer houdt haar binnenvlak
        return withExtentToward(w, p, q, sd.out, sd.keep, sd.final);
      }
      // stuk van dezelfde zijde dat niet gedeeld is: binnenvlak in lijn houden
      return withExtentToward(w, p, q, sd.out, w.thickness - sd.face);
    }
    return w;
  });
  return { floor: rebuildFloor({ ...after, walls }, newId, after), roomId: fresh.id };
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
