import type { Vec } from "./vec";

/**
 * Oppervlakte met teken (schoenveterformule), in mm².
 * Positief = met de klok mee op het scherm (y naar beneden).
 */
export function signedArea(poly: readonly Vec[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function area(poly: readonly Vec[]): number {
  return Math.abs(signedArea(poly));
}

/** Zwaartepunt van een (niet-zelfdoorsnijdende) veelhoek, voor labels. */
export function centroid(poly: readonly Vec[]): Vec {
  const A = signedArea(poly);
  if (poly.length === 0) return { x: 0, y: 0 };
  if (Math.abs(A) < 1e-9) {
    const s = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: s.x / poly.length, y: s.y / poly.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(points: readonly Vec[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
