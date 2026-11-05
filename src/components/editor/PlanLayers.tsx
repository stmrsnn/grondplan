"use client";

import { memo, useMemo } from "react";
import type { Guide, SnapResult } from "@/lib/editor/snap";
import { toScreen, type Viewport } from "@/lib/editor/viewport";
import { formatDim, formatMeters, formatPlanArea } from "@/lib/format";
import { roomCategory, type FloorAnalysis, type RoomInfo } from "@/lib/geometry/plan";
import type { OpeningShape } from "@/lib/geometry/openings";
import type { Material } from "@/lib/model/wallTypes";
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
    <g opacity={0.18} pointerEvents="none">
      <path
        d={[...analysis.wallPolys.values()].map(path).join("")}
        fill="none"
        stroke="var(--plan-ink)"
        strokeWidth={0.75}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
});

/** Afstand tussen arceerlijnen op het scherm (px), per materiaal. */
export const HATCH: Partial<Record<Material, { gap: number; angle: number; kind: "lines" | "cross" | "dots" }>> = {
  gevelsteen: { gap: 5, angle: -45, kind: "lines" },
  baksteen: { gap: 6, angle: 45, kind: "lines" },
  snelbouw: { gap: 7, angle: 45, kind: "lines" },
  gipsblok: { gap: 12, angle: 45, kind: "lines" },
  kalkzandsteen: { gap: 4, angle: 45, kind: "lines" },
  beton: { gap: 7, angle: 0, kind: "dots" },
  cellenbeton: { gap: 10, angle: 0, kind: "dots" },
  hout: { gap: 7, angle: 45, kind: "cross" },
};

/**
 * Arceringen per materiaal, zoals op een bouwplan. De lijnen staan altijd even
 * ver uit elkaar op het scherm (zoals op papier), ongeacht de zoom.
 */
export const PlanPatterns = memo(function PlanPatterns({ zoom, prefix = "hatch" }: { zoom: number; prefix?: string }) {
  // in stapjes, zodat niet elke scrolbeweging alles hertekent
  const z = Math.pow(2, Math.round(Math.log2(zoom) * 4) / 4);
  const px = (v: number) => v / z;
  return (
    <defs>
      {(Object.keys(HATCH) as Material[]).map((m) => {
        const h = HATCH[m]!;
        const g = px(h.gap);
        if (h.kind === "dots")
          return (
            <pattern key={m} id={`${prefix}-${m}`} patternUnits="userSpaceOnUse" width={g} height={g}>
              <rect width={g} height={g} fill="var(--plan-paper)" />
              <circle cx={g / 4} cy={g / 4} r={px(0.7)} fill="var(--plan-hatch)" />
              <circle cx={(3 * g) / 4} cy={(3 * g) / 4} r={px(0.5)} fill="var(--plan-hatch)" />
            </pattern>
          );
        return (
          <pattern key={m} id={`${prefix}-${m}`} patternUnits="userSpaceOnUse" width={g} height={g} patternTransform={`rotate(${h.angle})`}>
            <rect width={g} height={g} fill="var(--plan-paper)" />
            <line x1={0} y1={0} x2={0} y2={g} stroke="var(--plan-hatch)" strokeWidth={px(0.6)} />
            {h.kind === "cross" && <line x1={0} y1={0} x2={g} y2={0} stroke="var(--plan-hatch)" strokeWidth={px(0.6)} />}
          </pattern>
        );
      })}
    </defs>
  );
});

/** Golvende lijn door de punten (zachte isolatie zoals minerale wol). */
function wave(pts: Vec[]): string {
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    d += `Q${a.x} ${a.y} ${m.x} ${m.y}`;
  }
  const last = pts[pts.length - 1];
  return d + `L${last.x} ${last.y}`;
}

/**
 * Ruimtes en muren in wereldcoördinaten, als bouwplan: wit papier, muren
 * doorgesneden met hun lagen en arcering, dikke snijlijnen op de muurvlakken.
 */
export const FloorLayer = memo(function FloorLayer({
  analysis,
  selection,
  hover,
  underlay,
}: {
  analysis: FloorAnalysis;
  selection: Selection;
  hover: Selection;
  /** Foto of plan om over te trekken: boven de ruimtes, onder de muren. */
  underlay?: React.ReactNode;
}) {
  const sel = (k: string, id: Id) => selection?.kind === k && selection.id === id;
  const hov = (k: string, id: Id) => hover?.kind === k && hover.id === id;
  const drawing = useMemo(() => {
    const byMaterial = new Map<Material, string>();
    for (const l of analysis.layers) byMaterial.set(l.material, (byMaterial.get(l.material) ?? "") + path(l.poly));
    return {
      walls: [...analysis.wallPolys.values()].map(path).join(""),
      byMaterial: [...byMaterial.entries()],
      lines: [...analysis.layerLines, ...analysis.joints].map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join(""),
      hard: analysis.insulation.filter((i) => !i.soft).map((i) => `M${i.pts.map((p) => `${p.x} ${p.y}`).join("L")}`).join(""),
      soft: analysis.insulation.filter((i) => i.soft).map((i) => wave(i.pts)).join(""),
      outline: [
        ...analysis.rooms.map((r) => path(r.inner)),
        ...analysis.outerContours.map(path),
        ...analysis.looseWalls.map((id) => path(analysis.wallPolys.get(id) ?? [])),
      ].join(""),
    };
  }, [analysis]);
  return (
    <g>
      {analysis.rooms.map((r) => (
        <path key={r.room.id} d={path(r.inner)} fill={sel("room", r.room.id) ? "var(--accent-soft)" : "var(--plan-paper)"} />
      ))}
      {analysis.rooms.map((r) =>
        hov("room", r.room.id) && !sel("room", r.room.id) ? (
          <path key={`h-${r.room.id}`} d={path(r.inner)} fill="var(--accent)" opacity={0.06} />
        ) : null,
      )}
      {underlay}
      {/* doorgesneden muren: papier, dan per laag de arcering van het materiaal */}
      <path d={drawing.walls} fill="var(--plan-paper)" data-walls="" />
      {drawing.byMaterial.map(([m, d]) =>
        HATCH[m] ? <path key={m} d={d} fill={`url(#hatch-${m})`} /> : null,
      )}
      <path d={drawing.lines} fill="none" stroke="var(--plan-ink)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      {drawing.hard && (
        <path d={drawing.hard} fill="none" stroke="var(--plan-hatch)" strokeWidth={0.6} strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
      )}
      {drawing.soft && (
        <path d={drawing.soft} fill="none" stroke="var(--plan-hatch)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      )}
      {[...analysis.wallPolys.entries()].map(([id, poly]) =>
        sel("wall", id) || hov("wall", id) ? (
          <path key={id} d={path(poly)} fill="var(--accent)" opacity={sel("wall", id) ? 0.45 : 0.25} />
        ) : null,
      )}
      {/* snijlijnen: dik, precies op de muurvlakken */}
      <path
        d={drawing.outline}
        fill="none"
        stroke="var(--plan-ink)"
        strokeWidth={1.6}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
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
  conflicts,
}: {
  shapes: OpeningShape[];
  selection: Selection;
  hover: Selection;
  ghost: OpeningShape | null;
  /** Deuren die tegen iets slaan: in rood. */
  conflicts: Map<Id, unknown>;
}) {
  return (
    <g pointerEvents="none">
      {shapes.map((sh) => (
        <OpeningSymbol
          key={sh.opening.id}
          shape={sh}
          warn={conflicts.has(sh.opening.id)}
          state={
            selection?.kind === "opening" && selection.id === sh.opening.id
              ? "selected"
              : hover?.kind === "opening" && hover.id === sh.opening.id
                ? "hover"
                : "normal"
          }
        />
      ))}
      {ghost && <OpeningSymbol shape={ghost} state="ghost" warn={false} />}
    </g>
  );
});

const line = (a: Vec, b: Vec) => `M${a.x} ${a.y}L${b.x} ${b.y}`;

function OpeningSymbol({
  shape,
  state,
  warn,
}: {
  shape: OpeningShape;
  state: "normal" | "hover" | "selected" | "ghost";
  warn: boolean;
}) {
  const ink =
    state === "selected" || state === "ghost" ? "var(--accent)" : warn ? "var(--danger)" : "var(--plan-ink)";
  const segs = (list: [Vec, Vec][]) => list.map(([a, b]) => line(a, b)).join("");
  const polys = (list: Vec[][]) => list.map(path).join("");
  return (
    <g opacity={state === "ghost" ? 0.9 : 1}>
      {/* uitsparing in de muur, en het muurvlak dat niet doorloopt */}
      <path d={path(shape.cut)} fill="var(--plan-paper)" />
      <path d={segs(shape.erase)} stroke="var(--plan-paper)" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
      {state === "hover" && <path d={path(shape.cut)} fill="var(--accent)" opacity={0.18} />}
      {shape.rebates.length > 0 && <path d={polys(shape.rebates)} fill="url(#hatch-gevelsteen)" />}
      {/* dorpel en vensterbank liggen onder de snede: dun */}
      {shape.thin.length > 0 && <path d={segs(shape.thin)} stroke={ink} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />}
      {shape.frames.length > 0 && (
        <path d={polys(shape.frames)} fill="var(--plan-paper)" stroke={ink} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
      )}
      {shape.glass.length > 0 && <path d={segs(shape.glass)} stroke={ink} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />}
      {shape.leaves.map((l, i) => (
        <g key={i}>
          {warn && state === "normal" && (
            <path
              d={`M${l.hinge.x} ${l.hinge.y}L${l.tip.x} ${l.tip.y}A${l.radius} ${l.radius} 0 0 ${l.sweep} ${l.to.x} ${l.to.y}Z`}
              fill="var(--danger)"
              opacity={0.12}
            />
          )}
          <path
            d={`M${l.tip.x} ${l.tip.y}A${l.radius} ${l.radius} 0 0 ${l.sweep} ${l.to.x} ${l.to.y}`}
            fill="none"
            stroke={ink}
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      {shape.panels.length > 0 && (
        <path d={polys(shape.panels)} fill="var(--plan-paper)" stroke={ink} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
      )}
      {shape.dashed.length > 0 && (
        <path d={segs(shape.dashed)} stroke={ink} strokeWidth={0.7} strokeDasharray="5 4" fill="none" vectorEffect="non-scaling-stroke" />
      )}
      {/* dagkanten en aanslag: snijlijnen, even dik als de muurvlakken */}
      <path d={segs(shape.cutLines)} stroke={ink} strokeWidth={1.6} strokeLinecap="square" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/**
 * Aanduiding bij ramen zoals op een bouwplan, buiten tegen de gevel:
 * breedte/hoogte in cm en de borstwering ("120/135 · bw 90").
 */
export function OpeningLabels({ shapes, view }: { shapes: OpeningShape[]; view: Viewport }) {
  const cm = (mm: number) => Math.round(mm / 10);
  return (
    <g pointerEvents="none">
      {shapes.map((sh) => {
        const o = sh.opening;
        if (o.kind !== "window" || o.width * view.zoom < 34) return null;
        // buiten de dorpel (4 cm) en nog een klein stukje verder
        const p = toScreen(view, sh.farFace);
        const extra = 40 * view.zoom + 9;
        const at = { x: p.x - sh.out.x * extra, y: p.y - sh.out.y * extra };
        let angle = (Math.atan2(sh.d.y, sh.d.x) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle <= -90) angle += 180;
        const text = `${cm(o.width)}/${cm(o.height)}${o.sillHeight > 0 ? ` · bw ${cm(o.sillHeight)}` : ""}`;
        return (
          <text
            key={o.id}
            x={at.x}
            y={at.y}
            transform={`rotate(${angle} ${at.x} ${at.y})`}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10.5}
            className="tabular"
            fill="var(--text-2)"
          >
            {text}
          </text>
        );
      })}
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

/** Hoek in graden zodat tekst langs een lijn leesbaar blijft (van links of van onder te lezen). */
function readable(dx: number, dy: number): number {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a > 90) a -= 180;
  if (a <= -90) a += 180;
  return a;
}

/** Maatgetal met een witte rand, zodat het leesbaar blijft boven arcering en lijnen. */
function DimText({
  at,
  angle,
  text,
  onClick,
  title,
}: {
  at: Vec;
  angle: number;
  text: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <g
      transform={`translate(${at.x} ${at.y}) rotate(${angle})`}
      data-ui={onClick ? "" : undefined}
      onPointerDown={onClick ? (e) => e.stopPropagation() : undefined}
      onClick={onClick}
      style={{ cursor: onClick ? "text" : undefined }}
      pointerEvents={onClick ? "all" : "none"}
      className={onClick ? "group" : undefined}
    >
      {title && <title>{title}</title>}
      {onClick && <rect x={-text.length * 3.6 - 4} y={-9} width={text.length * 7.2 + 8} height={14} rx={3} className="fill-transparent group-hover:fill-[var(--accent-soft)]" />}
      <text
        textAnchor="middle"
        y={1.5}
        fontSize={10.5}
        className={`tabular ${onClick ? "group-hover:fill-[var(--accent-text)]" : ""}`}
        fill="var(--plan-ink)"
        stroke="var(--plan-paper)"
        strokeWidth={3}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {text}
      </text>
    </g>
  );
}

/** Schuin streepje op een maatlijn, zoals architecten tekenen. */
function tick(p: Vec, d: Vec): string {
  const k = 4.2;
  const t = { x: (d.x - d.y) * k, y: (d.y + d.x) * k };
  return `M${p.x - t.x} ${p.y - t.y}L${p.x + t.x} ${p.y + t.y}`;
}

/**
 * Eén maatlijn in schermcoördinaten: van a naar b, met hulplijnen vanaf de
 * gemeten punten, schuine streepjes en het maatgetal aan de kant `side`.
 */
function DimLine({
  a,
  b,
  fromA,
  fromB,
  text,
  side,
  onClick,
  title,
  minPx = 0,
}: {
  a: Vec;
  b: Vec;
  fromA?: Vec;
  fromB?: Vec;
  text: string;
  side: Vec;
  onClick?: () => void;
  title?: string;
  minPx?: number;
}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return null;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const ext = (from: Vec | undefined, to: Vec) => {
    if (!from) return "";
    const v = { x: to.x - from.x, y: to.y - from.y };
    const l = Math.hypot(v.x, v.y);
    if (l < 3) return "";
    const u = { x: v.x / l, y: v.y / l };
    // klein gaatje bij het gemeten punt, en 3 px voorbij de maatlijn
    return `M${from.x + u.x * 4} ${from.y + u.y * 4}L${to.x + u.x * 3} ${to.y + u.y * 3}`;
  };
  const fits = len > Math.max(minPx, text.length * 6.2 + 6);
  const mid = { x: (a.x + b.x) / 2 + side.x * 7, y: (a.y + b.y) / 2 + side.y * 7 };
  return (
    <g>
      <path
        d={`M${a.x} ${a.y}L${b.x} ${b.y}${ext(fromA, a)}${ext(fromB, b)}`}
        stroke="var(--plan-ink)"
        strokeWidth={0.6}
        fill="none"
        pointerEvents="none"
      />
      <path d={tick(a, d) + tick(b, d)} stroke="var(--plan-ink)" strokeWidth={1.3} pointerEvents="none" />
      {fits && <DimText at={mid} angle={readable(d.x, d.y)} text={text} onClick={onClick} title={title} />}
    </g>
  );
}

/** Een opening in een gevel, voor de maatketting van de openingen. */
export interface FacadeOpening {
  /** Randen van de opening aan het buitenvlak (wereld). */
  edges: [Vec, Vec];
  /** Richting naar buiten (wereld). */
  outward: Vec;
}

/**
 * Ruimtenamen, oppervlaktes en maatvoering zoals op een bouwplan: binnenmaten
 * als maatlijnen in elke ruimte (klik om te wijzigen) en buitenmaten in
 * kettingen rond het gebouw. Tekst blijft altijd even groot.
 */
export function Annotations({
  analysis,
  view,
  onEditEdge,
  showDims,
  notes,
  openings = [],
}: {
  analysis: FloorAnalysis;
  view: Viewport;
  onEditEdge: (room: RoomInfo, a: Vec, b: Vec, at: Vec) => void;
  showDims: boolean;
  /** Korte waarschuwing onder de naam van een ruimte (bv. te weinig daglicht). */
  notes?: Map<Id, string>;
  openings?: FacadeOpening[];
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
    if (showDims && roomPx > 110) {
      for (const [i, { a, b }] of (edges.get(r.room.id) ?? []).entries()) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len * view.zoom < 50) continue;
        const sa = toScreen(view, a);
        const sb = toScreen(view, b);
        if (!onScreen(sa, 200) && !onScreen(sb, 200)) continue;
        // naar binnen: linkernormaal van de zijde (ruimtes zijn positief georiënteerd)
        const d = { x: (sb.x - sa.x) / (len * view.zoom), y: (sb.y - sa.y) / (len * view.zoom) };
        const n = { x: -d.y, y: d.x };
        const off = 16;
        const la = { x: sa.x + n.x * off, y: sa.y + n.y * off };
        const lb = { x: sb.x + n.x * off, y: sb.y + n.y * off };
        const textAt = { x: (la.x + lb.x) / 2 + n.x * 7, y: (la.y + lb.y) / 2 + n.y * 7 };
        out.push(
          <DimLine
            key={`${r.room.id}-${i}`}
            a={la}
            b={lb}
            fromA={sa}
            fromB={sb}
            side={n}
            text={formatDim(len)}
            title="Binnenmaat (ruwbouw). Klik om exact in te typen."
            onClick={() => onEditEdge(r, a, b, textAt)}
          />,
        );
      }
    }
    const big = Math.sqrt(r.area) * view.zoom > 70;
    if (!big || !onScreen(c)) continue;
    out.push(
      <g key={`${r.room.id}-label`} transform={`translate(${c.x} ${c.y})`} pointerEvents="none">
        <text textAnchor="middle" y={-3} fontSize={12.5} fontWeight={600} fill="var(--plan-ink)" letterSpacing={0.3}>
          {r.room.name.toUpperCase()}
        </text>
        <text textAnchor="middle" y={12} fontSize={11} fill="var(--plan-ink)" className="tabular">
          {formatPlanArea(r.area)}
        </text>
        {notes?.get(r.room.id) && (
          <text textAnchor="middle" y={27} fontSize={10.5} fill="var(--warn-text)">
            {notes.get(r.room.id)}
          </text>
        )}
      </g>,
    );
  }
  if (analysis.outerBounds && showDims) out.push(<OuterDims key="outer" analysis={analysis} view={view} openings={openings} />);
  return <g>{out}</g>;
}

/**
 * Buitenmaten in kettingen, aan elke zijde van het gebouw, van binnen naar
 * buiten: (1) de openingen in de gevel, (2) muren en ruimtes, (3) de totale
 * maat. Zoals op een bouwaanvraag.
 */
function OuterDims({ analysis, view, openings }: { analysis: FloorAnalysis; view: Viewport; openings: FacadeOpening[] }) {
  const b = analysis.outerBounds!;
  const tl = toScreen(view, { x: b.minX, y: b.minY });
  const br = toScreen(view, { x: b.maxX, y: b.maxY });
  if (br.x - tl.x < 60 && br.y - tl.y < 60) return null;
  const contour = analysis.outerContours.flat();
  const near = 900; // ruimtes tot zo ver van de gevel tellen mee in de ketting
  type Side = { key: string; horizontal: boolean; edge: number; outward: Vec };
  const sides: Side[] = [
    { key: "t", horizontal: true, edge: b.minY, outward: { x: 0, y: -1 } },
    { key: "b", horizontal: true, edge: b.maxY, outward: { x: 0, y: 1 } },
    { key: "l", horizontal: false, edge: b.minX, outward: { x: -1, y: 0 } },
    { key: "r", horizontal: false, edge: b.maxX, outward: { x: 1, y: 0 } },
  ];
  const out: React.ReactNode[] = [];
  for (const sd of sides) {
    const along = (p: Vec) => (sd.horizontal ? p.x : p.y);
    const across = (p: Vec) => (sd.horizontal ? p.y : p.x);
    const lo = sd.horizontal ? b.minX : b.minY;
    const hi = sd.horizontal ? b.maxX : b.maxY;
    const uniq = (vals: number[]) => [...new Set(vals.map((v) => Math.round(v)).filter((v) => v >= lo - 1 && v <= hi + 1))].sort((x, y) => x - y);
    const towardEdge = (p: Vec) => Math.abs(across(p) - sd.edge);
    // (2) muren en ruimtes: hoeken van de gevel en de binnenvlakken van ruimtes langs deze gevel
    const corners = contour.filter((p) => towardEdge(p) <= near * 2).map(along);
    const roomPts = analysis.rooms.flatMap((r) => r.inner.filter((p) => towardEdge(p) <= near).map(along));
    const walls = uniq([lo, hi, ...corners, ...roomPts]);
    // (1) openingen in de gevel aan deze kant
    const own = openings.filter((o) => o.outward.x * sd.outward.x + o.outward.y * sd.outward.y > 0.9);
    const opening = own.length ? uniq([lo, hi, ...corners, ...own.flatMap((o) => o.edges.map(along))]) : null;
    const tiers = [opening, walls.length > 2 ? walls : null, [lo, hi]].filter((t): t is number[] => t !== null);
    const sameAsPrev = (t: number[], i: number) => i > 0 && t.join() === tiers[i - 1].join();
    const base = 34;
    tiers.forEach((vals, i) => {
      if (sameAsPrev(vals, i)) return;
      const offset = base + i * 22;
      const edgeScreen = toScreen(view, sd.horizontal ? { x: 0, y: sd.edge } : { x: sd.edge, y: 0 });
      const line = (sd.horizontal ? edgeScreen.y : edgeScreen.x) + (sd.horizontal ? sd.outward.y : sd.outward.x) * offset;
      for (let k = 0; k + 1 < vals.length; k++) {
        const w0 = sd.horizontal ? { x: vals[k], y: sd.edge } : { x: sd.edge, y: vals[k] };
        const w1 = sd.horizontal ? { x: vals[k + 1], y: sd.edge } : { x: sd.edge, y: vals[k + 1] };
        const s0 = toScreen(view, w0);
        const s1 = toScreen(view, w1);
        const a = sd.horizontal ? { x: s0.x, y: line } : { x: line, y: s0.y };
        const bb = sd.horizontal ? { x: s1.x, y: line } : { x: line, y: s1.y };
        out.push(
          <DimLine
            key={`${sd.key}${i}-${k}`}
            a={a}
            b={bb}
            // hulplijnen enkel bij de binnenste ketting, vanaf de gevel
            fromA={i === 0 ? s0 : undefined}
            fromB={i === 0 ? s1 : undefined}
            side={sd.outward}
            text={formatDim(vals[k + 1] - vals[k])}
          />,
        );
      }
    });
  }
  return <g>{out}</g>;
}
