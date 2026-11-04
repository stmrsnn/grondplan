/** Basisgeometrie. Alles in millimeter; functies zijn zuiver en getest. */

export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Rondt af op het dichtste veelvoud van `step` (in mm). step ≤ 0 → afronden op 1 mm. */
export function snapValue(v: number, step: number): number {
  const s = step > 0 ? step : 1;
  // + 0 voorkomt -0
  return Math.round(v / s) * s + 0;
}

export function snapPoint(p: Vec, step: number): Vec {
  return { x: snapValue(p.x, step), y: snapValue(p.y, step) };
}

/** Kortste afstand van punt p tot lijnstuk ab, en het dichtste punt erop. */
export function closestOnSegment(p: Vec, a: Vec, b: Vec): { point: Vec; t: number; dist: number } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  const point = add(a, scale(ab, t));
  return { point, t, dist: distance(p, point) };
}
