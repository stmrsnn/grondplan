"use client";

import { memo, useMemo } from "react";
import type { Guide, SnapResult } from "@/lib/editor/snap";
import { toScreen, type Viewport } from "@/lib/editor/viewport";
import { formatArea, formatMeters } from "@/lib/format";
import { roomCategory, type FloorAnalysis, type RoomInfo } from "@/lib/geometry/plan";
import type { OpeningShape } from "@/lib/geometry/openings";
import type { Vec } from "@/lib/geometry/vec";
import type { Id } from "@/lib/model/types";

const path = (pts: Vec[]) =>
  pts.length ? `M${pts.map((p) => `${p.x} ${p.y}`).join("L")}Z` : "";

export type Selection =
  | { kind: "wall"; id: Id }
  | { kind: "room"; id: Id }
  | { kind: "node"; id: Id }
  | { kind: "opening"; id: Id }
  | null;

/** De verdieping eronder, heel licht, als houvast bij het tekenen van een verdieping. */
export const GhostFloor = memo(function GhostFloor({ analysis }: { analysis: FloorAnalysis }) {
  return (
    <g opacity={0.14} pointerEvents="none">
      {[...analysis.wallPolys.values()].map((poly, i) => (
        <path key={i} d={path(poly)} fill="var(--wall-line)" />
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
  const walls = useMemo(() => [...analysis.wallPolys.values()].map(path).join(""), [analysis]);
  const outline = useMemo(
    () =>
      [
        ...analysis.rooms.map((r) => path(r.inner)),
        ...analysis.outerContours.map(path),
        ...analysis.looseWalls.map((id) => path(analysis.wallPolys.get(id) ?? [])),
      ].join(""),
    [analysis],
  );
  return (
    <g>
      {analysis.rooms.map((r) => (
        <path
          key={r.room.id}
          d={path(r.inner)}
          fill={
            sel("room", r.room.id)
              ? "var(--accent-soft)"
              : `var(--room-${roomCategory(r.room.function)})`
          }
        />
      ))}
      {analysis.rooms.map((r) =>
        hov("room", r.room.id) && !sel("room", r.room.id) ? (
          <path key={`h-${r.room.id}`} d={path(r.inner)} fill="var(--accent)" opacity={0.06} />
        ) : null,
      )}
      {/* Muren zoals een architect ze tekent: lichtgrijze vulling, exact op schaal,
          met een fijne lijn precies óp de muurvlakken (binnenkant van elke kamer,
          buitenkant van het gebouw), zodat de getekende dikte klopt. */}
      <path d={walls} fill="var(--wall-fill)" />
      <path
        d={outline}
        fill="none"
        stroke="var(--wall-line)"
        strokeWidth={1.25}
        strokeLinejoin="miter"
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

/**
 * Deuren, ramen en doorgangen zoals op een bouwplan: de muur is onderbroken,
 * met dagkanten; een deur heeft een blad en een kwartcirkel, een raam drie
 * dunne lijnen (twee vlakken en het glas).
 */
export const OpeningsLayer = memo(function OpeningsLayer({
  shapes,
  selection,
  hover,
  ghost,
}: {
  shapes: OpeningShape[];
  selection: Selection;
  hover: Selection;
  ghost: OpeningShape | null;
}) {
  return (
    <g pointerEvents="none">
      {shapes.map((sh) => (
        <OpeningSymbol
          key={sh.opening.id}
          shape={sh}
          state={
            selection?.kind === "opening" && selection.id === sh.opening.id
              ? "selected"
              : hover?.kind === "opening" && hover.id === sh.opening.id
                ? "hover"
                : "normal"
          }
        />
      ))}
      {ghost && <OpeningSymbol shape={ghost} state="ghost" />}
    </g>
  );
});

const line = (a: Vec, b: Vec) => `M${a.x} ${a.y}L${b.x} ${b.y}`;

function OpeningSymbol({ shape, state }: { shape: OpeningShape; state: "normal" | "hover" | "selected" | "ghost" }) {
  const ink = state === "normal" || state === "hover" ? "var(--wall-line)" : "var(--accent)";
  const leaf = shape.leaf;
  return (
    <g opacity={state === "ghost" ? 0.9 : 1}>
      <path d={path(shape.cut)} fill="var(--canvas)" />
      {state === "hover" && <path d={path(shape.cut)} fill="var(--accent)" opacity={0.25} />}
      {/* het muurvlak loopt niet door in een deuropening */}
      {shape.gaps.length > 0 && (
        <path d={shape.gaps.map(([a, b]) => line(a, b)).join("")} stroke="var(--canvas)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      )}
      <path
        d={[...shape.jambs, ...shape.lines].map(([a, b]) => line(a, b)).join("")}
        stroke={ink}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {leaf && (
        <>
          <path d={line(leaf.hinge, leaf.tip)} stroke={ink} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
          <path
            d={`M${leaf.tip.x} ${leaf.tip.y}A${leaf.radius} ${leaf.radius} 0 0 ${leaf.sweep} ${leaf.to.x} ${leaf.to.y}`}
            fill="none"
            stroke={ink}
            strokeWidth={0.75}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </g>
  );
}

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
    // binnenmaten per zijde, maar niet in kleine kamers (dan lopen ze over de naam)
    const roomPx = Math.sqrt(r.area) * view.zoom;
    if (showDims && roomPx > 120) {
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
  // buitenmaten: deelmaten per gevelsprong en de totale maat, bovenaan en links
  const b = analysis.outerBounds;
  if (b && showDims) out.push(<OuterDims key="outer" analysis={analysis} view={view} />);
  return <g>{out}</g>;
}

/** Maatketting zoals op een bouwplan: deelmaten bij elke sprong, en het totaal erboven. */
function OuterDims({ analysis, view }: { analysis: FloorAnalysis; view: Viewport }) {
  const b = analysis.outerBounds!;
  const pts = analysis.outerContours.flat();
  const uniq = (vals: number[], lo: number, hi: number) =>
    [...new Set(vals.map((v) => Math.round(v)).filter((v) => v >= lo - 1 && v <= hi + 1))].sort((x, y) => x - y);
  const xs = uniq(pts.map((p) => p.x), b.minX, b.maxX);
  const ys = uniq(pts.map((p) => p.y), b.minY, b.maxY);
  const tl = toScreen(view, { x: b.minX, y: b.minY });
  const br = toScreen(view, { x: b.maxX, y: b.maxY });
  const out: React.ReactNode[] = [];
  const chain = (vals: number[], horizontal: boolean, offset: number, key: string) => {
    for (let i = 0; i + 1 < vals.length; i++) {
      const s0 = toScreen(view, horizontal ? { x: vals[i], y: b.minY } : { x: b.minX, y: vals[i] });
      const s1 = toScreen(view, horizontal ? { x: vals[i + 1], y: b.minY } : { x: b.minX, y: vals[i + 1] });
      const len = vals[i + 1] - vals[i];
      const px = horizontal ? s1.x - s0.x : s1.y - s0.y;
      const line = horizontal ? { y: tl.y - offset } : { x: tl.x - offset };
      out.push(
        <g key={`${key}-${i}`} pointerEvents="none">
          {horizontal ? (
            <>
              <line x1={s0.x} y1={line.y} x2={s1.x} y2={line.y} stroke="var(--text-3)" />
              <line x1={s0.x} y1={line.y! - 4} x2={s0.x} y2={line.y! + 4} stroke="var(--text-3)" />
              <line x1={s1.x} y1={line.y! - 4} x2={s1.x} y2={line.y! + 4} stroke="var(--text-3)" />
              {px > 46 && <Chip at={{ x: (s0.x + s1.x) / 2, y: line.y! }} text={formatMeters(len)} title="Buitenmaat" />}
            </>
          ) : (
            <>
              <line x1={line.x} y1={s0.y} x2={line.x} y2={s1.y} stroke="var(--text-3)" />
              <line x1={line.x! - 4} y1={s0.y} x2={line.x! + 4} y2={s0.y} stroke="var(--text-3)" />
              <line x1={line.x! - 4} y1={s1.y} x2={line.x! + 4} y2={s1.y} stroke="var(--text-3)" />
              {px > 46 && (
                <g transform={`rotate(-90 ${line.x} ${(s0.y + s1.y) / 2})`}>
                  <Chip at={{ x: line.x!, y: (s0.y + s1.y) / 2 }} text={formatMeters(len)} title="Buitenmaat" />
                </g>
              )}
            </>
          )}
        </g>,
      );
    }
  };
  const hasStepsX = xs.length > 2;
  const hasStepsY = ys.length > 2;
  if (br.x - tl.x > 60) {
    if (hasStepsX) chain(xs, true, 28, "dx");
    chain([b.minX, b.maxX], true, hasStepsX ? 56 : 28, "tx");
  }
  if (br.y - tl.y > 60) {
    if (hasStepsY) chain(ys, false, 28, "dy");
    chain([b.minY, b.maxY], false, hasStepsY ? 56 : 28, "ty");
  }
  return <g>{out}</g>;
}
