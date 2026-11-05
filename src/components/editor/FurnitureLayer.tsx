"use client";

import { memo } from "react";
import { furnitureDef, type FurnitureDef } from "@/lib/furniture/library";
import { planSymbol, type PlanSymbol } from "@/lib/furniture/symbol";
import type { Item } from "@/lib/model/types";
import type { Selection } from "./PlanLayers";

const cache = new Map<string, PlanSymbol>();
/** Lijntekening, onthouden per soort en maat. */
export function symbolFor(def: FurnitureDef, w: number, d: number): PlanSymbol {
  const key = `${def.id}|${w}|${d}`;
  let s = cache.get(key);
  if (!s) {
    s = planSymbol(def, w, d);
    if (cache.size > 400) cache.clear();
    cache.set(key, s);
  }
  return s;
}

/** Een meubel als lijntekening (in mm, in de eigen assen). */
export function FurnitureSymbol({ def, w, d, accent = false }: { def: FurnitureDef; w: number; d: number; accent?: boolean }) {
  const ink = accent ? "var(--accent)" : "var(--plan-ink)";
  return (
    <>
      {symbolFor(def, w, d).map((layer, i) => (
        <g key={i}>
          {layer.outline && (
            <path d={layer.outline} fill={def.shape === "tapijt" ? "none" : "var(--plan-paper)"} stroke={ink} strokeWidth={0.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          )}
          {layer.lines && <path d={layer.lines} fill="none" stroke={ink} strokeWidth={0.45} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
          {layer.dashed && <path d={layer.dashed} fill="none" stroke={ink} strokeWidth={0.45} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
    </>
  );
}

function ItemShape({ item, selected, hover, ghost }: { item: Item; selected: boolean; hover: boolean; ghost?: boolean }) {
  const def = furnitureDef(item.libraryRef);
  if (!def) return null;
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
      opacity={ghost ? 0.75 : 1}
      data-item={ghost ? undefined : item.id}
      pointerEvents="none"
    >
      <FurnitureSymbol def={def} w={item.width} d={item.depth} accent={selected || ghost} />
      {(selected || hover) && !ghost && (
        <rect
          x={-item.width / 2 - 15}
          y={-item.depth / 2 - 15}
          width={item.width + 30}
          height={item.depth + 30}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={selected ? 1.5 : 1}
          strokeDasharray={selected ? undefined : "4 3"}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

/** Alle meubels van de verdieping; tapijten eerst (onderaan). */
export const FurnitureLayer = memo(function FurnitureLayer({
  items,
  selection,
  hover,
  ghost,
}: {
  items: Item[];
  selection: Selection;
  hover: Selection;
  ghost?: Item | null;
}) {
  return (
    <g data-furniture="">
      {items.map((it) => (
        <ItemShape key={it.id} item={it} selected={selection?.kind === "item" && selection.id === it.id} hover={hover?.kind === "item" && hover.id === it.id} />
      ))}
      {ghost && <ItemShape item={ghost} selected={false} hover={false} ghost />}
    </g>
  );
});
