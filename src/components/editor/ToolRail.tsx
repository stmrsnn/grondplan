"use client";

import { MousePointer2, PenLine, Square } from "lucide-react";
import { formatMeters } from "@/lib/format";
import type { WallDefaults } from "@/lib/model/types";
import type { Tool, WallChoice } from "./usePlanTools";

const TOOLS: { id: Tool; label: string; key: string; icon: React.ReactNode; hint: string }[] = [
  { id: "select", label: "Selecteren", key: "V", icon: <MousePointer2 size={18} />, hint: "Klik om te kiezen, sleep om te verschuiven" },
  { id: "room", label: "Kamer", key: "K", icon: <Square size={18} />, hint: "Sleep een rechthoek, of klik een hoek en typ 4x3" },
  { id: "wall", label: "Muur", key: "M", icon: <PenLine size={18} />, hint: "Klik punt na punt; typ een lengte en Enter" },
];

/**
 * Gereedschap links op het tekenvlak. Met een woord erbij, zodat niemand moet
 * raden wat een icoon betekent, en met de sneltoets voor wie snel wil werken.
 */
export function ToolRail({
  tool,
  setTool,
  wallChoice,
  setWallChoice,
  buffer,
  defaults,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  wallChoice: WallChoice;
  setWallChoice: (w: WallChoice) => void;
  buffer: string;
  defaults: WallDefaults;
}) {
  const active = TOOLS.find((t) => t.id === tool)!;
  return (
    <div className="pointer-events-none absolute left-3 top-16 flex items-start gap-2">
      <div
        role="toolbar"
        aria-label="Gereedschap"
        aria-orientation="vertical"
        className="pointer-events-auto flex flex-col gap-0.5 rounded-[var(--radius-card)] border border-line bg-bg p-1 shadow-[var(--shadow-float)]"
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tool === t.id}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
            className={`flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] text-[11px] ${
              tool === t.id ? "bg-accent text-on-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tool !== "select" && (
        <div className="pointer-events-auto flex max-w-[260px] flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-bg p-3 text-[12px] text-ink-2 shadow-[var(--shadow-float)]">
          <span>{active.hint}</span>
          {tool === "wall" && (
            <div className="flex rounded-[var(--radius-control)] bg-surface-2 p-0.5" role="radiogroup" aria-label="Soort muur">
              {(["interior", "exterior"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={wallChoice === k}
                  onClick={() => setWallChoice(k)}
                  className={`h-7 flex-1 rounded-[6px] px-2 ${
                    wallChoice === k ? "border border-line bg-bg font-medium text-ink" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {k === "interior" ? "Binnen" : "Buiten"} {formatMeters(k === "interior" ? defaults.interior : defaults.exterior).replace(" m", "")}
                </button>
              ))}
            </div>
          )}
          {buffer ? (
            <span className="tabular flex items-center gap-2 text-ink">
              <span className="rounded-[6px] border-2 border-accent px-2 py-0.5 font-semibold">{buffer}</span>
              Enter om te tekenen
            </span>
          ) : (
            <span className="text-ink-3">Esc stopt · Shift = vrije hoek</span>
          )}
        </div>
      )}
    </div>
  );
}
