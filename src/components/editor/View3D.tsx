"use client";

import { Footprints, Loader2, Rotate3d } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Vec } from "@/lib/geometry/vec";
import type { Floor, ProjectDoc } from "@/lib/model/types";
import { buildFloor3d, type Part } from "@/lib/three/build";
import type { Item3d, Viewer, ViewMode } from "./three/viewer";
import { finishColor, furnitureDef } from "@/lib/furniture/library";

/** Uit welke richting de zon komt (op het plan): het zuidwesten, volgens het noorden van het project. */
function sunDirection(northAngle: number): Vec {
  const t = (northAngle * Math.PI) / 180;
  const south = { x: -Math.sin(t), y: Math.cos(t) };
  const west = { x: -Math.cos(t), y: -Math.sin(t) };
  const v = { x: south.x + west.x * 0.8, y: south.y + west.y * 0.8 };
  const l = Math.hypot(v.x, v.y);
  return { x: v.x / l, y: v.y / l };
}

/**
 * Het plan in 3D: de verdieping die je bewerkt, met de verdiepingen eronder.
 * Klik een ruimte aan om haar vloer en muurkleur te kiezen.
 */
export function View3D({
  doc,
  floor,
  onPickRoom,
  onPickItem,
}: {
  doc: ProjectDoc;
  floor: Floor;
  onPickRoom: (roomId: string | null) => void;
  onPickItem?: (itemId: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const framed = useRef(false);
  const [mode, setMode] = useState<ViewMode>("doll");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Het model staat in de scène (voor de testen en het laadbericht). */
  const [built, setBuilt] = useState(false);
  const pick = useRef(onPickRoom);
  const pickItem = useRef(onPickItem);
  useEffect(() => {
    pick.current = onPickRoom;
    pickItem.current = onPickItem;
  }, [onPickRoom, onPickItem]);

  const parts = useMemo<Part[]>(() => {
    const floors = doc.floors.filter((f) => f.elevation <= floor.elevation).sort((a, b) => a.elevation - b.elevation);
    return floors.flatMap((f) => buildFloor3d(f, { facade: doc.settings.facade, elevation: f.elevation }));
  }, [doc.floors, doc.settings.facade, floor.elevation]);
  const sun = useMemo(() => sunDirection(doc.settings.northAngle), [doc.settings.northAngle]);
  const items = useMemo<Item3d[]>(() => {
    const out: Item3d[] = [];
    for (const f of doc.floors) {
      if (f.elevation > floor.elevation) continue;
      for (const it of f.items) {
        const def = furnitureDef(it.libraryRef);
        if (!def) continue;
        out.push({ id: it.id, def, x: it.x, y: f.elevation, z: it.y, rotation: it.rotation, width: it.width, depth: it.depth, height: it.height, color: finishColor(def, it.color).color });
      }
    }
    return out;
  }, [doc.floors, floor.elevation]);

  // de kijker aanmaken (three.js wordt pas nu geladen)
  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    import("./three/viewer")
      .then(({ Viewer }) => {
        if (!alive || !host.current) return;
        try {
          viewer.current = new Viewer(host.current, { onPickRoom: (id) => pick.current(id), onPickItem: (id) => pickItem.current?.(id) });
        } catch {
          setFailed(true);
          return;
        }
        ro = new ResizeObserver(() => viewer.current?.resize());
        ro.observe(host.current);
        setLoaded(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      ro?.disconnect();
      viewer.current?.dispose();
      viewer.current = null;
      framed.current = false;
    };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!loaded || !v) return;
    v.setParts(parts, sun);
    v.setItems(items);
    if (!framed.current) {
      v.frame();
      framed.current = true;
      setBuilt(true);
    }
  }, [loaded, parts, sun, items]);

  useEffect(() => {
    if (loaded) viewer.current?.setMode(mode);
  }, [loaded, mode]);

  return (
    <div className="absolute inset-0 z-10 bg-canvas" data-view3d={built ? "klaar" : "laden"}>
      <div ref={host} className="absolute inset-0" />
      {!loaded && !failed && (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 3D wordt opgebouwd…
          </span>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-2">
          Je browser kan geen 3D tonen (WebGL staat uit of wordt niet ondersteund).
        </div>
      )}
      {loaded && (
        <>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
            <div
              className="flex rounded-[var(--radius-control)] border border-line bg-bg p-0.5 text-[13px] shadow-[var(--shadow-float)]"
              role="radiogroup"
              aria-label="Manier van kijken"
            >
              {(
                [
                  ["doll", "Poppenhuis", <Rotate3d key="d" size={16} />],
                  ["walk", "Rondwandelen", <Footprints key="w" size={16} />],
                ] as const
              ).map(([m, label, icon]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex h-9 items-center gap-1.5 rounded-[6px] px-3 ${mode === m ? "bg-accent text-on-accent" : "text-ink-2 hover:text-ink"}`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            <p className="rounded-full bg-bg/85 px-3 py-1 text-center text-[12px] text-ink-2 shadow-sm backdrop-blur">
              {mode === "doll"
                ? "Sleep om rond te draaien, scroll of knijp om te zoomen. Klik een ruimte om vloer en muurkleur te kiezen."
                : "Klik op de vloer om erheen te wandelen, sleep om rond te kijken. Of gebruik de pijltjes of W A S D."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
