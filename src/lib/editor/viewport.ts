import type { Bounds } from "../geometry/polygon";
import type { Vec } from "../geometry/vec";

/**
 * Hoe het plan op het scherm staat.
 * scherm = wereld × zoom + pan   (zoom in pixels per mm)
 */
export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

/** 100 % = 1 px per cm, dus een kamer van 6 m is 600 px breed. */
export const BASE_ZOOM = 0.1;
export const MIN_ZOOM = BASE_ZOOM * 0.1; // 10 %
export const MAX_ZOOM = BASE_ZOOM * 20; // 2000 %

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function toScreen(v: Viewport, p: Vec): Vec {
  return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY };
}

export function toWorld(v: Viewport, p: Vec): Vec {
  return { x: (p.x - v.panX) / v.zoom, y: (p.y - v.panY) / v.zoom };
}

/** Zoomt met factor rond een vast punt op het scherm (dat punt blijft liggen). */
export function zoomAt(v: Viewport, screenPoint: Vec, factor: number): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const world = toWorld(v, screenPoint);
  return {
    zoom,
    panX: screenPoint.x - world.x * zoom,
    panY: screenPoint.y - world.y * zoom,
  };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, panX: v.panX + dx, panY: v.panY + dy };
}

/** Zet een gebied (in mm) passend en gecentreerd in een scherm van w × h px. */
export function fitBounds(b: Bounds, w: number, h: number, margin = 48): Viewport {
  const bw = Math.max(b.maxX - b.minX, 1);
  const bh = Math.max(b.maxY - b.minY, 1);
  const zoom = clampZoom(
    Math.min((w - 2 * margin) / bw, (h - 2 * margin) / bh),
  );
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { zoom, panX: w / 2 - cx * zoom, panY: h / 2 - cy * zoom };
}

/** Lege start: een zone van 12 × 9 m rond de oorsprong in beeld. */
export const DEFAULT_AREA: Bounds = { minX: -1000, minY: -1000, maxX: 11000, maxY: 8000 };

export function zoomPercent(v: Viewport): number {
  return Math.round((v.zoom / BASE_ZOOM) * 100);
}

/**
 * Kiest een "mooie" lengte voor de schaalstok zodat die ongeveer
 * `targetPx` breed is: 10 cm, 20 cm, 50 cm, 1 m, 2 m, 5 m, 10 m …
 */
export function niceScaleBar(zoom: number, targetPx = 100): { mm: number; px: number } {
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  let best = steps[0];
  for (const s of steps) {
    if (s * zoom <= targetPx * 1.5) best = s;
  }
  return { mm: best, px: best * zoom };
}

/** Welke rasterlijnen tonen we bij deze zoom? Fijne lijnen enkel als ze ≥ 8 px uit elkaar liggen. */
export function gridLevels(zoom: number): { minor: number | null; major: number } {
  const candidates = [100, 500, 1000];
  const minor = candidates.find((s) => s * zoom >= 8) ?? null;
  const major = minor === 1000 || minor === null ? 5000 : 1000;
  return { minor: minor === major ? null : minor, major };
}
