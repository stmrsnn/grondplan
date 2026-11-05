"use client";

import { Pencil, Plus } from "lucide-react";
import { choiceInfo, choicePreview, customChoices, DOOR_CHOICES, WINDOW_CHOICES, type OpeningChoice } from "@/lib/geometry/openings";
import { useFrameEditor } from "./FrameDialog";
import { FramePreview } from "./FramePreview";

/**
 * De soorten ramen of deuren als kleine vooraanzichten om uit te kiezen, met
 * je eigen soorten erbij en een tegel om er zelf een samen te stellen.
 */
export function ChoiceTiles({
  group,
  value,
  onPick,
  columns = 3,
}: {
  group: "door" | "window";
  value: OpeningChoice | null;
  onPick: (c: OpeningChoice) => void;
  columns?: number;
}) {
  const openEditor = useFrameEditor();
  const builtIn = group === "door" ? DOOR_CHOICES : WINDOW_CHOICES;
  const own = customChoices(group);
  const tile = (c: OpeningChoice, own: boolean) => {
    const info = choiceInfo(c);
    if (!info) return null;
    const pv = choicePreview(c);
    const on = value === c;
    return (
      <div key={c} className="relative">
        <button
          type="button"
          role="radio"
          aria-checked={on}
          aria-label={info.label}
          title={info.label}
          onClick={() => onPick(c)}
          className={`flex h-[86px] w-full flex-col items-center justify-between gap-0.5 rounded-[var(--radius-control)] border px-1 pb-1 pt-1.5 text-[10.5px] leading-[1.15] ${
            on ? "border-accent bg-accent-soft text-ink ring-1 ring-accent" : "border-line text-ink-2 hover:border-accent hover:bg-accent-soft"
          }`}
        >
          <span className="flex h-[40px] items-end justify-center">
            {pv ? (
              <FramePreview frame={pv.frame} width={pv.width} height={pv.height} maxW={56} maxH={40} label={info.label} />
            ) : (
              <span className="block h-[34px] w-[46px] border-[1.5px] border-b-0 border-[var(--plan-ink)]" aria-hidden />
            )}
          </span>
          <span className="line-clamp-2 text-center [overflow-wrap:anywhere]">{info.label}</span>
        </button>
        {own && openEditor && (
          <button
            type="button"
            aria-label={`${info.label} bewerken`}
            title="Bewerken"
            onClick={() => openEditor({ typeId: c })}
            className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-bg text-ink-3 shadow-sm hover:text-ink"
          >
            <Pencil size={11} />
          </button>
        )}
      </div>
    );
  };
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Soort">
      {builtIn.map((c) => tile(c, false))}
      {own.map((c) => tile(c, true))}
      {openEditor && (
        <button
          type="button"
          onClick={() => openEditor({ group, onCreated: onPick })}
          className="flex h-[86px] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border border-dashed border-line-strong text-[10.5px] leading-tight text-ink-2 hover:border-accent hover:bg-accent-soft hover:text-ink"
        >
          <Plus size={16} />
          Zelf samenstellen
        </button>
      )}
    </div>
  );
}
