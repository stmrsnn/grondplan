/**
 * Rechttrekken van een schuin gefotografeerd plan.
 *
 * Met vier punten op de foto waarvan je de echte ligging kent (de hoeken van
 * een rechthoek met gekende maten) berekenen we een homografie: de afbeelding
 * die elk punt op de foto naar het vlak van het plan brengt. Zuivere wiskunde,
 * zonder browser, zodat ze getest kan worden.
 */
import type { Vec } from "../geometry/vec";

/** 3×3-matrix, rij per rij. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Lost A·x = b op (Gauss met spilkeuze); null als het stelsel ontaard is. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homografie H met H·src[i] ≈ dst[i] voor vier puntenparen. */
export function homography(src: Vec[], dst: Vec[]): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? ([...h, 1] as Mat3) : null;
}

export function applyH(H: Mat3, p: Vec): Vec {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export function invert(H: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  const k = 1 / det;
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ];
}

/** Is de vierhoek bol en niet gekruist (punten in volgorde rond)? */
export function convexQuad(q: Vec[]): boolean {
  if (q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    const s = Math.sign(z);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

export interface RectifyPlan {
  /** foto-pixel → plan (mm) */
  H: Mat3;
  /** plan (mm) → foto-pixel */
  inv: Mat3;
  /** Gebied op het plan (mm) dat we uitrekenen. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** mm per pixel van de rechtgetrokken afbeelding. */
  scale: number;
  outW: number;
  outH: number;
}

/**
 * Bereidt het rechttrekken voor. `corners` zijn de vier hoeken van een
 * rechthoek op de foto (in volgorde rond), `width`×`height` de echte maten in
 * mm (van de eerste naar de tweede hoek = breedte). We rekenen de hele foto
 * om, maar nooit verder dan 1,5 keer de rechthoek aan elke kant (zeer schuine
 * randen zouden anders eindeloos uitrekken).
 */
export function planRectify(
  corners: Vec[],
  width: number,
  height: number,
  imgW: number,
  imgH: number,
  maxPx = 3200,
): RectifyPlan | null {
  if (!convexQuad(corners) || width <= 0 || height <= 0) return null;
  const H = homography(corners, [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]);
  const inv = H && invert(H);
  if (!H || !inv) return null;
  // waar komen de hoeken van de foto terecht? (enkel als ze voor de horizon liggen)
  const pts = [
    { x: 0, y: 0 },
    { x: imgW, y: 0 },
    { x: imgW, y: imgH },
    { x: 0, y: imgH },
  ]
    .filter((p) => H[6] * p.x + H[7] * p.y + H[8] > 0 === H[6] * corners[0].x + H[7] * corners[0].y + H[8] > 0)
    .map((p) => applyH(H, p));
  const lim = { minX: -1.5 * width, minY: -1.5 * height, maxX: 2.5 * width, maxY: 2.5 * height };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.max(lim.minX, Math.min(0, ...xs));
  const minY = Math.max(lim.minY, Math.min(0, ...ys));
  const maxX = Math.min(lim.maxX, Math.max(width, ...xs));
  const maxY = Math.min(lim.maxY, Math.max(height, ...ys));
  // resolutie: zo scherp als de foto zelf ter hoogte van de rechthoek, maar binnen maxPx
  const photoPx = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  let scale = width / Math.max(photoPx, 1);
  scale = Math.max(scale, (maxX - minX) / maxPx, (maxY - minY) / maxPx);
  return {
    H,
    inv,
    minX,
    minY,
    maxX,
    maxY,
    scale,
    outW: Math.max(1, Math.round((maxX - minX) / scale)),
    outH: Math.max(1, Math.round((maxY - minY) / scale)),
  };
}

/**
 * Rekent de rechtgetrokken pixels uit (bilineair). `src` zijn RGBA-pixels van
 * de foto. Buiten de foto wordt het wit.
 */
export function rectifyPixels(src: { data: Uint8ClampedArray; width: number; height: number }, plan: RectifyPlan): Uint8ClampedArray {
  const { outW, outH, inv, minX, minY, scale } = plan;
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width: W, height: Hh } = src;
  const [a, b, c, d, e, f, g, h, i] = inv;
  for (let v = 0; v < outH; v++) {
    const py = minY + (v + 0.5) * scale;
    for (let u = 0; u < outW; u++) {
      const px = minX + (u + 0.5) * scale;
      const w = g * px + h * py + i;
      const x = (a * px + b * py + c) / w - 0.5;
      const y = (d * px + e * py + f) / w - 0.5;
      const o = (v * outW + u) * 4;
      if (!(x >= 0 && y >= 0 && x < W - 1 && y < Hh - 1)) {
        out[o] = out[o + 1] = out[o + 2] = 255;
        out[o + 3] = 255;
        continue;
      }
      const x0 = x | 0;
      const y0 = y | 0;
      const fx = x - x0;
      const fy = y - y0;
      const p00 = (y0 * W + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + W * 4;
      const p11 = p01 + 4;
      for (let k = 0; k < 3; k++) {
        const top = data[p00 + k] + (data[p10 + k] - data[p00 + k]) * fx;
        const bot = data[p01 + k] + (data[p11 + k] - data[p01 + k]) * fx;
        out[o + k] = top + (bot - top) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
