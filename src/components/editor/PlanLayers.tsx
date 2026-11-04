"use client";

import { memo, useMemo } from "react";
import type { Guide, SnapResult } from "@/lib/editor/snap";
import { toScreen, type Viewport } from "@/lib/editor/viewport";
import { formatArea, formatMeters } from "@/lib/format";
import type { FloorAnalysis, RoomInfo } from "@/lib/geometry/plan";
import type { Vec } from "@/lib/geometry/vec";
import type { Id } from "@/lib/model/types";

const path = (pts: Vec[]) =>
  pts.length ? `M${pts.map((p) => `${p.x} ${p.y}`).join("L")}Z` : "";

export type Selection =
  | { kind: "wall"; id: Id }
  | { kind: "room"; id: Id }
  | { kind: "node"; id: Id }
  | null;

/** De verdieping eronder, heel licht, als houvast bij het tekenen van een verdieping. */
export const GhostFloor = memo(function GhostFloor({ analysis }: { analysis: FloorAnalysis }) {
  return (
    <g opacity={0.14} pointerEvents="none">
      {[...analysis.wallPolys.values()].map((poly, i) => (
        <path key={i} d={path(poly)} fill="var(--wall)" />
      ))}
    </g>
  );
});

/** Ruimtes en muren in wereldcoördinaten. */
export const FloorLayer = memo(function FloorLayer({
  analysis,
  selection,
  hover,
}: {
  analysis: FloorAnalysis;
  selection: Selection;
  hover: Selection;
}) {
  const sel = (k: string, id: Id) => selection?.kind === k && selection.id === id;
  const hov = (k: string, id: Id) => hover?.kind === k && hover.id === id;
  return (
    <g>
      {analysis.rooms.map((r) => (
        <path
          key={r.room.id}
          d={path(r.inner)}
          fill={sel("room", r.room.id) ? "var(--accent-soft)" : hov("room", r.room.id) ? "var(--surface-2)" : "var(--bg)"}
        />
      ))}
      <path
        d={[...analysis.wallPolys.values()].map(path).join("")}
        fill="var(--wall)"
        stroke="var(--wall)"
        strokeWidth={1}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {[...analysis.wallPolys.entries()].map(([id, poly]) =>
        sel("wall", id) || hov("wall", id) ? (
          <path
            key={id}
            d={path(poly)}
            fill="var(--accent)"
            opacity={sel("wall", id) ? 1 : 0.55}
          />
        ) : null,
      )}
    </g>
  );
});

/** Voorvertoning tijdens het tekenen: hulplijnen en het magneetpunt. */
export function Guides({ guides, view }: { guides: Guide[]; view: Viewport }) {
  return (
    <g pointerEvents="none">
      {guides.map((g, i) => {
        const a = toScreen(view, g.from);
        const b = toScreen(view, g.to);
        return (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 4" />
        );
      })}
    </g>
  );
}

export function SnapMarker({ snap, view }: { snap: SnapResult; view: Viewport }) {
  const p = toScreen(view, snap.p);
  if (snap.kind === "node")
    return <circle cx={p.x} cy={p.y} r={7} fill="none" stroke="var(--accent)" strokeWidth={2} pointerEvents="none" />;
  if (snap.kind === "wall")
    return <rect x={p.x - 5} y={p.y - 5} width={10} height={10} fill="none" stroke="var(--accent)" strokeWidth={2} pointerEvents="none" />;
  return <circle cx={p.x} cy={p.y} r={3.5} fill="var(--accent)" pointerEvents="none" />;
}

/** Klein label met een maat, in schermcoördinaten. */
export function Chip({
  at,
  text,
  strong,
  onClick,
  title,
}: {
  at: Vec;
  text: string;
  strong?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const w = text.length * 6.6 + 12;
  return (
    <g
      transform={`translate(${at.x} ${at.y})`}
      data-ui={onClick ? "" : undefined}
      onPointerDown={onClick ? (e) => e.stopPropagation() : undefined}
      onClick={onClick}
      style={{ cursor: onClick ? "text" : undefined }}
      pointerEvents={onClick ? "all" : "none"}
    >
      {title && <title>{title}</title>}
      <rect
        x={-w / 2}
        y={-10}
        width={w}
        height={20}
        rx={5}
        fill={strong ? "var(--accent)" : "var(--bg)"}
        stroke={strong ? "none" : "var(--border-strong)"}
        strokeWidth={onClick ? 1 : 0}
        opacity={strong ? 1 : 0.92}
      />
      <text
        x={0}
        y={4}
        textAnchor="middle"
        fontSize={11.5}
        className="tabular"
        fill={strong ? "var(--on-accent)" : "var(--text)"}
      >
        {text}
      </text>
    </g>
  );
}

/**
 * Zijden van een ruimte, waarbij opeenvolgende zijden op één lijn worden
 * samengenomen: een muur die door een hoekpunt in twee stukken valt, krijgt
 * toch één doorlopende maat.
 */
export function mergedEdges(pts: Vec[]): { a: Vec; b: Vec }[] {
  const n = pts.length;
  if (n < 3) return [];
  const dir = (i: number) => {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
  };
  const straight = (i: number) => {
    // ligt hoekpunt i op één lijn met de zijden ervoor en erna?
    const d0 = dir((i - 1 + n) % n);
    const d1 = dir(i);
    return Math.abs(d0.x * d1.y - d0.y * d1.x) < 1e-6 && d0.x * d1.x + d0.y * d1.y > 0;
  };
  const start = [...Array(n).keys()].find((i) => !straight(i));
  if (start === undefined) return [];
  const out: { a: Vec; b: Vec }[] = [];
  let a = pts[start];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (!straight(i)) {
      out.push({ a, b: pts[i] });
      a = pts[i];
    }
  }
  return out;
}

/** Ruimtenamen, oppervlaktes en binnenmaten: altijd even groot en leesbaar. */
export function Annotations({
  analysis,
  view,
  onEditEdge,
  showDims,
}: {
  analysis: FloorAnalysis;
  view: Viewport;
  onEditEdge: (room: RoomInfo, a: Vec, b: Vec, at: Vec) => void;
  showDims: boolean;
}) {
  const out: React.ReactNode[] = [];
  // zijden per ruimte maar één keer berekenen, niet bij elke beweging van het beeld
  const edges = useMemo(
    () => new Map(analysis.rooms.map((r) => [r.room.id, mergedEdges(r.inner)])),
    [analysis],
  );
  const W = typeof window === "undefined" ? 4000 : window.innerWidth;
  const H = typeof window === "undefined" ? 4000 : window.innerHeight;
  const onScreen = (p: Vec, m = 40) => p.x > -m && p.y > -m && p.x < W + m && p.y < H + m;
  for (const r of analysis.rooms) {
    const c = toScreen(view, r.center);
    // binnenmaten per zijde
    if (showDims) {
      for (const [i, { a, b }] of (edges.get(r.room.id) ?? []).entries()) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len * view.zoom < 56) continue;
        const sa = toScreen(view, a);
        const sb = toScreen(view, b);
        if (!onScreen(sa, 200) && !onScreen(sb, 200)) continue;
        const mid = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
        // naar binnen: linkernormaal van de zijde (ruimtes zijn positief georiënteerd)
        const d = { x: (sb.x - sa.x) / (len * view.zoom), y: (sb.y - sa.y) / (len * view.zoom) };
        const upright = Math.abs(d.y) > Math.abs(d.x);
        const at = { x: mid.x - d.y * (upright ? 14 : 16), y: mid.y + d.x * (upright ? 14 : 16) };
        const chip = (
          <Chip
            at={at}
            text={formatMeters(len)}
            title="Klik om deze maat exact in te typen"
            onClick={() => onEditEdge(r, a, b, at)}
          />
        );
        out.push(
          upright ? (
            <g key={`${r.room.id}-${i}`} transform={`rotate(-90 ${at.x} ${at.y})`}>
              {chip}
            </g>
          ) : (
            <g key={`${r.room.id}-${i}`}>{chip}</g>
          ),
        );
      }
    }
    const big = Math.sqrt(r.area) * view.zoom > 70;
    if (!big || !onScreen(c)) continue;
    out.push(
      <g key={`${r.room.id}-label`} transform={`translate(${c.x} ${c.y})`} pointerEvents="none">
        <text textAnchor="middle" y={-3} fontSize={13} fontWeight={600} fill="var(--text)">
          {r.room.name}
        </text>
        <text textAnchor="middle" y={13} fontSize={12} fill="var(--text-2)" className="tabular">
          {formatArea(r.area)}
        </text>
      </g>,
    );
  }
  // buitenmaten bovenaan en links
  const b = analysis.outerBounds;
  if (b && showDims) {
    const tl = toScreen(view, { x: b.minX, y: b.minY });
    const br = toScreen(view, { x: b.maxX, y: b.maxY });
    const y = tl.y - 28;
    const x = tl.x - 28;
    if (br.x - tl.x > 60)
      out.push(
        <g key="outer-w" pointerEvents="none">
          <line x1={tl.x} y1={y} x2={br.x} y2={y} stroke="var(--text-3)" />
          <line x1={tl.x} y1={y - 5} x2={tl.x} y2={y + 5} stroke="var(--text-3)" />
          <line x1={br.x} y1={y - 5} x2={br.x} y2={y + 5} stroke="var(--text-3)" />
          <Chip at={{ x: (tl.x + br.x) / 2, y }} text={formatMeters(b.maxX - b.minX)} title="Buitenmaat" />
        </g>,
      );
    if (br.y - tl.y > 60)
      out.push(
        <g key="outer-h" pointerEvents="none">
          <line x1={x} y1={tl.y} x2={x} y2={br.y} stroke="var(--text-3)" />
          <line x1={x - 5} y1={tl.y} x2={x + 5} y2={tl.y} stroke="var(--text-3)" />
          <line x1={x - 5} y1={br.y} x2={x + 5} y2={br.y} stroke="var(--text-3)" />
          <g transform={`rotate(-90 ${x} ${(tl.y + br.y) / 2})`}>
            <Chip at={{ x, y: (tl.y + br.y) / 2 }} text={formatMeters(b.maxY - b.minY)} title="Buitenmaat" />
          </g>
        </g>,
      );
  }
  return <g>{out}</g>;
}
