"use client";

import { DoorOpen, Grid2x2, MousePointer2, PenLine, Square } from "lucide-react";
import { formatMeters } from "@/lib/format";
import { widthsFor } from "@/lib/geometry/openings";
import type { OpeningKind } from "@/lib/model/types";
import type { WallDefaults } from "@/lib/model/types";
import { ROOM_TEMPLATES, type RoomTemplate, type Tool, type WallChoice } from "./usePlanTools";

const TOOLS: { id: Tool; label: string; key: string; icon: React.ReactNode; hint: string }[] = [
  { id: "select", label: "Selecteren", key: "V", icon: <MousePointer2 size={18} />, hint: "Klik om te kiezen, sleep om te verschuiven" },
  { id: "room", label: "Kamer", key: "K", icon: <Square size={18} />, hint: "Sleep een rechthoek, of klik een hoek en typ 4x3" },
  { id: "wall", label: "Muur", key: "M", icon: <PenLine size={18} />, hint: "Klik punt na punt; typ een lengte en Enter" },
  { id: "door", label: "Deur", key: "D", icon: <DoorOpen size={18} />, hint: "Klik op een muur. De deur draait open naar de kant van je cursor." },
  { id: "window", label: "Raam", key: "R", icon: <Grid2x2 size={18} />, hint: "Klik op een muur om een raam te plaatsen" },
];

const cm = (mm: number) => `${Math.round(mm / 10)}`;

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
  template,
  setTemplate,
  doorKind,
  setDoorKind,
  openingWidth,
  setOpeningWidth,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  wallChoice: WallChoice;
  setWallChoice: (w: WallChoice) => void;
  buffer: string;
  defaults: WallDefaults;
  template: RoomTemplate | null;
  setTemplate: (t: RoomTemplate | null) => void;
  doorKind: "door" | "passage";
  setDoorKind: (k: "door" | "passage") => void;
  openingWidth: Record<OpeningKind, number | null>;
  setOpeningWidth: (w: Record<OpeningKind, number | null>) => void;
}) {
  const openingKind: OpeningKind | null = tool === "window" ? "window" : tool === "door" ? doorKind : null;
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
          <span>{template ? `Klik waar de linkerbovenhoek van de ${template.label.toLowerCase()} moet komen` : active.hint}</span>
          {tool === "room" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Standaardkamers</span>
              <div className="flex flex-wrap gap-1">
                {ROOM_TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    aria-pressed={template?.label === t.label}
                    onClick={() => setTemplate(t)}
                    title={`${t.label}: ${formatMeters(t.w)} × ${formatMeters(t.d)}`}
                    className={`rounded-full border px-2 py-0.5 text-[12px] ${
                      template?.label === t.label
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line text-ink hover:border-accent hover:bg-accent-soft"
                    }`}
                  >
                    {t.label} <span className={template?.label === t.label ? "" : "text-ink-3"}>{(t.w / 1000).toLocaleString("nl-BE")}×{(t.d / 1000).toLocaleString("nl-BE")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tool === "door" && (
            <div className="flex rounded-[var(--radius-control)] bg-surface-2 p-0.5" role="radiogroup" aria-label="Soort opening">
              {(["door", "passage"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={doorKind === k}
                  onClick={() => setDoorKind(k)}
                  className={`h-7 flex-1 rounded-[6px] px-2 ${
                    doorKind === k ? "border border-line bg-bg font-medium text-ink" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {k === "door" ? "Deur" : "Doorgang"}
                </button>
              ))}
            </div>
          )}
          {openingKind && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Breedte in cm</span>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  aria-pressed={openingWidth[openingKind] === null}
                  onClick={() => setOpeningWidth({ ...openingWidth, [openingKind]: null })}
                  title={openingKind === "door" ? "83 cm binnen, 100 cm in een buitenmuur" : "Standaardmaat"}
                  className={`rounded-full border px-2 py-0.5 text-[12px] ${
                    openingWidth[openingKind] === null ? "border-accent bg-accent text-on-accent" : "border-line text-ink hover:border-accent hover:bg-accent-soft"
                  }`}
                >
                  Vanzelf
                </button>
                {widthsFor(openingKind).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={openingWidth[openingKind] === w}
                    onClick={() => setOpeningWidth({ ...openingWidth, [openingKind]: w })}
                    className={`tabular rounded-full border px-2 py-0.5 text-[12px] ${
                      openingWidth[openingKind] === w ? "border-accent bg-accent text-on-accent" : "border-line text-ink hover:border-accent hover:bg-accent-soft"
                    }`}
                  >
                    {cm(w)}
                  </button>
                ))}
              </div>
            </div>
          )}
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
            <span className="text-ink-3">{openingKind ? "Esc stopt · daarna slepen om te verschuiven" : "Esc stopt · Shift = vrije hoek"}</span>
          )}
        </div>
      )}
    </div>
  );
}
