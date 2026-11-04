/**
 * Magnetisch tekenen. Volgorde van voorrang:
 *  1. een bestaand knooppunt (hoek) in de buurt;
 *  2. tijdens het tekenen vanaf een punt: rechte hoeken (0/45/90°),
 *     lengte in stappen van het raster, uitlijnen op andere hoeken en
 *     precies stoppen tegen een bestaande muur;
 *  3. een bestaande muur in de buurt (aansluiten met een T);
 *  4. het raster, plus uitlijnen op andere hoeken.
 * Alle afstanden voor "in de buurt" zijn in schermpixels, dus het voelt even
 * magnetisch bij elke zoom.
 */
import type { Id, Node, Wall } from "../model/types";
import { closestOnSegment, distance, dot, snapValue, sub, type Vec } from "../geometry/vec";
import { segmentIntersection } from "../geometry/plan";

export interface Guide {
  from: Vec;
  to: Vec;
}

export type SnapKind = "node" | "wall" | "grid" | "angle" | "free";

export interface SnapResult {
  p: Vec;
  kind: SnapKind;
  guides: Guide[];
  /** Id van het knooppunt of de muur waarop gesnapt werd. */
  target?: Id;
}

export interface SnapContext {
  nodes: Node[];
  walls: Wall[];
  /** Pixels per mm. */
  zoom: number;
  /** Rasterstap in mm, of null als het raster uit staat. */
  grid: number | null;
  /** Punt waarvan we vertrekken (bij muren tekenen). */
  from?: Vec;
  /** Shift/Alt ingedrukt: geen hoek-vergrendeling. */
  free?: boolean;
  /** Knooppunten die we zelf verslepen (niet op jezelf snappen). */
  ignore?: Set<Id>;
}

const PX = 10;

function alignToNodes(p: Vec, ctx: SnapContext, tol: number, axes: { x: boolean; y: boolean }) {
  const guides: Guide[] = [];
  let x = p.x;
  let y = p.y;
  let bx: Node | null = null;
  let by: Node | null = null;
  for (const n of ctx.nodes) {
    if (ctx.ignore?.has(n.id)) continue;
    if (axes.x && Math.abs(n.x - p.x) < tol && (!bx || Math.abs(n.x - p.x) < Math.abs(bx.x - p.x))) bx = n;
    if (axes.y && Math.abs(n.y - p.y) < tol && (!by || Math.abs(n.y - p.y) < Math.abs(by.y - p.y))) by = n;
  }
  if (bx) {
    x = bx.x;
    guides.push({ from: { x: bx.x, y: bx.y }, to: { x, y: by ? by.y : p.y } });
  }
  if (by) {
    y = by.y;
    guides.push({ from: { x: by.x, y: by.y }, to: { x, y } });
  }
  return { p: { x, y }, guides, aligned: !!(bx || by) };
}

export function snapPoint(raw: Vec, ctx: SnapContext): SnapResult {
  const tol = PX / ctx.zoom;
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));

  // 1. bestaande hoek
  let bestNode: Node | null = null;
  let bestD = tol;
  for (const n of ctx.nodes) {
    if (ctx.ignore?.has(n.id)) continue;
    const d = distance(raw, n);
    if (d < bestD) {
      bestD = d;
      bestNode = n;
    }
  }
  if (bestNode) return { p: { x: bestNode.x, y: bestNode.y }, kind: "node", guides: [], target: bestNode.id };

  // 2. vanaf een vertrekpunt: hoek vergrendelen en lengte afronden
  if (ctx.from && !ctx.free) {
    const v = sub(raw, ctx.from);
    const len = Math.hypot(v.x, v.y);
    if (len > 0) {
      const ang = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * (Math.PI / 4);
      const u = { x: Math.round(Math.cos(ang) * 1e9) / 1e9, y: Math.round(Math.sin(ang) * 1e9) / 1e9 };
      let L = dot(v, u);
      if (ctx.grid) L = snapValue(L, ctx.grid);
      let p = { x: ctx.from.x + u.x * L, y: ctx.from.y + u.y * L };
      const guides: Guide[] = [];
      // precies stoppen tegen een muur die de lijn kruist
      const far = { x: ctx.from.x + u.x * (dot(v, u) + tol * 2), y: ctx.from.y + u.y * (dot(v, u) + tol * 2) };
      for (const w of ctx.walls) {
        const a = byId.get(w.start);
        const b = byId.get(w.end);
        if (!a || !b) continue;
        const hit = segmentIntersection(ctx.from, far, a, b);
        if (hit && distance(hit, p) < tol) {
          return { p: { x: Math.round(hit.x), y: Math.round(hit.y) }, kind: "wall", guides: [], target: w.id };
        }
      }
      // uitlijnen op een andere hoek, langs de lijn
      if (Math.abs(u.y) < 1e-9 || Math.abs(u.x) < 1e-9) {
        const al = alignToNodes(p, ctx, tol, { x: Math.abs(u.y) < 1e-9, y: Math.abs(u.x) < 1e-9 });
        if (al.aligned) {
          p = al.p;
          guides.push(...al.guides);
        }
      }
      return { p: { x: Math.round(p.x), y: Math.round(p.y) }, kind: "angle", guides };
    }
  }

  // 3. op een bestaande muur
  let bestWall: { w: Wall; p: Vec; d: number } | null = null;
  for (const w of ctx.walls) {
    const a = byId.get(w.start);
    const b = byId.get(w.end);
    if (!a || !b || ctx.ignore?.has(w.start) || ctx.ignore?.has(w.end)) continue;
    const c = closestOnSegment(raw, a, b);
    const reach = tol + w.thickness / 2 + Math.abs(w.offset ?? 0);
    if (c.dist < reach && (!bestWall || c.dist < bestWall.d)) bestWall = { w, p: c.point, d: c.dist };
  }
  if (bestWall) {
    const a = byId.get(bestWall.w.start)!;
    const b = byId.get(bestWall.w.end)!;
    let p = bestWall.p;
    // langs een rechte muur: ook op het raster en op andere hoeken uitlijnen
    const horizontal = Math.abs(a.y - b.y) < 1;
    const vertical = Math.abs(a.x - b.x) < 1;
    const guides: Guide[] = [];
    if (horizontal || vertical) {
      if (ctx.grid) p = horizontal ? { x: snapValue(p.x, ctx.grid), y: a.y } : { x: a.x, y: snapValue(p.y, ctx.grid) };
      const al = alignToNodes(p, ctx, tol, { x: horizontal, y: vertical });
      if (al.aligned) {
        p = horizontal ? { x: al.p.x, y: a.y } : { x: a.x, y: al.p.y };
        guides.push(...al.guides);
      }
    }
    return { p: { x: Math.round(p.x), y: Math.round(p.y) }, kind: "wall", guides, target: bestWall.w.id };
  }

  // 4. raster en uitlijnen
  let p = ctx.grid ? { x: snapValue(raw.x, ctx.grid), y: snapValue(raw.y, ctx.grid) } : { x: Math.round(raw.x), y: Math.round(raw.y) };
  const al = alignToNodes(p, ctx, tol, { x: true, y: true });
  p = al.p;
  return { p, kind: ctx.grid ? "grid" : "free", guides: al.guides };
}
