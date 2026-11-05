/**
 * Meubels plaatsen en bewerken: toevoegen, verschuiven met kleven tegen de
 * muren, aanklikken en de afstand tot de muren meten. Zuivere functies op een
 * verdieping, zodat ze getest kunnen worden.
 */
import { analyzeFloor, pointInPolygon } from "../geometry/plan";
import { add, dot, length, scale, sub, type Vec } from "../geometry/vec";
import type { Floor, Id, Item } from "../model/types";
import { furnitureDef, type FurnitureDef } from "./library";

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Van de eigen assen van een meubel naar het plan. */
export function toWorld(it: Pick<Item, "x" | "y" | "rotation">, p: Vec): Vec {
  const a = rad(it.rotation);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: it.x + p.x * c - p.y * s, y: it.y + p.x * s + p.y * c };
}

export function toLocal(it: Pick<Item, "x" | "y" | "rotation">, p: Vec): Vec {
  const a = rad(it.rotation);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p.x - it.x;
  const dy = p.y - it.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Hoeken van het meubel op het plan (rug eerst). */
export function itemCorners(it: Item): Vec[] {
  const w = it.width / 2;
  const d = it.depth / 2;
  return [
    { x: -w, y: -d },
    { x: w, y: -d },
    { x: w, y: d },
    { x: -w, y: d },
  ].map((p) => toWorld(it, p));
}

/** Het meubel onder de cursor; een tapijt pas als er niets anders ligt. */
export function hitItem(floor: Floor, p: Vec, margin = 0): Item | null {
  let rug: Item | null = null;
  for (let i = floor.items.length - 1; i >= 0; i--) {
    const it = floor.items[i];
    const q = toLocal(it, p);
    if (Math.abs(q.x) <= it.width / 2 + margin && Math.abs(q.y) <= it.depth / 2 + margin) {
      if (furnitureDef(it.libraryRef)?.shape === "tapijt") rug ??= it;
      else return it;
    }
  }
  return rug;
}

export function newItem(def: FurnitureDef, at: Vec, rotation: number, id: Id): Item {
  return { id, libraryRef: def.id, x: Math.round(at.x), y: Math.round(at.y), rotation, width: def.w, depth: def.d, height: def.h, color: def.color };
}

/** Tapijten onderaan, de rest in volgorde van plaatsen. */
export function addItem(floor: Floor, it: Item): Floor {
  const rug = furnitureDef(it.libraryRef)?.shape === "tapijt";
  return { ...floor, items: rug ? [it, ...floor.items] : [...floor.items, it] };
}

export function updateItem(floor: Floor, id: Id, patch: Partial<Omit<Item, "id" | "libraryRef">>): Floor {
  return { ...floor, items: floor.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) };
}

export function removeItem(floor: Floor, id: Id): Floor {
  return { ...floor, items: floor.items.filter((it) => it.id !== id) };
}

/** Een bewaard meubel nakijken (bestaand in de bibliotheek, geldige maten). */
export function cleanItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Item>;
  const def = typeof r.libraryRef === "string" ? furnitureDef(r.libraryRef) : null;
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!def || typeof r.id !== "string" || !ok(r.x) || !ok(r.y)) return null;
  const dim = (v: unknown, fb: number) => (ok(v) && (v as number) > 0 ? Math.min(20000, Math.round(v as number)) : fb);
  const it: Item = {
    id: r.id,
    libraryRef: def.id,
    x: Math.round(r.x as number),
    y: Math.round(r.y as number),
    rotation: ok(r.rotation) ? (((r.rotation as number) % 360) + 360) % 360 : 0,
    width: dim(r.width, def.w),
    depth: dim(r.depth, def.d),
    height: dim(r.height, def.h),
  };
  if (typeof r.color === "string") it.color = r.color.slice(0, 40);
  return it;
}

/* ------------------------------------------------------------------ */
/* Kleven tegen de muren                                                */
/* ------------------------------------------------------------------ */

interface WallFace {
  a: Vec;
  b: Vec;
  /** Eenheidsvector van a naar b. */
  e: Vec;
  /** Normaal de ruimte in. */
  n: Vec;
  len: number;
  room: Vec[];
}

/** De muurvlakken van alle ruimtes, met de normaal de ruimte in. */
export function wallFaces(floor: Floor): WallFace[] {
  const out: WallFace[] = [];
  for (const r of analyzeFloor(floor).rooms) {
    const poly = r.inner;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const len = length(sub(b, a));
      if (len < 100) continue;
      const e = scale(sub(b, a), 1 / len);
      let n = { x: -e.y, y: e.x };
      if (!pointInPolygon(add(add(a, scale(e, len / 2)), scale(n, 20)), poly)) n = scale(n, -1);
      out.push({ a, b, e, n, len, room: poly });
    }
  }
  return out;
}

export interface Snapped {
  x: number;
  y: number;
  rotation: number;
  /** Tegen welke muur het staat (voor de hulplijn). */
  against?: { a: Vec; b: Vec };
}

const norm360 = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/**
 * Waar een meubel komt als je het op `p` loslaat. Een meubel voor tegen de
 * muur kleeft met de rug tegen het dichtste muurvlak (en draait mee) en
 * schuift in een hoek tegen de zijmuur. Een vrij meubel valt op het raster.
 */
export function snapItem(
  floor: Floor,
  def: FurnitureDef,
  size: { width: number; depth: number },
  p: Vec,
  rotation: number,
  opts: { grid?: number; free?: boolean; faces?: WallFace[] } = {},
): Snapped {
  const grid = opts.grid ?? 50;
  const r = (v: number) => Math.round(v / grid) * grid;
  if (!def.wall || opts.free) return { x: r(p.x), y: r(p.y), rotation: norm360(rotation) };
  const faces = opts.faces ?? wallFaces(floor);
  const reach = size.depth / 2 + 450;
  let best: { f: WallFace; t: number; dist: number } | null = null;
  // ook als je net in de muur klikt (tot 30 cm erin); een vlak aan jouw kant gaat voor
  let bestScore = Infinity;
  for (const f of faces) {
    const t = dot(sub(p, f.a), f.e);
    const dist = dot(sub(p, f.a), f.n);
    if (t < -100 || t > f.len + 100 || dist < -300 || dist > reach) continue;
    const inside = pointInPolygon(p, f.room);
    if (!inside && dist > 0) continue;
    const score = inside ? dist : 1000 - dist;
    if (score < bestScore) {
      bestScore = score;
      best = { f, t, dist };
    }
  }
  if (!best) return { x: r(p.x), y: r(p.y), rotation: norm360(rotation) };
  const { f } = best;
  const half = size.width / 2;
  // langs de muur: in een hoek tegen de zijmuur, anders op het raster
  let t = Math.round(best.t / grid) * grid;
  if (f.len >= size.width) {
    if (best.t - half < 150) t = half;
    else if (best.t + half > f.len - 150) t = f.len - half;
    t = Math.max(half, Math.min(f.len - half, t));
  } else t = f.len / 2;
  const at = add(add(f.a, scale(f.e, t)), scale(f.n, size.depth / 2 + 1));
  // voorkant (lokale +y) naar de ruimte: R(θ)·(0,1) = n
  const rot = (Math.atan2(-f.n.x, f.n.y) * 180) / Math.PI;
  return { x: Math.round(at.x), y: Math.round(at.y), rotation: norm360(rot), against: { a: f.a, b: f.b } };
}

/* ------------------------------------------------------------------ */
/* Afstand tot de muren                                                 */
/* ------------------------------------------------------------------ */

export interface Gap {
  from: Vec;
  to: Vec;
  value: number;
}

/**
 * Vanaf het midden van elke zijde van het meubel recht naar buiten tot de
 * eerste muur van de ruimte: zo zie je hoeveel plaats er overblijft.
 */
export function itemGaps(floor: Floor, it: Item, faces: WallFace[] = wallFaces(floor)): Gap[] {
  const out: Gap[] = [];
  const room = faces.find((f) => pointInPolygon({ x: it.x, y: it.y }, f.room))?.room;
  if (!room) return out;
  const dirs: [Vec, number][] = [
    [{ x: 0, y: -1 }, it.depth / 2],
    [{ x: 1, y: 0 }, it.width / 2],
    [{ x: 0, y: 1 }, it.depth / 2],
    [{ x: -1, y: 0 }, it.width / 2],
  ];
  for (const [dl, half] of dirs) {
    const from = toWorld(it, scale(dl, half));
    const tip = toWorld(it, scale(dl, half + 1));
    const dir = sub(tip, from);
    let best = Infinity;
    for (let i = 0; i < room.length; i++) {
      const a = room[i];
      const b = room[(i + 1) % room.length];
      const hit = rayHit(from, dir, a, b);
      if (hit !== null && hit < best) best = hit;
    }
    if (best > 5 && best < 30000) out.push({ from, to: add(from, scale(dir, best)), value: Math.round(best) });
  }
  return out;
}

/** Afstand langs de straal (eenheidsrichting) tot het lijnstuk a-b, of null. */
function rayHit(o: Vec, d: Vec, a: Vec, b: Vec): number | null {
  const e = sub(b, a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const w = sub(a, o);
  const t = (w.x * e.y - w.y * e.x) / den;
  const u = (w.x * d.y - w.y * d.x) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}
