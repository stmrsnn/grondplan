"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatLength } from "@/lib/format";
import { gridLevels, niceScaleBar, panBy, toWorld, zoomAt, type Viewport } from "@/lib/editor/viewport";
import type { Vec } from "@/lib/geometry/vec";

export type PointerPhase = "down" | "move" | "up" | "hover" | "cancel" | "dblclick" | "click";

export interface ToolPointerEvent {
  phase: PointerPhase;
  /** Punt in de wereld (mm). */
  world: Vec;
  /** Punt op het scherm (px, t.o.v. het tekenvlak). */
  screen: Vec;
  shift: boolean;
  alt: boolean;
  pointerType: string;
}

export interface PlanCanvasProps {
  view: Viewport | null;
  onViewChange: (v: Viewport) => void;
  onResize: (w: number, h: number) => void;
  /**
   * Wordt opgeroepen bij aanraken/klikken. Geeft `true` terug als het
   * gereedschap de handeling overneemt; anders verschuift het blad.
   */
  onTool?: (e: ToolPointerEvent) => boolean;
  cursor?: string;
  /**
   * Bij tekenen met de vinger: het tekenpunt ligt zoveel pixels boven de
   * vinger, zodat je ziet waar je tekent in plaats van je vinger.
   */
  touchOffset?: number;
  /** Getekend in wereldcoördinaten (schaalt mee). */
  children?: ReactNode;
  /** Getekend in schermcoördinaten (labels blijven scherp en even groot). */
  overlay?: (view: Viewport) => ReactNode;
}

type Pt = { x: number; y: number };

/**
 * Het tekenvlak, in SVG: scherpe lijnen bij elke zoom, precieze klikdoelen.
 *
 * Bediening:
 *  - wieltje = zoomen rond de muis; trackpad: twee vingers schuiven, knijpen zoomt
 *  - middelste muisknop of spatiebalk ingedrukt + slepen = verschuiven
 *  - aanraakscherm: twee vingers = verschuiven en knijpen
 *  - al de rest gaat naar het actieve gereedschap; neemt dat niets over, dan verschuift het blad
 */
export function PlanCanvas({ view, onViewChange, onResize, onTool, cursor, touchOffset = 0, children, overlay }: PlanCanvasProps) {
  const ref = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ dist: number; mid: Pt } | null>(null);
  const mode = useRef<"none" | "pan" | "tool">("none");
  /** Waar het verschuiven begon: kort tikken zonder te bewegen telt als klik. */
  const panStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  const [space, setSpace] = useState(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => onResize(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onResize]);

  // spatiebalk ingedrukt houden = verschuiven
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target)) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

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
        const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
        onViewChange(zoomAt(v, p, factor));
      } else {
        onViewChange(panBy(v, -dx, -dy));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onViewChange]);

  const local = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const toolEvent = (phase: PointerPhase, e: React.PointerEvent | React.MouseEvent): ToolPointerEvent | null => {
    const v = viewRef.current;
    if (!v) return null;
    const raw = local(e);
    const pointerType = "pointerType" in e ? (e as React.PointerEvent).pointerType : "mouse";
    const s = pointerType === "touch" && touchOffset ? { x: raw.x, y: raw.y - touchOffset } : raw;
    return {
      phase,
      world: toWorld(v, s),
      screen: s,
      shift: e.shiftKey,
      alt: e.altKey,
      pointerType,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // klikken op labels en knoppen in de bovenlaag gaan niet naar het blad
    if ((e.target as Element).closest("[data-ui]")) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    ref.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));

    if (pointers.current.size === 2) {
      // tweede vinger: gereedschap annuleren, knijpen en verschuiven
      if (mode.current === "tool") {
        const te = toolEvent("cancel", e);
        if (te) onTool?.(te);
      }
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      mode.current = "pan";
      setPanning(true);
      return;
    }

    const forcePan = space || e.button === 1;
    if (!forcePan && onTool) {
      const te = toolEvent("down", e);
      if (te && onTool(te)) {
        mode.current = "tool";
        return;
      }
    }
    mode.current = "pan";
    panStart.current = { ...local(e), moved: false };
    setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const p = local(e);
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      // zweven zonder knop: voor de voorvertoning van het gereedschap
      if (e.pointerType === "mouse" && onTool) {
        const te = toolEvent("hover", e);
        if (te) onTool(te);
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    if (mode.current === "tool") {
      const te = toolEvent("move", e);
      if (te) onTool?.(te);
      return;
    }
    if (pointers.current.size === 1) {
      if (panStart.current && Math.hypot(p.x - panStart.current.x, p.y - panStart.current.y) > 4)
        panStart.current.moved = true;
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
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (mode.current === "tool" && pointers.current.size === 0) {
      const te = toolEvent(e.type === "pointercancel" ? "cancel" : "up", e);
      if (te) onTool?.(te);
    }
    if (mode.current === "pan" && pointers.current.size === 0 && panStart.current && !panStart.current.moved && e.type !== "pointercancel") {
      const te = toolEvent("click", e);
      if (te) onTool?.(te);
    }
    if (pointers.current.size === 0) panStart.current = null;
    if (pointers.current.size >= 1 && panStart.current) panStart.current.moved = true;
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      mode.current = "none";
      setPanning(false);
    }
  };

  const grid = view ? gridLevels(view.zoom) : null;
  const bar = view ? niceScaleBar(view.zoom) : null;
  const cur = panning ? "grabbing" : space ? "grab" : (cursor ?? "grab");

  return (
    <>
      <svg
        ref={ref}
        className="absolute inset-0 h-full w-full touch-none select-none bg-canvas"
        style={{ cursor: cur }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const te = toolEvent("dblclick", e);
          if (te) onTool?.(te);
        }}
        onContextMenu={(e) => e.preventDefault()}
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
            <g>{overlay?.(view)}</g>
          </>
        )}
      </svg>
      {bar && <ScaleBar px={bar.px} label={formatLength(bar.mm)} />}
    </>
  );
}

function GridPattern({ id, step, view, color }: { id: string; step: number; view: Viewport; color: string }) {
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
