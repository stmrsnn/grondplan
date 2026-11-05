/**
 * Van een verdieping naar 3D-onderdelen, zonder three.js: zuivere geometrie
 * in mm (x en y zoals op het plan, `y0`/`y1` is de hoogte). De weergave zet
 * dit om naar meshes. Zo is alles hier te testen.
 */
import { frameOf, openingAnchor, openingSpan } from "../geometry/openings";
import { analyzeFloor, clipHalf, findFaces, innerPolygon, pointInPolygon } from "../geometry/plan";
import { add, dot, length, scale, sub, type Vec } from "../geometry/vec";
import { facadeOf, floorOf, wallColorOf } from "../model/finishes";
import { FRAME_STILE, hasDoor, MULLION, sashWidths, type Frame } from "../model/frames";
import type { Floor, Id, Opening, Wall } from "../model/types";

/**
 * Materialen: vaste namen, of met een waarde erbij ("verf:#ede7dc",
 * "vloer:parket", "gevel:rood").
 */
export type MatKey = string;

/** Een rechtopstaand blok: veelhoek op het plan, van y0 tot y1. */
export interface Prism {
  t: "prism";
  poly: Vec[];
  y0: number;
  y1: number;
  mat: MatKey;
  /** Ander materiaal voor boven- en onderkant (bv. de donkere snede bovenop een muur). */
  caps?: MatKey;
  /** Houdt je tegen bij het rondwandelen. */
  block?: boolean;
}

/** Een rechtopstaand vlak (verf, gevelsteen), van a naar b, met de normaal naar de kijker. */
export interface Face {
  t: "face";
  a: Vec;
  b: Vec;
  n: Vec;
  y0: number;
  y1: number;
  mat: MatKey;
  /** Gaten (ramen, deuren): van u0 tot u1 langs a → b (mm), van y0 tot y1. */
  holes?: { u0: number; u1: number; y0: number; y1: number }[];
}

/** Een horizontaal vlak: vloer, plafond, snede bovenop een muur. */
export interface Flat {
  t: "flat";
  poly: Vec[];
  y: number;
  mat: MatKey;
  /** Naar beneden gericht (plafond). */
  down?: boolean;
  room?: Id;
  /** Enkel bij het rondwandelen (in het poppenhuis ligt er geen plafond). */
  ceiling?: boolean;
}

export type Part = Prism | Face | Flat;

const unit = (v: Vec): Vec => {
  const l = length(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};
const leftNormal = (d: Vec): Vec => ({ x: -d.y, y: d.x });

/** Gat in de muur: van t0 tot t1 langs de muur, van lo tot hi in de hoogte. */
interface Hole {
  t0: number;
  t1: number;
  lo: number;
  hi: number;
}

function holeOf(o: Opening, wallH: number): Hole {
  const span = openingSpan(o);
  const lo = o.kind === "window" ? o.sillHeight : 0;
  return { t0: o.offset - span / 2, t1: o.offset + span / 2, lo, hi: Math.min(wallH, lo + o.height) };
}

/** Delen van [from, to] met en zonder gat, in volgorde. */
function slices(from: number, to: number, holes: Hole[]): { u0: number; u1: number; hole?: Hole }[] {
  const out: { u0: number; u1: number; hole?: Hole }[] = [];
  let cur = from;
  for (const h of [...holes].sort((a, b) => a.t0 - b.t0)) {
    const a = Math.max(h.t0, from);
    const b = Math.min(h.t1, to);
    if (b <= a) continue;
    if (a > cur) out.push({ u0: cur, u1: a });
    out.push({ u0: a, u1: b, hole: h });
    cur = b;
  }
  if (to > cur) out.push({ u0: cur, u1: to });
  return out;
}

export interface BuildOptions {
  facade?: string;
  /** Peil van de vloer (mm). */
  elevation?: number;
}

export function buildFloor3d(floor: Floor, opts: BuildOptions = {}): Part[] {
  const parts: Part[] = [];
  const base = opts.elevation ?? 0;
  const a = analyzeFloor(floor);
  const nodes = new Map(floor.nodes.map((n) => [n.id, n]));
  const holes = new Map<Id, Hole[]>();
  const wallH = (w: Wall | undefined) => w?.height ?? floor.height;
  const wallsById = new Map(floor.walls.map((w) => [w.id, w]));
  for (const o of floor.openings) {
    const w = wallsById.get(o.wall);
    if (!w) continue;
    (holes.get(w.id) ?? holes.set(w.id, []).get(w.id)!).push(holeOf(o, wallH(w)));
  }

  // muren: in stukken rond de openingen; bovenop een donkere snede
  for (const w of floor.walls) {
    const poly = a.wallPolys.get(w.id);
    const A = nodes.get(w.start);
    const B = nodes.get(w.end);
    if (!poly || !A || !B) continue;
    const d = unit(sub(B, A));
    const H = wallH(w);
    const along = poly.map((p) => dot(sub(p, A), d));
    const off = dot(A, d);
    for (const s of slices(Math.min(...along), Math.max(...along), holes.get(w.id) ?? [])) {
      let piece = clipHalf(poly, d, s.u0 + off);
      piece = clipHalf(piece, scale(d, -1), -(s.u1 + off));
      if (piece.length < 3) continue;
      // een volle muur: bovenop donker (snede); eventuele naadjes tussen de snedes vallen dan weg
      if (!s.hole) parts.push({ t: "prism", poly: piece, y0: base, y1: base + H, mat: "pleister", caps: "snede", block: true });
      else {
        if (s.hole.lo > 0) parts.push({ t: "prism", poly: piece, y0: base, y1: base + s.hole.lo, mat: "pleister", block: s.hole.lo > 400 });
        if (s.hole.hi < H) parts.push({ t: "prism", poly: piece, y0: base + s.hole.hi, y1: base + H, mat: "pleister" });
      }
    }
    parts.push({ t: "flat", poly, y: base + H + 3, mat: "snede" });
  }

  // verf aan de kant van elke ruimte, en de vloer (en het plafond om rond te wandelen)
  const faces = findFaces({ nodes: floor.nodes, walls: floor.walls });
  for (const r of a.rooms) {
    const paint = wallColorOf(r.room);
    skins(r.inner, r.edgeWalls, true, () => `verf:${paint.color}`, 0, true);
    parts.push({ t: "flat", poly: r.inner, y: base + 2, mat: `vloer:${floorOf(r.room).id}`, room: r.room.id });
    parts.push({ t: "flat", poly: r.inner, y: base + floor.height - 1, mat: "plafond", down: true, ceiling: true, room: r.room.id });
  }
  // gevel: aan de buitenkant van de gevels, tot over de rand van de vloerplaat
  const facade = facadeOf(opts.facade);
  for (const f of faces.outer) {
    if (f.edges.length < 3) continue;
    const { points, walls } = innerPolygon(f);
    skins(points, walls, false, (w) => (w.kind === "exterior" ? `gevel:${facade.id}` : null), -150);
    // vloerplaat onder het gebouw
    parts.push({ t: "prism", poly: points, y0: base - 150, y1: base, mat: "plaat" });
  }

  // ramen en deuren
  for (const o of floor.openings) parts.push(...openingParts(floor, o, base));
  return parts;

  /** Rechtopstaande vlakken langs een contour, met de gaten van de openingen eruit. */
  function skins(poly: Vec[], walls: Id[], inside: boolean, matOf: (w: Wall) => string | null, below: number, skirting = false) {
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k];
      const q = poly[(k + 1) % poly.length];
      const len = length(sub(q, p));
      const w = wallsById.get(walls[k]);
      if (len < 1 || !w) continue;
      const mat = matOf(w);
      if (!mat) continue;
      const e = unit(sub(q, p));
      let n = leftNormal(e);
      const probe = add(add(p, scale(e, len / 2)), scale(n, 5));
      if (pointInPolygon(probe, poly) !== inside) n = scale(n, -1);
      const H = wallH(w);
      // openingen van deze muur, langs deze zijde
      const W0 = nodes.get(w.start)!;
      const W1 = nodes.get(w.end)!;
      const dw = unit(sub(W1, W0));
      const hs = (holes.get(w.id) ?? []).map((h) => {
        const c0 = dot(sub(add(W0, scale(dw, h.t0)), p), e);
        const c1 = dot(sub(add(W0, scale(dw, h.t1)), p), e);
        return { ...h, t0: Math.min(c0, c1), t1: Math.max(c0, c1) };
      });
      const lift = scale(n, 4); // 4 mm voor het muurvlak (zoals een pleisterlaag of voeg)
      // de hoekpunten exact (geen naadjes tussen twee vlakken)
      const at = (s: number) => add(s <= 0 ? p : s >= len ? q : add(p, scale(e, s)), lift);
      // één vlak per zijde, met de openingen als gaten (geen naadjes)
      const cut = slices(0, len, hs).filter((s) => s.hole);
      parts.push({
        t: "face",
        a: at(0),
        b: at(len),
        n,
        y0: base + below,
        y1: base + H,
        mat,
        holes: cut.map((s) => ({ u0: s.u0, u1: s.u1, y0: base + (s.hole!.lo > 0 ? s.hole!.lo : below), y1: base + s.hole!.hi })),
      });
      // plint: 7 cm hoog, 1,5 cm dik (niet onder een deur of laag raam)
      if (skirting)
        for (const s of slices(0, len, hs)) {
          if (s.hole && s.hole.lo < 70) continue;
          const a0 = at(s.u0);
          const b0 = at(s.u1);
          parts.push({ t: "prism", poly: [a0, b0, add(b0, scale(n, 15)), add(a0, scale(n, 15))], y0: base + 2, y1: base + 72, mat: "plint" });
        }
    }
  }
}

const SILL_OUT = 40;
const LEAF = 40;

/** Kader, vakken, glas, deurbladen en vensterbanken van één opening. */
export function openingParts(floor: Floor, o: Opening, base = 0): Part[] {
  const an = openingAnchor(floor, o);
  if (!an || o.kind === "passage") return [];
  const out: Part[] = [];
  const { at: P, t0, t1, fd0, fd1, T, exterior, viewDepth, ltr } = an;
  const H = Math.min(an.wallHeight, (o.kind === "window" ? o.sillHeight : 0) + o.height);
  const lo = o.kind === "window" ? o.sillHeight : 0;
  const box = (ta: number, tb: number, da: number, db: number, ya: number, yb: number, mat: MatKey) => {
    if (tb - ta < 0.5 || yb - ya < 0.5) return;
    out.push({ t: "prism", poly: [P(ta, da), P(tb, da), P(tb, db), P(ta, db)], y0: base + ya, y1: base + yb, mat });
  };
  if (o.kind === "door" && o.variant === "garage") {
    box(t0, t1, T / 2 - 20, T / 2 + 20, 0, H, "poort");
    return out;
  }
  const frame: Frame | null = o.variant === "sliding" && !o.frame ? { sashes: [{ type: "schuif", hinge: "left" }] } : frameOf(o);
  if (!frame) return out;
  const door = hasDoor(frame) || o.kind === "door";
  const S = o.kind === "door" && !o.frame ? 50 : FRAME_STILE;
  const md = (fd0 + fd1) / 2;
  // buitenkader
  box(t0, t0 + S, fd0, fd1, lo, H, "kader");
  box(t1 - S, t1, fd0, fd1, lo, H, "kader");
  box(t0, t1, fd0, fd1, H - S, H, "kader");
  const bottom = door ? 0 : S;
  if (bottom) box(t0, t1, fd0, fd1, lo, lo + bottom, "kader");
  // bovenlicht
  let top = H - S;
  if (frame.transom) {
    const th = Math.min(frame.transom.height, H - lo - 600);
    const yb = H - th;
    box(t0 + S, t1 - S, fd0, fd1, yb - MULLION / 2, yb + MULLION / 2, "kader");
    box(t0 + S, t1 - S, md - 12, md + 12, yb + MULLION / 2, H - S, "glas");
    top = yb - MULLION / 2;
  }
  const span = t1 - t0;
  const widths = sashWidths(frame, span);
  const tAt = (x: number) => (ltr ? t0 + x : t1 - x);
  const into = viewDepth === 0 ? -1 : 1;
  let x = 0;
  widths.forEach((w, i) => {
    const s = frame.sashes[i];
    const first = i === 0;
    const last = i === widths.length - 1;
    const c0 = x + (first ? S : MULLION / 2);
    const c1 = x + w - (last ? S : MULLION / 2);
    if (!last) {
      const m0 = tAt(x + w - MULLION / 2);
      const m1 = tAt(x + w + MULLION / 2);
      box(Math.min(m0, m1), Math.max(m0, m1), fd0, fd1, lo + bottom, top, "kader");
    }
    const g0 = Math.min(tAt(c0), tAt(c1));
    const g1 = Math.max(tAt(c0), tAt(c1));
    const yb = lo + bottom;
    const yt = top;
    const pane = (a0: number, a1: number, b0: number, b1: number, prof: number, mat: "glas" | "blad", depth: [number, number]) => {
      // een vleugel: profiel rondom, glas of vol blad in het midden
      box(a0, a0 + prof, depth[0], depth[1], b0, b1, "kader");
      box(a1 - prof, a1, depth[0], depth[1], b0, b1, "kader");
      box(a0 + prof, a1 - prof, depth[0], depth[1], b1 - prof, b1, "kader");
      box(a0 + prof, a1 - prof, depth[0], depth[1], b0, b0 + prof, "kader");
      box(a0 + prof, a1 - prof, (depth[0] + depth[1]) / 2 - (mat === "glas" ? 12 : depth[1] - depth[0]) / 2, (depth[0] + depth[1]) / 2 + (mat === "glas" ? 12 : depth[1] - depth[0]) / 2, b0 + prof, b1 - prof, mat);
    };
    if (s.type === "vast") box(g0, g1, md - 12, md + 12, yb, yt, "glas");
    else if (s.type === "deur") {
      const depth: [number, number] = [md - LEAF / 2, md + LEAF / 2];
      if (s.glass) pane(g0, g1, yb, yt - 5, 110, "glas", depth);
      else box(g0, g1, depth[0], depth[1], yb, yt - 5, "blad");
      // klink aan de kant tegenover de scharnieren, op 1,05 m
      const hingeLeft = (s.hinge ?? "left") === "left";
      const handleT = hingeLeft ? tAt(c1 - 70) : tAt(c0 + 70);
      const hd = into > 0 ? [depth[1], depth[1] + 55] : [depth[0] - 55, depth[0]];
      box(handleT - 70, handleT + 70, hd[0], hd[1], 1030, 1060, "klink");
      if (o.kind === "door" && !o.frame) {
        const od = into > 0 ? [depth[0] - 55, depth[0]] : [depth[1], depth[1] + 55];
        box(handleT - 70, handleT + 70, od[0], od[1], 1030, 1060, "klink");
      }
    } else pane(g0, g1, yb + 5, yt - 5, 50, "glas", [md - 26, md + 26]);
    x += w;
  });
  if (exterior) {
    if (o.kind === "window") {
      // dorpel buiten en vensterbank binnen
      box(t0 - 30, t1 + 30, -SILL_OUT, fd0 + 10, lo - 50, lo, "dorpel");
      if (lo > 0) box(t0 - 20, t1 + 20, fd1, T + 25, lo - 20, lo, "vensterbank");
    } else box(t0, t1, -SILL_OUT, fd1, 0, 20, "dorpel");
  }
  return out;
}
