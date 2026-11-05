"use client";

import { FRAME_STILE, MULLION, sashWidths, type Frame, type Sash } from "@/lib/model/frames";

/**
 * Vooraanzicht van een raam of deur, zoals je het van binnen ziet, met de
 * gebruikelijke tekens: de driehoek wijst naar de scharnieren (draaien), naar
 * onder (kiepen) of allebei (draaikiep); een pijl bij een schuivend deel.
 */
export function FramePreview({
  frame,
  width,
  height,
  sill = 0,
  maxW,
  maxH,
  showFloor = false,
  label,
}: {
  frame: Frame;
  width: number;
  height: number;
  sill?: number;
  /** Grootte in px: de tekening past binnen maxW × maxH. */
  maxW: number;
  maxH: number;
  /** De vloer en de borstwering mee tekenen. */
  showFloor?: boolean;
  label?: string;
}) {
  const floorGap = showFloor ? sill : 0;
  const pad = Math.max(width, height) * 0.04;
  const boxW = width + 2 * pad;
  const boxH = height + floorGap + 2 * pad;
  const k = Math.min(maxW / boxW, maxH / boxH);
  const sashes = sashWidths(frame, width);
  const door = frame.sashes.some((s) => s.type === "deur");
  const th = frame.transom ? Math.min(frame.transom.height, height - 600) : 0;
    const thin = { stroke: "var(--plan-ink)", strokeWidth: 0.7, vectorEffect: "non-scaling-stroke" as const, fill: "none" };
  // begin van elk vak
  const starts = sashes.map((_, i) => sashes.slice(0, i).reduce((sum, w) => sum + w, 0));
  return (
    <svg
      width={boxW * k}
      height={boxH * k}
      viewBox={`${-pad} ${-pad} ${boxW} ${boxH}`}
      role="img"
      aria-label={label ?? "Vooraanzicht"}
      className="shrink-0"
    >
      <rect x={0} y={0} width={width} height={height} fill="var(--plan-paper)" stroke="var(--plan-ink)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {frame.transom && th > 0 && (
        <Pane
          kind={frame.transom.type}
          x0={FRAME_STILE}
          x1={width - FRAME_STILE}
          y0={FRAME_STILE}
          y1={th - MULLION / 2}
          thin={thin}
        />
      )}
      {frame.transom && th > 0 && <rect x={FRAME_STILE} y={th - MULLION / 2} width={width - 2 * FRAME_STILE} height={MULLION} fill="none" {...{ stroke: thin.stroke, strokeWidth: 0.5, vectorEffect: thin.vectorEffect }} />}
      {sashes.map((w, i) => {
        const s = frame.sashes[i];
        const first = i === 0;
        const last = i === sashes.length - 1;
        const x = starts[i];
        const x0 = x + (first ? FRAME_STILE : MULLION / 2);
        const x1 = x + w - (last ? FRAME_STILE : MULLION / 2);
        const y0 = th > 0 ? th + MULLION / 2 : FRAME_STILE;
        // een deur heeft onderaan enkel een lage dorpel
        const y1 = height - (door ? 20 : FRAME_STILE);
        return (
          <g key={i}>
            {!last && (
              <rect x={x + w - MULLION / 2} y={y0} width={MULLION} height={y1 - y0} fill="none" stroke="var(--plan-ink)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            )}
            <Pane sash={s} kind={s.type} x0={x0} x1={x1} y0={y0} y1={y1} thin={thin} />
          </g>
        );
      })}
      {showFloor && (
        <>
          <line x1={-pad} x2={width + pad} y1={height + floorGap} y2={height + floorGap} stroke="var(--plan-ink)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          {floorGap > 0 && <line x1={-pad * 0.6} x2={width + pad * 0.6} y1={height + 25} y2={height + 25} {...thin} />}
        </>
      )}
    </svg>
  );
}

function Pane({
  sash,
  kind,
  x0,
  x1,
  y0,
  y1,
  thin,
}: {
  sash?: Sash;
  kind: Sash["type"];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  thin: { stroke: string; strokeWidth: number; vectorEffect: "non-scaling-stroke"; fill: string };
}) {
  const opening = kind !== "vast";
  // een vleugel heeft zijn eigen profiel binnen het kader
  const inset = opening ? 45 : 0;
  const a = x0 + inset;
  const b = x1 - inset;
  const c = y0 + inset;
  const d = y1 - (kind === "deur" ? 0 : inset);
  const glass = kind !== "deur" || sash?.glass;
  const hingeLeft = (sash?.hinge ?? "left") === "left";
  const lines: string[] = [];
  const midY = (c + d) / 2;
  const midX = (a + b) / 2;
  if (kind === "draai" || kind === "draaikiep" || kind === "deur") {
    // driehoek: de punt wijst naar de scharnierkant
    const hx = hingeLeft ? a : b;
    const ox = hingeLeft ? b : a;
    lines.push(`M${ox} ${c}L${hx} ${midY}L${ox} ${d}`);
  }
  if (kind === "kiep" || kind === "draaikiep") lines.push(`M${a} ${c}L${midX} ${d}L${b} ${c}`);
  if (kind === "schuif") {
    const dir = hingeLeft ? -1 : 1;
    const len = Math.min((b - a) * 0.35, 400);
    const sx = midX - (dir * len) / 2;
    const ex = midX + (dir * len) / 2;
    const head = Math.min(60, len / 4);
    lines.push(`M${sx} ${midY}L${ex} ${midY}M${ex - dir * head} ${midY - head}L${ex} ${midY}L${ex - dir * head} ${midY + head}`);
  }
  return (
    <g>
      {opening && <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke="var(--plan-ink)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />}
      <rect
        x={a}
        y={c}
        width={Math.max(0, b - a)}
        height={Math.max(0, d - c)}
        fill={glass ? "var(--plan-glass)" : "var(--plan-paper)"}
        stroke="var(--plan-ink)"
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
      />
      {kind === "deur" && !sash?.glass && (
        <rect x={a + 120} y={c + 150} width={Math.max(0, b - a - 240)} height={Math.max(0, d - c - 300)} {...thin} strokeWidth={0.4} />
      )}
      {lines.length > 0 && <path d={lines.join("")} {...thin} />}
      {kind === "deur" && (
        // klink aan de kant tegenover de scharnieren, op 1,05 m
        <line x1={hingeLeft ? b - 70 : a + 70} x2={hingeLeft ? b - 70 : a + 70} y1={d - 1050} y2={d - 1050 + 160} stroke="var(--plan-ink)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
}
