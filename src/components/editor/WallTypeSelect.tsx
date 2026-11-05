"use client";

import { Pencil } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { customWallTypes, isCustomType, MATERIAL_LABEL, WALL_TYPES, typeThickness, wallType, type Layer } from "@/lib/model/wallTypes";
import { useWallTypeEditor } from "./WallTypeDialog";

const selectCls =
  "h-10 w-full rounded-[var(--radius-control)] border border-line bg-bg px-3 text-sm text-ink hover:border-line-strong focus:border-accent focus:outline-none";

const cm = (mm: number) => (mm / 10).toLocaleString("nl-BE", { maximumFractionDigits: 1 });

/** Opbouw van een muur in woorden en als staafje: "9 gevelsteen · 3 spouw · …". */
export function LayerStack({ layers }: { layers: Layer[] }) {
  const total = layers.reduce((s, l) => s + l.thickness, 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-3 overflow-hidden rounded-[3px] border border-line" aria-hidden="true">
        {layers.map((l, i) => (
          <div
            key={i}
            style={{
              width: `${(l.thickness / total) * 100}%`,
              background:
                l.material === "isolatie" || l.material === "wol"
                  ? "var(--warn-bg)"
                  : l.material === "spouw"
                    ? "var(--plan-paper)"
                    : l.material === "gevelsteen"
                      ? "var(--border-strong)"
                      : "var(--border)",
            }}
            title={MATERIAL_LABEL[l.material]}
          />
        ))}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-3">
        {layers
          .map((l) => {
            const name = MATERIAL_LABEL[l.material];
            return `${cm(l.thickness)} cm ${name[0].toLowerCase()}${name.slice(1)}`;
          })
          .join(" · ")}
        {layers.length > 1 && ` = ${cm(total)} cm`}
      </p>
    </div>
  );
}

/**
 * Keuze van de muuropbouw. Gevels bovenaan, binnenmuren eronder. "Eigen
 * dikte" betekent: één laag metselwerk van een zelfgekozen dikte.
 */
export function WallTypeSelect({
  label,
  value,
  onChange,
  allowCustom,
}: {
  label: string;
  value: string | undefined;
  onChange: (typeId: string) => void;
  allowCustom?: boolean;
}) {
  const t = wallType(value);
  const editor = useWallTypeEditor();
  const own = customWallTypes();
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <span className="flex gap-1">
      <select
        className={selectCls}
        value={t ? t.id : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__nieuw") editor?.({ onCreated: onChange });
          else if (v) onChange(v);
        }}
      >
        {allowCustom && !t && <option value="">Eigen dikte</option>}
        <optgroup label="Gevels">
          {WALL_TYPES.filter((w) => w.exterior).map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Binnenmuren">
          {WALL_TYPES.filter((w) => !w.exterior).map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </optgroup>
        {own.length > 0 && (
          <optgroup label="Eigen muurtypes">
            {own.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </optgroup>
        )}
        {editor && <option value="__nieuw">＋ Nieuw muurtype…</option>}
      </select>
      {editor && isCustomType(t?.id) && (
        <IconButton label="Dit muurtype bewerken" onClick={() => editor({ edit: t!.id })}>
          <Pencil size={16} />
        </IconButton>
      )}
      </span>
      {t && <span className="text-[12px] text-ink-3">{t.hint}</span>}
    </label>
  );
}

export { typeThickness };
