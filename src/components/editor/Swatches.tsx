"use client";

import { Check } from "lucide-react";

/** Keuze uit staaltjes (vloer, muurkleur, gevel), met de naam eronder in een tooltip en voor schermlezers. */
export function Swatches({
  label,
  options,
  value,
  onPick,
  note,
}: {
  label: string;
  options: { id: string; label: string; background: string }[];
  value: string;
  onPick: (id: string) => void;
  /** Bv. de naam van de huidige keuze, of "standaard". */
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-2">
        {label}
        {note && <span className="truncate text-[12px] font-normal text-ink-3">{note}</span>}
      </span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.label}
              title={o.label}
              onClick={() => onPick(o.id)}
              className={`relative grid h-8 w-8 place-items-center rounded-[8px] border ${on ? "border-accent ring-2 ring-accent" : "border-line hover:border-line-strong"}`}
              style={{ background: o.background }}
            >
              {on && (
                <span className="grid h-4 w-4 place-items-center rounded-full bg-bg/90 text-accent-ink shadow-sm">
                  <Check size={11} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
