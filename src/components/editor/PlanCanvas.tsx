"use client";

import { useEffect, useRef, useState } from "react";
import { formatLength } from "@/lib/format";
import {
  gridLevels,
  niceScaleBar,
  panBy,
  zoomAt,
  type Viewport,
} from "@/lib/editor/viewport";

export interface PlanCanvasProps {
  view: Viewport | null;
  onViewChange: (v: Viewport) => void;
  onResize: (w: number, h: number) => void;
  children?: React.ReactNode;
}

type Pt = { x: number; y: number };

/**
 * Het tekenvlak. Tekent in SVG: scherpe lijnen bij elke zoom, precieze
 * klikdoelen en later rechtstreeks bruikbaar voor pdf-uitvoer.
 *
 * Bediening:
 *  - muis: slepen = verschuiven, wieltje = zoomen rond de muis
 *  - trackpad: twee vingers = verschuiven, knijpen = zoomen
 *  - aanraakscherm: één vinger = verschuiven, twee vingers = knijpen en verschuiven
 */
export function PlanCanvas({ view, onViewChange, onResize, children }: PlanCanvasProps) {
  const ref = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ dist: number; mid: Pt } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // grootte volgen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => onResize(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onResize]);

  // wieltje en trackpad (niet-passief, zodat de pagina zelf niet scrolt of zoomt)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (!v) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const isMouseWheel = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(dy));
      if (e.ctrlKey || e.metaKey || isMouseWheel) {
        // knijpen op een trackpad komt binnen als ctrl + wiel
        const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
        onViewChange(zoomAt(v, p, factor));
      } else {
        onViewChange(panBy(v, -dx, -dy));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onViewChange]);

  const local = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    ref.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    const v = viewRef.current;
    if (!prev || !v) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      onViewChange(panBy(v, p.x - prev.x, p.y - prev.y));
    } else if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(v, mid, dist / Math.max(pinch.current.dist, 1));
      onViewChange(panBy(zoomed, mid.x - pinch.current.mid.x, mid.y - pinch.current.mid.y));
      pinch.current = { dist, mid };
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  };

  const grid = view ? gridLevels(view.zoom) : null;
  const bar = view ? niceScaleBar(view.zoom) : null;

  return (
    <>
    <svg
      ref={ref}
      className="absolute inset-0 h-full w-full touch-none select-none bg-canvas"
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
      aria-label="Tekenvlak. Sleep om te verschuiven, gebruik het wieltje of twee vingers om te zoomen."
    >
      {view && grid && (
        <>
          <defs>
            {grid.minor && (
              <GridPattern id="grid-minor" step={grid.minor * view.zoom} view={view} color="var(--grid-minor)" />
            )}
            <GridPattern id="grid-major" step={grid.major * view.zoom} view={view} color="var(--grid-major)" />
          </defs>
          {grid.minor && <rect width="100%" height="100%" fill="url(#grid-minor)" />}
          <rect width="100%" height="100%" fill="url(#grid-major)" />
          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>{children}</g>
        </>
      )}
    </svg>
    {bar && <ScaleBar px={bar.px} label={formatLength(bar.mm)} />}
    </>
  );
}

function GridPattern({
  id,
  step,
  view,
  color,
}: {
  id: string;
  step: number;
  view: Viewport;
  color: string;
}) {
  return (
    <pattern
      id={id}
      width={step}
      height={step}
      patternUnits="userSpaceOnUse"
      patternTransform={`translate(${view.panX % step} ${view.panY % step})`}
    >
      <path d={`M ${step} 0 L 0 0 0 ${step}`} fill="none" stroke={color} strokeWidth={1} shapeRendering="crispEdges" />
    </pattern>
  );
}

/** Schaalstok linksonder, zodat je altijd weet hoe groot iets is. */
function ScaleBar({ px, label }: { px: number; label: string }) {
  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 flex flex-col items-center gap-0.5 rounded-[6px] bg-bg/85 px-2 pb-1.5 pt-1"
      aria-label={`Schaal: dit streepje is ${label}`}
    >
      <span className="tabular text-[11px] text-ink-2">{label}</span>
      <svg width={px} height={6} aria-hidden="true" className="overflow-visible">
        <path d={`M0.75 0 V5.25 H${px - 0.75} V0`} fill="none" stroke="var(--text-2)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
